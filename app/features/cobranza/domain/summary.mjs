import { sum } from "../../../shared/domain/core.mjs";
export function paymentSummary(state, payment) {
  const reversed = state.paymentReversals.some((r) => r.payment_id === payment.id);
  const applied = sum(
    state.paymentApplications.filter((x) => x.payment_id === payment.id),
    (x) => x.applied_amount,
  );
  return {
    applied: reversed ? 0 : applied,
    available: reversed ? 0 : payment.total_amount - applied,
    reversed,
  };
}
