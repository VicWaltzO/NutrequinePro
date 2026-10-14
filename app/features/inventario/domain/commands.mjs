import { requireValue, scaled, positiveInt, date, pick } from "../../../shared/domain/core.mjs";
import { stock } from "./stock.mjs";
export function inventoryAdjust(context) {
  const { s: state, p: payload, uid, reason, movement } = context;
  let result = null;
  const product = pick(state, "products", payload.product_id);
  const quantity = positiveInt(payload.quantity);
  const weight = scaled(payload.weight_kg, 3);
  requireValue(weight > 0, "Peso debe ser mayor que cero.");
  const sign = payload.direction === "OUT" ? -1 : 1;
  if (sign < 0) {
    const a = stock(state, product.id);
    requireValue(a.quantity >= quantity && a.weight_kg >= weight, "Stock insuficiente para ajuste.");
  }
  result = movement({
    item_type: "PRODUCT",
    item_id: product.id,
    movement_type: sign > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
    quantity: sign * quantity,
    weight_kg: sign * weight,
    source_type: "ADJUSTMENT",
    source_id: uid(),
    notes: reason(),
    date: date(payload.date),
  }).id;
  return result;
}
