import { compareDeliveryPriority } from "./delivery-date.mjs";

/** @typedef {{ id: string, code: string, deliveryDate: string | undefined, missing: number }} PendingOrder */
/** @typedef {{ key: string, productId: string, name: string, unit: string, grams: number, nominalGrams: number | undefined, supply: string, missing: number, orders: PendingOrder[] }} PendingGroup */

// Read only commercially validated state. Coverage links are checked by the store;
// this projection never allocates stock or interprets the legacy committed balance.
/** @param {import("../../../shared/types/domain.ts").AppState} state */
export function pendingStock(state) {
  const sales = state.sales
    .filter(
      (sale) =>
        sale.coverage_version === 1 &&
        ["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status) &&
        sale.fulfillment_status === "PENDING",
    )
    .sort((a, b) =>
      compareDeliveryPriority(
        { ...a, delivery_date: a.delivery_date ?? "9999-12-31" },
        { ...b, delivery_date: b.delivery_date ?? "9999-12-31" },
      ),
    );
  const products = new Map(state.products.map((product) => [product.id, product]));
  const orderIds = new Set();
  /** @type {Map<string, PendingGroup>} */
  const groups = new Map();
  /** @type {Map<string, import("../../../shared/types/domain.ts").AppState["saleItems"]>} */
  const rowsBySale = new Map();
  for (const row of state.saleItems) {
    if (row.is_current === false || row.coverage?.version !== 1) continue;
    const saleId = row.sale_id;
    const rows = rowsBySale.get(saleId);
    if (rows) rows.push(row);
    else rowsBySale.set(saleId, [row]);
  }
  for (const sale of sales) {
    // One accumulator per group in this sale; insertion order is priority order.
    /** @type {Map<string, PendingOrder>} */
    const ordersByGroup = new Map();
    for (const row of rowsBySale.get(sale.id) ?? []) {
      const missing = Math.max(0, row.quantity - row.coverage.quantity);
      if (!missing) continue;
      const product = products.get(row.product_id);
      const unit = row.presentation_unit_snapshot ?? "UNIT";
      // PRODUCT_SAVE freezes explicit entry mode once history exists. Its default
      // is deliberately not used for ambiguous historical masters.
      let supply = "UNKNOWN";
      if (product?.stock_entry_mode === "DIRECT_STOCK") supply = "DIRECT_STOCK";
      if (product?.stock_entry_mode === "NUCLEUS_PRODUCTION" && unit === "BAG") supply = "NUCLEUS_PRODUCTION";
      const key = JSON.stringify([
        row.product_id,
        unit,
        row.unit_weight_kg,
        row.unit_weight_grams_snapshot,
        row.weight_policy_snapshot,
        supply,
      ]);
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          productId: row.product_id,
          name: product?.name ?? "Producto sin ficha",
          unit,
          grams: row.unit_weight_kg,
          nominalGrams: row.unit_weight_grams_snapshot,
          supply,
          missing: 0,
          orders: [],
        };
        groups.set(key, group);
      }
      group.missing += missing;
      const order = ordersByGroup.get(key);
      if (order) order.missing += missing;
      else {
        const entry = { id: sale.id, code: sale.code, deliveryDate: sale.delivery_date, missing };
        ordersByGroup.set(key, entry);
        group.orders.push(entry);
      }
      orderIds.add(sale.id);
    }
  }
  const sorted = [...groups.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "es") || a.key.localeCompare(b.key, "es"),
  );
  return {
    orders: orderIds.size,
    productionBags: sorted
      .filter((group) => group.supply === "NUCLEUS_PRODUCTION")
      .reduce((total, group) => total + group.missing, 0),
    groups: sorted,
  };
}
