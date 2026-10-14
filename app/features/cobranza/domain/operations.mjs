import { requireValue, date, text, pick, sum, today } from "../../../shared/domain/core.mjs";
import { saleSummary } from "../../ventas/domain/summary.mjs";
export function createPaymentOperations(context) {
  const { add, code, s: state } = context;
  const validateApplications = (customer_id, apps, amount) => {
    requireValue(sum(apps, (x) => x.amount) <= amount, "La suma de aplicaciones supera el pago disponible.");
    requireValue(
      new Set(apps.map((a) => a.sale_id)).size === apps.length,
      "Una venta no puede repetirse en el mismo pago.",
    );
    for (const a of apps) {
      const sale = pick(state, "sales", a.sale_id);
      requireValue(sale.customer_id === customer_id, "El cliente del pago debe coincidir con las ventas.");
      requireValue(!["CANCELLED", "DRAFT"].includes(sale.commercial_status), "No se puede pagar esta venta.");
      requireValue(
        a.amount > 0 && a.amount <= saleSummary(state, sale).balance,
        "Aplicación supera el saldo pendiente.",
      );
    }
  };
  const payment = (customer_id, amount, apps, input) => {
    pick(state, "customers", customer_id);
    requireValue(amount > 0, "Monto de pago debe ser mayor que cero.");
    requireValue(
      ["CASH", "TRANSFER", "CHECK", "OTHER"].includes(input.payment_method),
      "Seleccione método de pago.",
    );
    if (input.payment_method === "OTHER") text(input.other_method, "Otro método");
    validateApplications(customer_id, apps, amount);
    const payment = add("payments", {
      code: code("payments", "PG"),
      customer_id,
      total_amount: amount,
      payment_date: date(input.payment_date ?? today()),
      payment_method: input.payment_method,
      other_method: input.other_method ?? "",
      reference: input.reference ?? "",
      notes: input.notes ?? "",
    });
    apps.forEach((a) =>
      add("paymentApplications", { payment_id: payment.id, sale_id: a.sale_id, applied_amount: a.amount }),
    );
    return payment;
  };
  return { validateApplications, payment };
}
