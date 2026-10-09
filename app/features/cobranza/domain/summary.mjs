import { sum } from "../../../shared/domain/core.mjs";
export function paymentSummary(s, pay) {
  const reversed = s.paymentReversals.some((r) => r.payment_id === pay.id);
  const applied = sum(
    s.paymentApplications.filter((x) => x.payment_id === pay.id),
    (x) => x.applied_amount,
  );
  return { applied: reversed ? 0 : applied, available: reversed ? 0 : pay.total_amount - applied, reversed };
}
