import { requireValue, scaled, date, pick, today } from "../../../shared/domain/core.mjs";
import { paymentSummary } from "./summary.mjs";
export function paymentCreate(context) {
  const { p, payment } = context;
  let result = null;
  result = payment(
    p.customer_id,
    scaled(p.total_amount),
    (p.applications ?? []).map((x) => ({ sale_id: x.sale_id, amount: scaled(x.applied_amount) })),
    p,
  ).id;
  return result;
}
export function paymentApplyCredit(context) {
  const { s, p, add, validateApplications } = context;
  let result = null;
  const pay = pick(s, "payments", p.payment_id),
    a = paymentSummary(s, pay);
  requireValue(!a.reversed, "Pago revertido: no tiene saldo a favor disponible.");
  const apps = (p.applications ?? []).map((x) => ({
    sale_id: x.sale_id,
    amount: scaled(x.applied_amount),
  }));
  requireValue(apps.length > 0, "Seleccione una venta y un monto para aplicar.");
  validateApplications(pay.customer_id, apps, a.available);
  apps.forEach((x) =>
    add("paymentApplications", { payment_id: pay.id, sale_id: x.sale_id, applied_amount: x.amount }),
  );
  result = pay.id;
  return result;
}
export function paymentReverse(context) {
  const { s, p, add, code, reason } = context;
  let result = null;
  const pay = pick(s, "payments", p.id);
  requireValue(!s.paymentReversals.some((x) => x.payment_id === pay.id), "Pago ya revertido.");
  result = add("paymentReversals", {
    payment_id: pay.id,
    amount: pay.total_amount,
    date: date(p.date ?? today()),
    reason: reason(),
    code: code("paymentReversals", "RP"),
  }).id;
  return result;
}
