import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { pendingStock } from "../features/ventas/domain/pending-stock.mjs";
import { pendingStock as reference } from "./helpers/pending-stock-reference.mjs";

function volume(pending, historical) {
  const sales = Array.from({ length: pending }, (_, i) => ({
    id: `s${i}`,
    code: `S${i}`,
    coverage_version: 1,
    commercial_status: i % 2 ? "RECTIFIED" : "CONFIRMED",
    fulfillment_status: "PENDING",
    delivery_date: i % 3 ? "2026-11-01" : undefined,
    created_at: i % 2 ? "2026-10-29T12:00:00Z" : "2026-10-28T12:00:00Z",
  })).reverse();
  const saleItems = sales.flatMap((sale, i) =>
    Array.from({ length: 6 }, (_, j) => ({
      id: `${sale.id}-${j}`,
      sale_id: sale.id,
      product_id: j === 4 ? "bottle" : "bag",
      quantity: 7,
      coverage: { version: 1, quantity: i % 3 === 0 ? 7 : 2 },
      is_current: j !== 5,
      presentation_unit_snapshot: j === 4 ? "BOTTLE" : "BAG",
      unit_weight_kg: j === 4 ? 2200 : j === 3 ? 50000 : 25000,
      unit_weight_grams_snapshot: j === 4 ? 2200 : j === 3 ? 50000 : 25000,
      weight_policy_snapshot: j === 4 ? "FIXED" : "VARIABLE",
    })),
  );
  for (let i = 0; i < historical; i++) saleItems.push({ id: `h${i}`, sale_id: `old${i}`, quantity: 3 });
  return {
    sales,
    saleItems,
    products: [
      { id: "bag", name: "Alimento sintético", stock_entry_mode: "NUCLEUS_PRODUCTION" },
      { id: "bottle", name: "Frasco sintético", stock_entry_mode: "DIRECT_STOCK" },
    ],
  };
}

for (const [pending, historical] of [
  [0, 10000],
  [1, 0],
  [100, 10000],
  [1000, 100000],
]) {
  test(`NQP08-R1 equivalencia e inspecciones: ${pending} pendientes, ${historical} históricas`, (t) => {
    const state = volume(pending, historical);
    let inspections = 0;
    state.saleItems = state.saleItems.map((row) => {
      const saleId = row.sale_id;
      return {
        ...row,
        get sale_id() {
          inspections++;
          return saleId;
        },
      };
    });
    const before = structuredClone(state);
    inspections = 0;
    const startOld = performance.now();
    const old = reference(state);
    const oldMs = performance.now() - startOld;
    const oldInspections = inspections;
    inspections = 0;
    const startNew = performance.now();
    const next = pendingStock(state);
    const newMs = performance.now() - startNew;
    const newInspections = inspections;
    assert.deepEqual(next, old);
    assert.equal(oldInspections, pending * state.saleItems.length);
    assert.ok(newInspections <= state.saleItems.length);
    assert.deepEqual(structuredClone(state), before);
    t.diagnostic(
      JSON.stringify({
        pending,
        lines: state.saleItems.length,
        oldInspections,
        newInspections,
        oldMs,
        newMs,
      }),
    );
  });
}
