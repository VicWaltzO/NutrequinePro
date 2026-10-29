import { requireValue, sum } from "../../../shared/domain/core.mjs";
import { stock } from "../../inventario/domain/stock.mjs";
import { presentationSnapshot } from "../../../shared/domain/presentation.mjs";
import { pendingCoveragePriority } from "./delivery-date.mjs";

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

export function coverSale(context, sale, rows) {
  // Older obligations receive free compatible units before this new sale participates.
  allocatePendingCoverage(context);
  sale.coverage_version = 1;
  for (const row of rows)
    row.coverage = { version: 1, quantity: 0, weight_grams: 0, movement_id: null, events: [] };
  allocatePendingCoverage(context);
}

export function coverageEvents(row) {
  if (row.coverage?.events) return row.coverage.events;
  return row.coverage?.movement_id
    ? [
        {
          movement_id: row.coverage.movement_id,
          quantity: row.coverage.quantity,
          weight_grams: row.coverage.weight_grams,
        },
      ]
    : [];
}

export function allocatePendingCoverage(context) {
  const { s: state, movement } = context;
  for (const sale of pendingCoveragePriority(state)) {
    const rows = state.saleItems
      .filter((r) => r.sale_id === sale.id && r.is_current !== false)
      .sort((a, b) => {
        if (a.id < b.id) return -1;
        return a.id > b.id ? 1 : 0;
      });
    for (const row of rows) {
      const balance = compatibleBalance(state, row.product_id, row);
      const aggregate = stock(state, row.product_id);
      const quantity = Math.max(
        0,
        Math.min(
          row.quantity - (row.coverage?.quantity ?? 0),
          balance.quantity,
          Math.floor(balance.grams / row.unit_weight_kg),
          aggregate.quantity,
          Math.floor(aggregate.weight_kg / row.unit_weight_kg),
        ),
      );
      if (!quantity) continue;
      const weight = quantity * row.unit_weight_kg;
      const move = movement({
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
        coverage_action: "ASSIGN",
        coverage_cause: context.type,
        notes: sale.code,
      });
      const old = row.coverage ?? { quantity: 0, weight_grams: 0, movement_id: null };
      row.coverage = {
        version: 1,
        quantity: old.quantity + quantity,
        weight_grams: old.weight_grams + weight,
        movement_id: old.movement_id ?? move.id,
        events: [...coverageEvents(row), { movement_id: move.id, quantity, weight_grams: weight }],
      };
    }
  }
}

// Release the newest active assignments first; each compensation points at its original debit.
export function releaseCoverage(context, sale, row, quantity) {
  if (!quantity) return;
  const events = [...coverageEvents(row)];
  let remaining = quantity;
  for (const event of events.filter((e) => e.quantity > 0).reverse()) {
    const released = events
      .filter((e) => e.reverses_movement_id === event.movement_id)
      .reduce((n, e) => n - e.quantity, 0);
    const delta = Math.min(remaining, event.quantity - released);
    if (!delta) continue;
    const move = context.movement({
      ...presentationSnapshot(row, true),
      item_type: "PRODUCT",
      item_id: row.product_id,
      movement_type: "CANCELLATION_REVERSAL",
      quantity: delta,
      weight_kg: delta * row.unit_weight_kg,
      source_type: "SALE",
      source_id: sale.id,
      sale_item_id: row.id,
      coverage_version: 1,
      coverage_action: "RELEASE",
      reverses_movement_id: event.movement_id,
      coverage_cause: context.type,
      notes: context.p.reason,
    });
    events.push({
      movement_id: move.id,
      reverses_movement_id: event.movement_id,
      quantity: -delta,
      weight_grams: -delta * row.unit_weight_kg,
    });
    remaining -= delta;
    if (!remaining) break;
  }
  requireValue(remaining === 0, "No se pudo conciliar la liberación de cobertura.");
  row.coverage = {
    ...row.coverage,
    quantity: row.coverage.quantity - quantity,
    weight_grams: row.coverage.weight_grams - quantity * row.unit_weight_kg,
    events,
  };
}

// Assert both the JSON accumulator and its immutable ledger links before committing.
export function assertCoverageIntegrity(state) {
  const activeLinks = new Set();
  for (const row of state.saleItems.filter((r) => r.is_current !== false && r.coverage)) {
    const events = coverageEvents(row);
    requireValue(
      new Set(events.map((e) => e.movement_id)).size === events.length,
      "Enlace de cobertura duplicado.",
    );
    for (const event of events) {
      requireValue(!activeLinks.has(event.movement_id), "Una asignación no puede cubrir dos líneas activas.");
      activeLinks.add(event.movement_id);
      const move = state.inventoryMovements.find((m) => m.id === event.movement_id);
      requireValue(
        move &&
          move.source_id === row.sale_id &&
          move.item_id === row.product_id &&
          key(move, move.weight_kg / move.quantity) === key(row, row.unit_weight_kg) &&
          move.quantity === -event.quantity &&
          move.weight_kg === -event.weight_grams,
        "Cobertura inconsistente con el ledger comercial.",
      );
    }
    requireValue(
      sum(events, (e) => e.quantity) === row.coverage.quantity &&
        sum(events, (e) => e.weight_grams) === row.coverage.weight_grams &&
        row.coverage.quantity >= 0 &&
        row.coverage.quantity <= row.quantity &&
        row.coverage.weight_grams === row.coverage.quantity * row.unit_weight_kg,
      "Cobertura fuera de los límites de la línea.",
    );
  }
}

export function guardCoverageMovement(state, value) {
  if (value.item_type !== "PRODUCT") return;
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
  "SALE_COVERAGE_ADOPT",
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
