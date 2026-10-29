import { requireValue, sum } from "../../../shared/domain/core.mjs";
import { stock } from "../../inventario/domain/stock.mjs";
import { presentationSnapshot } from "../../../shared/domain/presentation.mjs";

// A commercial unit must have the same presentation AND actual unit weight.
function key(record, grams) {
  const snapshot = presentationSnapshot(record, true);
  return JSON.stringify([
    snapshot.presentation_unit_snapshot,
    snapshot.weight_policy_snapshot,
    snapshot.unit_weight_grams_snapshot ?? grams,
    grams,
  ]);
}

export function compatibleBalance(state, productId, row) {
  const grams = row.unit_weight_kg;
  const matches = state.inventoryMovements.filter((move) => {
    if (move.item_type !== "PRODUCT" || move.item_id !== productId || !move.quantity) return false;
    const unitWeight = move.weight_kg / move.quantity;
    return Number.isSafeInteger(unitWeight) && key(move, unitWeight) === key(row, grams);
  });
  return { quantity: sum(matches, (x) => x.quantity), grams: sum(matches, (x) => x.weight_kg) };
}

export function hasUncoveredDemand(state, productId, exceptSale) {
  return state.saleItems.some((row) => {
    if (row.product_id !== productId || row.is_current === false || row.sale_id === exceptSale) return false;
    const sale = state.sales.find((x) => x.id === row.sale_id);
    return (
      sale &&
      ["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status) &&
      sale.fulfillment_status === "PENDING" &&
      row.quantity > (row.coverage?.quantity ?? 0)
    );
  });
}

export function coverSale(context, sale, rows) {
  const { s: state, movement } = context;
  sale.coverage_version = 1;
  for (const row of rows) {
    const balance = compatibleBalance(state, row.product_id, row);
    const aggregate = stock(state, row.product_id);
    const quantity = Math.max(
      0,
      Math.min(
        row.quantity,
        balance.quantity,
        Math.floor(balance.grams / row.unit_weight_kg),
        aggregate.quantity,
        Math.floor(aggregate.weight_kg / row.unit_weight_kg),
      ),
    );
    requireValue(
      !quantity || !hasUncoveredDemand(state, row.product_id, sale.id),
      "Hay pedidos anteriores pendientes por stock. Asignación bloqueada hasta NQP26-05/06.",
    );
    const weight = quantity * row.unit_weight_kg;
    let move;
    if (quantity)
      move = movement({
        ...presentationSnapshot(row, true),
        item_type: "PRODUCT",
        item_id: row.product_id,
        movement_type: "SALE_OUT",
        quantity: -quantity,
        weight_kg: -weight,
        source_type: "SALE",
        source_id: sale.id,
        sale_item_id: row.id,
        coverage_version: 1,
        notes: sale.code,
      });
    row.coverage = { version: 1, quantity, weight_grams: weight, movement_id: move?.id ?? null };
  }
}

export function guardCoverageMovement(state, value) {
  if (value.item_type !== "PRODUCT") return;
  if (value.quantity > 0)
    requireValue(
      !hasUncoveredDemand(state, value.item_id),
      "Ingreso o liberación bloqueados: hay pedidos pendientes por stock. Requiere NQP26-05/06.",
    );
  if (value.quantity < 0) {
    const unitWeight = value.weight_kg / value.quantity;
    const row = { ...value, unit_weight_kg: unitWeight };
    const balance = compatibleBalance(state, value.item_id, row);
    const aggregate = stock(state, value.item_id);
    requireValue(
      Number.isSafeInteger(unitWeight) &&
        balance.quantity >= -value.quantity &&
        balance.grams >= -value.weight_kg &&
        aggregate.quantity >= -value.quantity &&
        aggregate.weight_kg >= -value.weight_kg,
      "Saldo comercial compatible insuficiente; no se puede consumir cobertura ajena ni mezclar pesos.",
    );
  }
}

// Historical reversals are one operation: validate their net effect per compatible unit,
// while retaining every original reversal in the ledger.
export function guardCoverageMovementBatch(state, values) {
  const groups = new Map();
  for (const value of values) {
    if (value.item_type !== "PRODUCT") continue;
    const grams = value.weight_kg / value.quantity;
    requireValue(Number.isSafeInteger(grams), "Peso comercial inválido en la compensación.");
    const groupKey = JSON.stringify([value.item_id, key(value, grams)]);
    const group = groups.get(groupKey) ?? { ...value, quantity: 0, weight_kg: 0 };
    group.quantity += value.quantity;
    group.weight_kg += value.weight_kg;
    groups.set(groupKey, group);
  }
  const projected = { ...state, inventoryMovements: [...state.inventoryMovements] };
  for (const value of groups.values()) {
    guardCoverageMovement(projected, value);
    projected.inventoryMovements.push(value);
  }
}

const inventoryCommands = new Set([
  "SALE_SAVE",
  "SALE_DELIVER",
  "SALE_CORRECT",
  "SALE_DELIVERY_DATE_UPDATE",
  "SALE_CANCEL",
  "RETURN_CREATE",
  "INVENTORY_ADJUST",
  "PRODUCTION_SAVE",
  "PRODUCTION_CONFIRM",
  "PRODUCTION_CORRECT",
  "PRODUCTION_CORRECT_QUANTITIES",
  "PRODUCTION_CANCEL",
  "PRODUCTION_CLOSE",
  "PRODUCTION_RECONCILE",
]);

export function guardCoverageMode(state, type, enabled) {
  if (!enabled && inventoryCommands.has(type))
    requireValue(
      !state.sales.some((sale) => sale.coverage_version === 1),
      "Esta base contiene reservas del prototipo aislado. Requiere la composición protegida de NQP26-04.",
    );
}
