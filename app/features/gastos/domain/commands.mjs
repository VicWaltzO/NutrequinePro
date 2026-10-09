import { requireValue, scaled, date, text, pick } from "../../../shared/domain/core.mjs";
export function expenseCreate(context) {
  const { s, p, add } = context;
  let result = null;
  const amount = scaled(p.amount);
  requireValue(amount > 0, "Monto debe ser mayor que cero.");
  requireValue(s.config.expense_categories.includes(p.category), "Categoría de gasto inválida.");
  for (const [key, t] of [
    ["sale_id", "sales"],
    ["site_id", "sites"],
    ["ingredient_id", "ingredients"],
    ["production_id", "productions"],
  ])
    if (p[key]) pick(s, t, p[key]);
  let pc = null;
  if (p.production_id) {
    const pr = pick(s, "productions", p.production_id);
    requireValue(pr.status !== "CANCELLED", "Producción anulada.");
    requireValue(pr.status !== "CLOSED", "Use rectificación para costo de producción cerrada.");
    pc = add("productionCosts", {
      production_id: pr.id,
      category: p.category === "LOGISTICS" ? "FREIGHT" : "OTHER",
      description: text(p.description, "Descripción"),
      amount,
      is_paid: true,
      is_current: true,
    });
  }
  result = add("expenses", {
    date: date(p.date),
    category: p.category,
    description: text(p.description, "Descripción"),
    amount,
    production_id: p.production_id || null,
    sale_id: p.sale_id || null,
    site_id: p.site_id || null,
    ingredient_id: p.ingredient_id || null,
    production_cost_id: pc?.id ?? null,
    notes: p.notes ?? "",
    status: "CONFIRMED",
  }).id;
  return result;
}
export function expenseCancel(context) {
  const { s, p, actor, clock, reason } = context;
  let result = null;
  const e = pick(s, "expenses", p.id);
  requireValue(e.status !== "CANCELLED", "Gasto ya anulado.");
  const why = reason();
  if (e.production_cost_id) {
    const pc = pick(s, "productionCosts", e.production_cost_id);
    const pr = pick(s, "productions", pc.production_id);
    requireValue(pr.status !== "CLOSED", "Use rectificación de producción cerrada.");
    pc.is_current = false;
  }
  e.status = "CANCELLED";
  e.reason = why;
  e.cancelled_at = clock;
  e.cancelled_by = actor.id;
  result = e.id;
  return result;
}
