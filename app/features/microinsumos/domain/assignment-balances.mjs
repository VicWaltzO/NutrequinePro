import { requireValue } from "../../../shared/domain/core.mjs";
export function activeAssignment(s, preparationId) {
  return s.microAssignments.find(
    (a) =>
      a.preparation_id === preparationId &&
      !s.microAssignmentReversals.some((r) => r.assignment_id === a.id) &&
      !s.microConfirmations.some((c) => c.assignment_id === a.id),
  );
}
export function assignedHundredths(s, microId) {
  const released = new Set(
    [...s.microAssignmentReversals, ...s.microConfirmations].map((r) => r.assignment_id),
  );
  return s.microAssignmentLines
    .filter((l) => l.micro_ingredient_id === microId && !released.has(l.assignment_id))
    .reduce((sum, l) => {
      const value = sum + l.quantity_hundredths;
      requireValue(Number.isSafeInteger(value) && value >= 0, "Compromiso inválido.");
      return value;
    }, 0);
}
