import { requireValue, pick } from "../../../shared/domain/core.mjs";
import { deliveryDay } from "./delivery-date.mjs";

export function saleDeliveryDateUpdate(context) {
  const { s: state, p: payload, clock, correction, reason } = context;
  requireValue(
    Object.keys(payload).every((key) => ["id", "delivery_date", "reason"].includes(key)),
    "La reprogramación solo admite fecha de entrega y motivo.",
  );
  requireValue(typeof payload.reason === "string", "Motivo inválido.");
  const sale = pick(state, "sales", payload.id);
  requireValue(
    ["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status) && sale.fulfillment_status === "PENDING",
    "Solo se reprograman pedidos confirmados pendientes.",
  );
  const value = deliveryDay(payload.delivery_date);
  const why = reason();
  const before = {
    delivery_date: sale.delivery_date ?? null,
    delivery_date_manual_override: sale.delivery_date_manual_override ?? null,
  };
  const after = { delivery_date: value, delivery_date_manual_override: true };
  Object.assign(sale, after, { updated_at: clock });
  correction("SALE", sale.id, before, after, why);
  return sale.id;
}
