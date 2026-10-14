import { requireValue, scaled, date, pick, today } from "../../../shared/domain/core.mjs";
import { paymentSummary } from "./summary.mjs";
export function paymentCreate(context) {
  const { p: payload, payment } = context;
  let result = null;
  result = payment(
    payload.customer_id,
    scaled(payload.total_amount),
    (payload.applications ?? []).map((x) => ({ sale_id: x.sale_id, amount: scaled(x.applied_amount) })),
    payload,
  ).id;
  return result;
}
export function paymentApplyCredit(context) {
  const { s: state, p: payload, add, validateApplications } = context;
  let result = null;
  const payment = pick(state, "payments", payload.payment_id);
  const a = paymentSummary(state, payment);
  requireValue(!a.reversed, "Pago revertido: no tiene saldo a favor disponible.");
  const apps = (payload.applications ?? []).map((x) => ({
    sale_id: x.sale_id,
    amount: scaled(x.applied_amount),
  }));
  requireValue(apps.length > 0, "Seleccione una venta y un monto para aplicar.");
  validateApplications(payment.customer_id, apps, a.available);
  apps.forEach((x) =>
    add("paymentApplications", { payment_id: payment.id, sale_id: x.sale_id, applied_amount: x.amount }),
  );
  result = payment.id;
  return result;
}
export function paymentReverse(context) {
  const { s: state, p: payload, add, code, reason } = context;
  let result = null;
  const payment = pick(state, "payments", payload.id);
  requireValue(!state.paymentReversals.some((x) => x.payment_id === payment.id), "Pago ya revertido.");
  result = add("paymentReversals", {
    payment_id: payment.id,
    amount: payment.total_amount,
    date: date(payload.date ?? today()),
    reason: reason(),
    code: code("paymentReversals", "RP"),
  }).id;
  return result;
}
