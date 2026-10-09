import { sum } from "../../../shared/domain/core.mjs";
export function saleSummary(s, sale) {
  const items = s.saleItems.filter((x) => x.sale_id === sale.id && x.is_current !== false);
  const gross = sum(items, (x) => x.subtotal);
  const returned = sum(
    s.returns.filter((x) => x.sale_id === sale.id),
    (x) => x.economic_amount ?? 0,
  );
  const total = sale.commercial_status === "CANCELLED" ? 0 : gross - returned;
  const paid = sum(
    s.paymentApplications.filter(
      (x) => x.sale_id === sale.id && !s.paymentReversals.some((r) => r.payment_id === x.payment_id),
    ),
    (x) => x.applied_amount,
  );
  const balance = total - paid;
  return {
    items,
    gross,
    total,
    returned,
    paid,
    balance,
    financial_status:
      sale.commercial_status === "CANCELLED"
        ? "CANCELLED"
        : balance === 0
          ? "PAID"
          : paid > 0
            ? "PARTIAL"
            : "PENDING",
  };
}
