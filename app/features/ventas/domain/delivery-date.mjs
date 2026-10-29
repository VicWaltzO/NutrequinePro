import { requireValue } from "../../../shared/domain/core.mjs";

// A commercial day is a calendar value, never a timestamp to convert between zones.
export function deliveryDay(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), "Fecha de entrega inválida.");
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireValue(
    year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1],
    "Fecha de entrega inválida.",
  );
  return value;
}

export function savedDeliveryFields(payload, saleDate, existing = {}) {
  const hasDate = Object.hasOwn(payload, "delivery_date");
  const hasManual = Object.hasOwn(payload, "delivery_date_manual_override");
  requireValue(
    !hasManual || typeof payload.delivery_date_manual_override === "boolean",
    "Origen de fecha de entrega inválido.",
  );
  let manual = existing.delivery_date_manual_override ?? false;
  if (hasManual) manual = payload.delivery_date_manual_override;
  else if (hasDate) manual = true;
  let value = saleDate;
  if (hasDate) value = deliveryDay(payload.delivery_date);
  else if (manual) value = deliveryDay(existing.delivery_date);
  requireValue(manual || value === saleDate, "La entrega automática debe seguir la fecha de venta.");
  return { delivery_date: value, delivery_date_manual_override: manual };
}

function compare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
function createdInstant(value) {
  requireValue(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value)),
    "Antigüedad del pedido inválida.",
  );
  return Date.parse(value);
}

// Consumer contract for 05. Sorting never assigns or releases coverage.
export function compareDeliveryPriority(a, b) {
  return (
    compare(deliveryDay(a.delivery_date), deliveryDay(b.delivery_date)) ||
    compare(createdInstant(a.created_at), createdInstant(b.created_at)) ||
    compare(a.id, b.id)
  );
}

export function pendingCoveragePriority(state) {
  return state.sales
    .filter(
      (sale) =>
        sale.coverage_version === 1 &&
        typeof sale.delivery_date === "string" &&
        ["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status) &&
        sale.fulfillment_status === "PENDING" &&
        state.saleItems.some(
          (item) =>
            item.sale_id === sale.id &&
            item.is_current !== false &&
            item.quantity > (item.coverage?.quantity ?? 0),
        ),
    )
    .sort(compareDeliveryPriority);
}
