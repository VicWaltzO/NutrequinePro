import { sum } from "../../../shared/domain/core.mjs";
export function saleSummary(state, sale) {
  const items = state.saleItems.filter((x) => x.sale_id === sale.id && x.is_current !== false);
  const gross = sum(items, (x) => x.subtotal);
  const returned = sum(
    state.returns.filter((x) => x.sale_id === sale.id),
    (x) => x.economic_amount ?? 0,
  );
  const total = sale.commercial_status === "CANCELLED" ? 0 : gross - returned;
  const paid = sum(
    state.paymentApplications.filter(
      (x) => x.sale_id === sale.id && !state.paymentReversals.some((r) => r.payment_id === x.payment_id),
    ),
    (x) => x.applied_amount,
  );
  const balance = total - paid;
  let financialStatus = "PENDING";
  if (sale.commercial_status === "CANCELLED") financialStatus = "CANCELLED";
  else if (balance === 0) financialStatus = "PAID";
  else if (paid > 0) financialStatus = "PARTIAL";
  return {
    items,
    gross,
    total,
    returned,
    paid,
    balance,
    financial_status: financialStatus,
  };
}
