import { pick, requireValue, text } from "../../../shared/domain/core.mjs";
import {
  evaluatePreparation,
  preparationAuthorization,
  validatePreparationPolicies,
} from "./preparations.mjs";
import { activeAssignment } from "./assignment-balances.mjs";
function validate(s, p, keys, request_id) {
  requireValue(
    p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).every((k) => keys.includes(k)),
    "Campo de asignación no permitido.",
  );
  requireValue(
    Number.isSafeInteger(p.expected_revision) && p.expected_revision === s.revision,
    "Los datos cambiaron. Reevaluar materiales y seleccionar de nuevo la orden.",
  );
  requireValue(
    typeof request_id === "string" && request_id.length > 0 && request_id.length <= 100,
    "Falta identificador de operación.",
  );
  requireValue(typeof p.reason === "string", "Indique motivo explícito.");
  return text(p.reason, "Motivo");
}
export function microAssign({ s, p, add, request_id, microPreparationPolicies, clock }) {
  const reason = validate(s, p, ["preparation_id", "reason", "expected_revision"], request_id);
  const order = pick(s, "microPreparations", p.preparation_id);
  requireValue(
    !activeAssignment(s, order.id),
    "Esta orden ya tiene ingredientes asignados; no se duplicó la asignación.",
  );
  const formula = pick(s, "microFormulas", order.formula_id);
  const approval = preparationAuthorization(
    s,
    formula,
    validatePreparationPolicies(microPreparationPolicies),
  );
  requireValue(
    approval && formula.family === order.family,
    "Fórmula histórica sin política privada válida de autorización.",
  );
  const evaluation = evaluatePreparation(s, order, clock);
  for (const item of evaluation.items) {
    requireValue(
      pick(s, "microIngredients", item.micro_ingredient_id).is_active,
      `Microinsumo inactivo: ID ${item.operational_id}.`,
    );
    requireValue(
      item.missing_hundredths === 0,
      `Saldo libre insuficiente para ID ${item.operational_id}: faltan ${item.missing_hundredths} centésimas de gramo. Reevaluar materiales y seleccionar manualmente.`,
    );
  }
  requireValue(evaluation.items.length > 0, "Orden sin ingredientes.");
  const assignment = add("microAssignments", {
    preparation_id: order.id,
    request_id,
    reason,
    authorization_reference: approval.reference,
  });
  for (const item of evaluation.items)
    add("microAssignmentLines", {
      assignment_id: assignment.id,
      formula_line_id: s.microFormulaLines.find(
        (l) => l.formula_id === order.formula_id && l.micro_ingredient_id === item.micro_ingredient_id,
      ).id,
      micro_ingredient_id: item.micro_ingredient_id,
      quantity_hundredths: item.required_hundredths,
    });
  return assignment.id;
}
export function microAssignmentReverse({ s, p, add, request_id }) {
  const reason = validate(s, p, ["assignment_id", "reason", "expected_revision"], request_id);
  const assignment = pick(s, "microAssignments", p.assignment_id);
  requireValue(
    !s.microAssignmentReversals.some((r) => r.assignment_id === assignment.id),
    "La asignación ya fue revertida.",
  );
  return add("microAssignmentReversals", { assignment_id: assignment.id, request_id, reason }).id;
}
