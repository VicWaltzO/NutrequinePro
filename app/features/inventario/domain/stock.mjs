import { sum } from "../../../shared/domain/core.mjs";
export function stock(s, productId) {
  const moves = s.inventoryMovements.filter((x) => x.item_type === "PRODUCT" && x.item_id === productId);
  return {
    quantity: sum(moves, (x) => x.quantity),
    weight_kg: sum(moves, (x) => x.weight_kg),
    committed: sum(
      s.saleItems.filter(
        (x) =>
          x.product_id === productId &&
          x.is_current !== false &&
          s.sales.some(
            (a) =>
              a.id === x.sale_id &&
              a.commercial_status !== "CANCELLED" &&
              a.commercial_status !== "DRAFT" &&
              a.fulfillment_status === "PENDING",
          ),
      ),
      (x) => x.quantity,
    ),
  };
}
export function deliveryAvailability(s, rows, allowOld = []) {
  return [...new Set(rows.map((x) => x.product_id))].map((product_id) => {
    const a = stock(s, product_id);
    const requested = sum(
        rows.filter((x) => x.product_id === product_id),
        (x) => x.quantity,
      ),
      weight = sum(
        rows.filter((x) => x.product_id === product_id),
        (x) => x.total_weight_kg,
      );
    const quantity =
        a.quantity +
        sum(
          allowOld.filter((x) => x.product_id === product_id),
          (x) => x.quantity,
        ),
      weight_kg =
        a.weight_kg +
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
