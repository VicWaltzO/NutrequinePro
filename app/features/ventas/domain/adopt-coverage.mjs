import { requireValue, pick } from "../../../shared/domain/core.mjs";
import { deliveryDay, compareDeliveryPriority } from "./delivery-date.mjs";
import { coverSale } from "./coverage.mjs";
import { presentationSnapshot } from "../../../shared/domain/presentation.mjs";

export function saleCoverageAdopt(context) {
  const { s: state, p: payload, reason, correction } = context;
  requireValue(
    context.partialReservations,
    "Adopción disponible solo en la composición experimental protegida.",
  );
  requireValue(
    Object.keys(payload).every((k) => ["id", "delivery_date", "reason"].includes(k)),
    "Adopción solo admite pedido, fecha propia y motivo.",
  );
  const sale = pick(state, "sales", payload.id);
  requireValue(typeof payload.reason === "string", "Motivo inválido.");
  const why = reason();
  const day = deliveryDay(payload.delivery_date);
  compareDeliveryPriority({ ...sale, delivery_date: day }, { ...sale, delivery_date: day });
  const rows = state.saleItems.filter((r) => r.sale_id === sale.id && r.is_current !== false);
  requireValue(
    !sale.coverage_version &&
      ["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status) &&
      sale.fulfillment_status === "PENDING" &&
      !sale.delivered_at,
    "Solo se adoptan pedidos legacy pendientes sin adopción previa.",
  );
  const ids = new Set(state.saleItems.filter((r) => r.sale_id === sale.id).map((r) => r.id));
  requireValue(
    rows.length > 0 &&
      !state.inventoryMovements.some((m) => m.source_id === sale.id || ids.has(m.sale_item_id)) &&
      !state.returns.some((r) => r.sale_id === sale.id) &&
      !state.saleItems.some((r) => r.sale_id === sale.id && r.coverage),
    "Historial ambiguo: concilie cargos y devoluciones antes de adoptar; no se inventa cobertura.",
  );
  requireValue(
    rows.every(
      (r) =>
        Number.isSafeInteger(r.quantity) &&
        r.quantity > 0 &&
        Number.isSafeInteger(r.unit_weight_kg) &&
        r.unit_weight_kg > 0 &&
        r.total_weight_kg === r.quantity * r.unit_weight_kg &&
        r.presentation_unit_snapshot &&
        r.weight_policy_snapshot &&
        r.unit_weight_grams_snapshot,
    ),
    "Presentación histórica ambigua: requiere conciliación explícita.",
  );
  const before = structuredClone({ sale, rows });
  for (const row of rows) Object.assign(row, presentationSnapshot(row, true));
  Object.assign(sale, {
    delivery_date: day,
    delivery_date_manual_override: true,
    coverage_adopted_at: context.clock,
    coverage_adopted_by: context.actor.id,
    coverage_adoption_reason: why,
    updated_at: context.clock,
  });
  coverSale(context, sale, rows);
  correction("SALE", sale.id, before, structuredClone({ sale, rows }), why);
  return sale.id;
}
