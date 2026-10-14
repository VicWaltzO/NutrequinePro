import { sum } from "../../../shared/domain/core.mjs";
export function stock(state, productId) {
  const moves = state.inventoryMovements.filter((x) => x.item_type === "PRODUCT" && x.item_id === productId);
  return {
    quantity: sum(moves, (x) => x.quantity),
    weight_kg: sum(moves, (x) => x.weight_kg),
    committed: sum(
      state.saleItems.filter(
        (x) =>
          x.product_id === productId &&
          x.is_current !== false &&
          state.sales.some(
            (physicalStock) =>
              physicalStock.id === x.sale_id &&
              physicalStock.commercial_status !== "CANCELLED" &&
              physicalStock.commercial_status !== "DRAFT" &&
              physicalStock.fulfillment_status === "PENDING",
          ),
      ),
      (x) => x.quantity,
    ),
  };
}
export function deliveryAvailability(state, rows, allowOld = []) {
  return [...new Set(rows.map((x) => x.product_id))].map((product_id) => {
    const physicalStock = stock(state, product_id);
    const requested = sum(
      rows.filter((x) => x.product_id === product_id),
      (x) => x.quantity,
    );
    const weight = sum(
      rows.filter((x) => x.product_id === product_id),
      (x) => x.total_weight_kg,
    );
    const quantity =
      physicalStock.quantity +
      sum(
        allowOld.filter((x) => x.product_id === product_id),
        (x) => x.quantity,
      );
    const weight_kg =
      physicalStock.weight_kg +
      sum(
        allowOld.filter((x) => x.product_id === product_id),
        (x) => x.total_weight_kg,
      );
    return {
      product_id,
      requested,
      weight,
      quantity,
      weight_kg,
      missing_quantity: Math.max(0, requested - quantity),
      missing_weight: Math.max(0, weight - weight_kg),
    };
  });
}
