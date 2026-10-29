import { requireValue, sum } from "../../../shared/domain/core.mjs";
import { saleSummary } from "./summary.mjs";
import { releaseCoverage, allocatePendingCoverage } from "./coverage.mjs";

const samePresentation = (a, b) =>
  [
    "product_id",
    "unit_weight_kg",
    "presentation_unit_snapshot",
    "unit_weight_grams_snapshot",
    "weight_policy_snapshot",
  ].every((key) => a[key] === b[key]);
const sameLine = (a, b) =>
  samePresentation(a, b) && a.quantity === b.quantity && a.unit_price === b.unit_price;

export function correctReservedSale(context, sale) {
  const { s: state, p: payload, saleItems, reason, add, correction, clock } = context;
  requireValue(
    ["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status),
    "Esta venta no puede rectificarse.",
  );
  const why = reason();
  const before = structuredClone({ sale, summary: saleSummary(state, sale) });
  const old = state.saleItems.filter((r) => r.sale_id === sale.id && r.is_current !== false);
  const proposed = saleItems(sale.id, payload.items, old);
  const previous = proposed.map((_, index) =>
    old.find((r) => r.id === payload.items[index].original_item_id),
  );
  const ids = previous.filter(Boolean).map((r) => r.id);
  requireValue(new Set(ids).size === ids.length, "La línea histórica está repetida.");
  const unchanged =
    proposed.length === old.length &&
    proposed.every((r, i) => previous[i] && sameLine(r, previous[i])) &&
    (payload.notes ?? sale.notes) === sale.notes;
  if (unchanged) return sale.id;
  requireValue(
    sale.fulfillment_status === "PENDING",
    "Pedido entregado: rectificación bloqueada; requiere devolución física explícita.",
  );
  requireValue(
    !state.returns.some((r) => r.sale_id === sale.id),
    "La venta tiene devoluciones; requiere conciliación.",
  );
  requireValue(
    sum(proposed, (r) => r.subtotal) >= before.summary.paid,
    "Hay pago excedente. Revierta el pago antes de completar la rectificación.",
  );
  for (const row of old) {
    const index = previous.findIndex((r) => r?.id === row.id);
    const next = proposed[index];
    const retained = next && samePresentation(row, next) ? Math.min(row.coverage.quantity, next.quantity) : 0;
    // Keep the historical document unchanged; the new version carries the complete event chain.
    const active = structuredClone(row);
    const release = row.coverage.quantity - retained;
    if (release) releaseCoverage(context, sale, active, release);
    if (next) {
      next.coverage = samePresentation(row, next) ? active.coverage : undefined;
      next.previous_item_id = row.id;
    }
    row.is_current = false;
    // Removed/replaced lines retain their release chain in an inactive successor, too.
    if (!next || !samePresentation(row, next))
      add("saleItems", { ...active, id: context.uid(), previous_item_id: row.id, is_current: false });
  }
  for (const row of proposed) {
    if (!row.coverage)
      row.coverage = { version: 1, quantity: 0, weight_grams: 0, movement_id: null, events: [] };
    add("saleItems", row);
  }
  sale.commercial_status = "RECTIFIED";
  sale.notes = payload.notes ?? sale.notes;
  sale.updated_at = clock;
  allocatePendingCoverage(context);
  correction("SALE", sale.id, before, structuredClone({ sale, summary: saleSummary(state, sale) }), why);
  return sale.id;
}
