import { pick, requireValue, text } from "../../../shared/domain/core.mjs";
import { microFormulaSave, microFormulaActivate, MICRO_FAMILIES } from "./formulas.mjs";
import { microPreparationCreate, preparationAuthorization } from "./preparations.mjs";
import { activeAssignment } from "./assignment-balances.mjs";
import { microAssignmentReverse } from "./assignments.mjs";

function fields(p, allowed) {
  requireValue(
    p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).every((k) => allowed.includes(k)),
    "Campos de sustitución inválidos.",
  );
}
const recipe = (lines) =>
  JSON.stringify(
    lines.map((l) => [l.micro_ingredient_id, l.dose_grams]).sort((a, b) => a[0].localeCompare(b[0])),
  );
/** @param {unknown} value */
export function validateSubstitutionPolicies(value = []) {
  requireValue(Array.isArray(value) && value.length <= 1000, "Políticas de sustitución inválidas.");
  const ids = new Set();
  return value.map((p) => {
    fields(p, ["id", "reference", "from_ingredient_id", "to_ingredient_id", "families"]);
    for (const key of ["id", "reference", "from_ingredient_id", "to_ingredient_id"])
      requireValue(
        typeof p[key] === "string" && p[key].trim() === p[key] && p[key].length > 0 && p[key].length <= 100,
        "Identidad de aprobación inválida.",
      );
    requireValue(
      !ids.has(p.id) && p.from_ingredient_id !== p.to_ingredient_id,
      "Política duplicada o identidades iguales.",
    );
    ids.add(p.id);
    fields(p.families, Object.keys(MICRO_FAMILIES));
    for (const family of Object.keys(MICRO_FAMILIES)) {
      const f = p.families[family];
      fields(f, ["source_formula_id", "lines"]);
      requireValue(
        typeof f.source_formula_id === "string" &&
          f.source_formula_id.length > 0 &&
          Array.isArray(f.lines) &&
          f.lines.length > 0 &&
          f.lines.length <= 1000,
        "Faltan ambas recetas aprobadas.",
      );
      const seen = new Set();
      for (const line of f.lines) {
        fields(line, ["micro_ingredient_id", "dose_grams"]);
        requireValue(
          typeof line.micro_ingredient_id === "string" &&
            line.micro_ingredient_id.length > 0 &&
            !seen.has(line.micro_ingredient_id) &&
            Number.isSafeInteger(line.dose_grams) &&
            line.dose_grams > 0 &&
            line.dose_grams <= 1e12,
          "Dosis aprobada inválida.",
        );
        seen.add(line.micro_ingredient_id);
      }
      requireValue(
        seen.has(p.to_ingredient_id) && !seen.has(p.from_ingredient_id),
        "Receta sustituta no corresponde a las identidades aprobadas.",
      );
    }
    return structuredClone(p);
  });
}
export function effectivePreparationPolicies(s, base = [], privatePolicies = []) {
  const result = [...base];
  for (const event of s.microSubstitutions ?? []) {
    const policy = privatePolicies.find(
      (p) => p.id === event.policy_id && p.reference === event.approval_reference,
    );
    if (!policy) continue;
    for (const family of Object.keys(MICRO_FAMILIES)) {
      const id = event[family === "ROSADO" ? "rosado_formula_id" : "verde_formula_id"];
      const formula = s.microFormulas.find((f) => f.id === id && f.family === family && f.published_at);
      const lines = s.microFormulaLines.filter((l) => l.formula_id === id);
      if (formula && recipe(lines) === recipe(policy.families[family].lines))
        result.push({
          formula_id: id,
          family,
          reference: policy.reference,
          lines: policy.families[family].lines,
        });
    }
  }
  return result;
}
export function assertSubstitutionIntegrity(before, after, privatePolicies = []) {
  for (const event of after.microSubstitutions) {
    if (before?.microSubstitutions.some((e) => e.id === event.id)) continue;
    const policy = validateSubstitutionPolicies(privatePolicies).find(
      (p) => p.id === event.policy_id && p.reference === event.approval_reference,
    );
    requireValue(
      policy &&
        policy.from_ingredient_id === event.from_ingredient_id &&
        policy.to_ingredient_id === event.to_ingredient_id,
      "Sustitución persistente sin aprobación privada exacta.",
    );
    for (const family of Object.keys(MICRO_FAMILIES)) {
      const rosado = family === "ROSADO";
      requireValue(
        event[rosado ? "source_rosado_id" : "source_verde_id"] === policy.families[family].source_formula_id,
        "Origen persistente sin aprobación.",
      );
      const id = event[rosado ? "rosado_formula_id" : "verde_formula_id"];
      requireValue(
        recipe(after.microFormulaLines.filter((l) => l.formula_id === id)) ===
          recipe(policy.families[family].lines),
        "Dosis persistente no aprobada.",
      );
    }
  }
}
function validate(c, keys) {
  fields(c.p, keys);
  requireValue(
    Number.isSafeInteger(c.p.expected_revision) && c.p.expected_revision === c.s.revision,
    "Los datos cambiaron. Recargue antes de continuar.",
  );
  requireValue(
    typeof c.request_id === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(c.request_id),
    "Identificador de operación inválido.",
  );
  requireValue(typeof c.p.reason === "string", "Indique motivo explícito.");
  return text(c.p.reason, "Motivo");
}
export function microSubstitute(c) {
  const reason = validate(c, ["policy_id", "reason", "expected_revision"]);
  const policy = validateSubstitutionPolicies(c.microSubstitutionPolicies).find(
    (p) => p.id === c.p.policy_id,
  );
  requireValue(policy, "Sustitución sin autorización técnica privada.");
  requireValue(
    !c.s.microSubstitutions.some((e) => e.policy_id === policy.id),
    "Esta aprobación ya fue aplicada.",
  );
  for (const id of [policy.from_ingredient_id, policy.to_ingredient_id])
    requireValue(pick(c.s, "microIngredients", id).is_active, "Ingrediente inactivo.");
  const ids = {};
  for (const family of Object.keys(MICRO_FAMILIES)) {
    const approved = policy.families[family];
    const head = c.s.microFormulaHeads.find((h) => h.family === family);
    requireValue(
      head?.active_formula_id === approved.source_formula_id,
      "La fórmula de origen cambió; requiere nueva aprobación.",
    );
    const source = pick(c.s, "microFormulas", approved.source_formula_id);
    requireValue(
      preparationAuthorization(c.s, source, c.microPreparationPolicies),
      "Receta de origen sin autorización vigente.",
    );
    const previousHeadVersion = head.version;
    const old = c.s.microFormulaLines.filter((l) => l.formula_id === source.id);
    requireValue(
      old.some((l) => l.micro_ingredient_id === policy.from_ingredient_id) &&
        !old.some((l) => l.micro_ingredient_id === policy.to_ingredient_id),
      "Origen de sustitución inválido.",
    );
    requireValue(
      recipe(old.filter((l) => l.micro_ingredient_id !== policy.from_ingredient_id)) ===
        recipe(approved.lines.filter((l) => l.micro_ingredient_id !== policy.to_ingredient_id)),
      "La aprobación intenta modificar otros ingredientes.",
    );
    const id = microFormulaSave({
      ...c,
      p: {
        family,
        expected_version: head.version,
        notes: `Sustitución autorizada ${policy.reference}`,
        lines: approved.lines.map((l) => ({
          micro_ingredient_id: l.micro_ingredient_id,
          dose_kg: (l.dose_grams / 1000).toFixed(3),
        })),
      },
    });
    microFormulaActivate({ ...c, p: { family, expected_version: head.version, formula_id: id } });
    // One atomic business operation advances the family's CAS token once.
    head.version = previousHeadVersion + 1;
    ids[family === "ROSADO" ? "rosado_formula_id" : "verde_formula_id"] = id;
  }
  return c.add("microSubstitutions", {
    policy_id: policy.id,
    approval_reference: policy.reference,
    from_ingredient_id: policy.from_ingredient_id,
    to_ingredient_id: policy.to_ingredient_id,
    source_rosado_id: policy.families.ROSADO.source_formula_id,
    source_verde_id: policy.families.VERDE_AMARILLO.source_formula_id,
    ...ids,
    reason,
    request_id: c.request_id,
  }).id;
}
export function microAdopt(c) {
  const reason = validate(c, ["preparation_id", "substitution_id", "consent", "reason", "expected_revision"]);
  requireValue(c.p.consent === true, "Se requiere consentimiento explícito para cambiar la receta.");
  const order = pick(c.s, "microPreparations", c.p.preparation_id);
  requireValue(
    !c.s.microConfirmations.some((e) => e.preparation_id === order.id) &&
      !c.s.microSupersessions.some((e) => e.source_id === order.id),
    "Orden cerrada o supersedida; historia inmutable.",
  );
  const event = pick(c.s, "microSubstitutions", c.p.substitution_id);
  const rosado = order.family === "ROSADO";
  requireValue(
    order.formula_id === event[rosado ? "source_rosado_id" : "source_verde_id"],
    "La sustitución no corresponde a la fórmula histórica.",
  );
  const target = event[rosado ? "rosado_formula_id" : "verde_formula_id"];
  const assignment = activeAssignment(c.s, order.id);
  if (assignment)
    microAssignmentReverse({
      ...c,
      p: { assignment_id: assignment.id, reason, expected_revision: c.s.revision },
    });
  const id = microPreparationCreate({
    ...c,
    p: {
      family: order.family,
      formula_id: target,
      nuclei: String(order.nuclei_hundredths / 100),
      date: order.date,
      expected_revision: c.s.revision,
    },
  });
  const link = c.s.microPreparationGroups.find((g) => g.preparation_id === order.id);
  if (link)
    c.add("microPreparationGroups", {
      preparation_id: id,
      group_reference: link.group_reference,
      reason,
      request_id: c.request_id,
    });
  return c.add("microSupersessions", {
    source_id: order.id,
    target_id: id,
    substitution_id: event.id,
    approval_reference: event.approval_reference,
    consent: true,
    reason,
    request_id: c.request_id,
  }).id;
}
export function microGroupLink(c) {
  const reason = validate(c, ["preparation_id", "group_reference", "reason", "expected_revision"]);
  const order = pick(c.s, "microPreparations", c.p.preparation_id);
  requireValue(
    !c.s.microPreparationGroups.some((g) => g.preparation_id === order.id),
    "La preparación ya tiene referencia de tanda.",
  );
  requireValue(
    typeof c.p.group_reference === "string" &&
      c.p.group_reference.trim().length > 0 &&
      c.p.group_reference.trim().length <= 100,
    "Referencia de tanda inválida.",
  );
  return c.add("microPreparationGroups", {
    preparation_id: order.id,
    group_reference: c.p.group_reference.trim(),
    reason,
    request_id: c.request_id,
  }).id;
}
