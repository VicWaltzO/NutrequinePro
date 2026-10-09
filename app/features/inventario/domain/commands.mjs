import { requireValue, scaled, positiveInt, date, pick } from "../../../shared/domain/core.mjs";
import { stock } from "./stock.mjs";
export function inventoryAdjust(context) {
  const { s, p, uid, reason, movement } = context;
  let result = null;
  const product = pick(s, "products", p.product_id);
  const q = positiveInt(p.quantity);
  const w = scaled(p.weight_kg, 3);
  requireValue(w > 0, "Peso debe ser mayor que cero.");
  const sign = p.direction === "OUT" ? -1 : 1;
  if (sign < 0) {
    const a = stock(s, product.id);
    requireValue(a.quantity >= q && a.weight_kg >= w, "Stock insuficiente para ajuste.");
  }
  result = movement({
    item_type: "PRODUCT",
    item_id: product.id,
    movement_type: sign > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
    quantity: sign * q,
    weight_kg: sign * w,
    source_type: "ADJUSTMENT",
    source_id: uid(),
    notes: reason(),
    date: date(p.date),
  }).id;
  return result;
}
