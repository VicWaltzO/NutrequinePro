import { valuationHundredths } from "./valuation.mjs";
import { activeAssignment, assignedHundredths } from "./assignment-balances.mjs";
import { date, pick, requireValue, text } from "../../../shared/domain/core.mjs";
import { nucleusHundredths } from "../../../shared/domain/production-quantities.mjs";
import { MICRO_FAMILIES, microFormulaRequirement } from "./formulas.mjs";

function fields(value, keys) {
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    "Datos de preparación inválidos.",
  );
  requireValue(
    Object.keys(value).every((key) => keys.includes(key)),
    "Campo de preparación no permitido.",
  );
}
function literal(value, label) {
  requireValue(typeof value === "string", `${label} debe ser texto explícito.`);
  return text(value, label);
}
// Private, explicit approval of an exact published recipe; no business defaults or seeds.
/** @param {unknown} value */
export function validatePreparationPolicies(value = []) {
  requireValue(Array.isArray(value) && value.length <= 1000, "Políticas de preparación inválidas.");
  const seen = new Set();
  return value.map((policy) => {
    fields(policy, ["formula_id", "family", "reference", "lines"]);
    const formula_id = literal(policy.formula_id, "Fórmula");
    requireValue(!seen.has(formula_id), "Política de fórmula duplicada.");
    seen.add(formula_id);
    requireValue(Object.hasOwn(MICRO_FAMILIES, policy.family), "Familia inválida.");
    requireValue(
      Array.isArray(policy.lines) && policy.lines.length > 0 && policy.lines.length <= 1000,
      "Política sin ingredientes válidos.",
    );
    const ingredients = new Set();
    const lines = policy.lines.map((line) => {
      fields(line, ["micro_ingredient_id", "dose_grams"]);
      const id = literal(line.micro_ingredient_id, "Microinsumo");
      requireValue(!ingredients.has(id), "Ingrediente de política duplicado.");
      ingredients.add(id);
      requireValue(
        Number.isSafeInteger(line.dose_grams) && line.dose_grams > 0 && line.dose_grams <= 1e12,
        "Dosis de política inválida.",
      );
      return { micro_ingredient_id: id, dose_grams: line.dose_grams };
    });
    return {
      formula_id,
      family: policy.family,
      reference: literal(policy.reference, "Referencia de autorización"),
      lines,
    };
  });
}
export function preparationAuthorization(s, formula, policies = []) {
  const policy = policies.find((p) => p.formula_id === formula.id && p.family === formula.family);
  const lines = s.microFormulaLines.filter((line) => line.formula_id === formula.id);
  return policy &&
    formula.published_at &&
    lines.length > 0 &&
    lines.length === policy.lines.length &&
    lines.every((line) =>
      policy.lines.some(
        (p) => p.micro_ingredient_id === line.micro_ingredient_id && p.dose_grams === line.dose_grams,
      ),
    )
    ? policy
    : null;
}
export function microPreparationCreate({ s, p, add, request_id, microPreparationPolicies }) {
  fields(p, ["family", "formula_id", "nuclei", "date", "expected_revision"]);
  requireValue(
    Number.isSafeInteger(p.expected_revision) && p.expected_revision === s.revision,
    "Los datos cambiaron. Recargue antes de planificar.",
  );
  requireValue(Object.hasOwn(MICRO_FAMILIES, p.family), "Familia de núcleo inválida.");
  const formula = pick(s, "microFormulas", literal(p.formula_id, "Fórmula"));
  const head = s.microFormulaHeads.find((h) => h.family === p.family);
  requireValue(
    formula.family === p.family && formula.published_at && head?.active_formula_id === formula.id,
    "Seleccione la fórmula publicada activa de esta familia.",
  );
  requireValue(
    typeof request_id === "string" && request_id.length > 0 && request_id.length <= 100,
    "Falta identificador de operación.",
  );
  const approval = preparationAuthorization(
    s,
    formula,
    validatePreparationPolicies(microPreparationPolicies),
  );
  requireValue(approval, "Fórmula incompleta o sin política privada de autorización para preparar.");
  const lines = s.microFormulaLines.filter((line) => line.formula_id === formula.id);
  requireValue(
    lines.every((line) => pick(s, "microIngredients", line.micro_ingredient_id).is_active),
    "La fórmula contiene microinsumos inactivos.",
  );
  requireValue(typeof p.nuclei === "string", "Cantidad de núcleos debe ser un decimal explícito.");
  const nuclei_hundredths = nucleusHundredths(p.nuclei);
  requireValue(nuclei_hundredths > 0, "Planifique al menos 0.01 núcleo.");
  microFormulaRequirement(lines, p.nuclei); // Validate exact range before persisting.
  return add("microPreparations", {
    family: p.family,
    formula_id: formula.id,
    nuclei_hundredths,
    date: date(literal(p.date, "Fecha")),
    status: "PENDING",
    authorization_reference: approval.reference,
    request_id,
  }).id;
}
export function evaluatePreparation(s, order, evaluated_at) {
  const lines = s.microFormulaLines.filter((line) => line.formula_id === order.formula_id);
  const requirements = microFormulaRequirement(lines, String(order.nuclei_hundredths / 100));
  const assignment = activeAssignment(s, order.id);
  const items = requirements.map((requirement, i) => {
    const id = requirement.micro_ingredient_id;
    const ledger = s.microLedgers.find(
      (row) => row.micro_ingredient_id === id && row.ledger.events.length > 0,
    );
    const opening = s.microOpenings.find((row) => row.micro_ingredient_id === id);
    const available = ledger ? valuationHundredths(ledger.ledger) : (opening?.quantity_grams ?? 0) * 100; // Up to 1e14: still an exact safe integer.
    const committed = assignedHundredths(s, id);
    const own = assignment
      ? (s.microAssignmentLines.find((l) => l.assignment_id === assignment.id && l.micro_ingredient_id === id)
          ?.quantity_hundredths ?? 0)
      : 0;
    const free = Math.max(0, available - committed);
    let stock_source = "UNRECORDED";
    if (ledger) stock_source = "LEDGER";
    else if (opening) stock_source = "OPENING";
    return {
      micro_ingredient_id: id,
      name: lines[i].name_snapshot,
      operational_id: lines[i].operational_id_snapshot,
      required_hundredths: requirement.grams_hundredths,
      physical_hundredths: available,
      assigned_hundredths: committed,
      own_assigned_hundredths: own,
      available_hundredths: free,
      missing_hundredths: Math.max(0, requirement.grams_hundredths - own - free),
      stock_source,
    };
  });
  return {
    id: order.id,
    status: s.microConfirmations.some((c) => c.preparation_id === order.id) ? "CONFIRMED" : "PENDING",
    confirmation_id: s.microConfirmations.find((c) => c.preparation_id === order.id)?.id ?? null,
    assignment_id: assignment?.id ?? null,
    assignment_status: assignment ? "ASSIGNED" : "UNASSIGNED",
    evaluated_at,
    revision: s.revision,
    sufficiency:
      items.length && items.every((item) => item.missing_hundredths === 0)
        ? "POTENTIALLY_RESUMABLE"
        : "MISSING",
    items,
  };
}
export function preparationOverview(s, policies, evaluated_at) {
  return {
    evaluated_at,
    revision: s.revision,
    authorizations: s.microFormulas
      .filter((f) => preparationAuthorization(s, f, policies))
      .map((f) => ({
        formula_id: f.id,
        family: f.family,
      })),
    orders: s.microPreparations.map((order) => evaluatePreparation(s, order, evaluated_at)),
  };
}
