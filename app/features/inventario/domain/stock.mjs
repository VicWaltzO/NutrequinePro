import { requireValue, sum } from "../../../shared/domain/core.mjs";
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
function missingUnitWeight(quantity, grams) {
  // Positive units represent physical stock, with a minimum resolution of one gram.
  return Math.max(0, quantity - grams);
}

export function assertPhysicalUnitWeight(before, after) {
  const changedProducts = new Set(
    after.inventoryMovements
      .slice(before.inventoryMovements.length)
      .filter((move) => move.item_type === "PRODUCT")
      .map((move) => move.item_id),
  );
  for (const id of changedProducts) {
    const previous = stock(before, id);
    const current = stock(after, id);
    requireValue(
      missingUnitWeight(current.quantity, current.weight_kg) <=
        missingUnitWeight(previous.quantity, previous.weight_kg),
      "Stock físico insuficiente para conservar el peso de las unidades remanentes.",
    );
  }
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
    const missingWeight =
      weight > weight_kg
        ? weight - weight_kg
        : missingUnitWeight(Math.max(0, quantity - requested), weight_kg - weight);
    return {
      product_id,
      requested,
      weight,
      quantity,
      weight_kg,
      missing_quantity: Math.max(0, requested - quantity),
      missing_weight: missingWeight,
    };
  });
}
