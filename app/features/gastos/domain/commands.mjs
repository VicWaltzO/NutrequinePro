import { requireValue, scaled, date, text, pick } from "../../../shared/domain/core.mjs";
export function expenseCreate(context) {
  const { s: state, p: payload, add } = context;
  let result = null;
  const amount = scaled(payload.amount);
  requireValue(amount > 0, "Monto debe ser mayor que cero.");
  requireValue(state.config.expense_categories.includes(payload.category), "Categoría de gasto inválida.");
  for (const [key, t] of [
    ["sale_id", "sales"],
    ["site_id", "sites"],
    ["ingredient_id", "ingredients"],
    ["production_id", "productions"],
  ])
    if (payload[key]) pick(state, t, payload[key]);
  let pc = null;
  if (payload.production_id) {
    const production = pick(state, "productions", payload.production_id);
    requireValue(production.status !== "CANCELLED", "Producción anulada.");
    requireValue(production.status !== "CLOSED", "Use rectificación para costo de producción cerrada.");
    pc = add("productionCosts", {
      production_id: production.id,
      category: payload.category === "LOGISTICS" ? "FREIGHT" : "OTHER",
      description: text(payload.description, "Descripción"),
      amount,
      is_paid: true,
      is_current: true,
    });
  }
  result = add("expenses", {
    date: date(payload.date),
    category: payload.category,
    description: text(payload.description, "Descripción"),
    amount,
    production_id: payload.production_id || null,
    sale_id: payload.sale_id || null,
    site_id: payload.site_id || null,
    ingredient_id: payload.ingredient_id || null,
    production_cost_id: pc?.id ?? null,
    notes: payload.notes ?? "",
    status: "CONFIRMED",
  }).id;
  return result;
}
export function expenseCancel(context) {
  const { s: state, p: payload, actor, clock, reason } = context;
  let result = null;
  const e = pick(state, "expenses", payload.id);
  requireValue(e.status !== "CANCELLED", "Gasto ya anulado.");
  const why = reason();
  if (e.production_cost_id) {
    const pc = pick(state, "productionCosts", e.production_cost_id);
    const production = pick(state, "productions", pc.production_id);
    requireValue(production.status !== "CLOSED", "Use rectificación de producción cerrada.");
    pc.is_current = false;
  }
  e.status = "CANCELLED";
  e.reason = why;
  e.cancelled_at = clock;
  e.cancelled_by = actor.id;
  result = e.id;
  return result;
}
