import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryPersistence } from "./helpers/memory-persistence.mjs";
import { createStore } from "../lib/application-store.mjs";
import { TABLES, seedState, productionSummary, saleSummary, balanceSummary, stock } from "../lib/domain.mjs";
import { diskFixture } from "./helpers/persistence-fixtures.mjs";
import {
  adminIdentity,
  cashCreditScenario,
  productionPayload,
  salePayload,
  scenarioDate,
} from "./helpers/regression-scenarios.mjs";

async function historyScenario(store) {
  let sequence = 0;
  const session = {
    state: () => store.loadState(),
    run: async (type, payload, request_id = "parity-" + ++sequence) =>
      (await store.runCommand({ type, payload, request_id }, adminIdentity)).result,
  };
  const ids = await cashCreditScenario(session);
  const production = await session.run("PRODUCTION_SAVE", productionPayload({ confirm: false }));
  await session.run("PRODUCTION_CONFIRM", { id: production });
  let summary = productionSummary(await session.state(), { id: production });
  await session.run("PRODUCTION_RECONCILE", {
    id: production,
    reason: "Conciliación sintética",
    ingredients: summary.ingredients.map((row) => ({
      id: row.id,
      actual_charge: row.theoretical_net_cost / 100,
      is_paid: true,
    })),
    costs: summary.costs.map((row) => ({ id: row.id, amount: row.amount / 100, is_paid: true })),
  });
  await session.run("PRODUCTION_CLOSE", { id: production });
  const historical = productionSummary(await session.state(), { id: production });
  await session.run("FORMULA_SAVE", {
    product_id: "prod-1",
    valid_from: scenarioDate,
    ingredients: [{ ingredient_id: "ing-1", kg_per_nucleus: "0.500" }],
  });
  assert.deepEqual(productionSummary(await session.state(), { id: production }), historical);
  const sale = await session.run("SALE_SAVE", salePayload(ids.customer, { deliver: true }));
  const originalItem = saleSummary(await session.state(), { id: sale }).items[0];
  await session.run("SALE_CORRECT", {
    id: sale,
    reason: "Rectificación sintética",
    items: [
      {
        original_item_id: originalItem.id,
        product_id: "prod-1",
        quantity: 3,
        unit_price: "0.31",
        unit_weight_kg: "17.002",
      },
    ],
  });
  const correctedItem = saleSummary(await session.state(), { id: sale }).items[0];
  await session.run("RETURN_CREATE", {
    sale_id: sale,
    return_date: scenarioDate,
    reason: "Retorno sintético",
    economic_amount: "0.01",
    items: [{ sale_item_id: correctedItem.id, quantity: 1 }],
  });
  await session.run("SALE_CANCEL", { id: sale, reason: "Anulación sintética", date: scenarioDate });
  await session.run("PAYMENT_REVERSE", {
    id: ids.payment,
    reason: "Reversión sintética",
    date: scenarioDate,
  });
  const expense = await session.run("EXPENSE_CREATE", {
    date: scenarioDate,
    category: "LOGISTICS",
    description: "Gasto sintético",
    amount: "0.01",
  });
  await session.run("EXPENSE_CANCEL", { id: expense, reason: "Anulación sintética" });
  await session.run("INVENTORY_ADJUST", {
    product_id: "prod-1",
    quantity: 1,
    weight_kg: "0.001",
    direction: "OUT",
    date: scenarioDate,
    reason: "Ajuste sintético",
  });
  summary = productionSummary(await session.state(), { id: production });
  await session.run("PRODUCTION_CORRECT_QUANTITIES", {
    id: production,
    reason: "Cantidad sintética",
    products: [{ product_id: "prod-1", nuclei_count: 2 }],
    costs: summary.costs.map((row) => ({ id: row.id, amount: row.amount / 100 })),
  });
  await session.run("PRODUCTION_CANCEL", {
    id: production,
    date: scenarioDate,
    reason: "Anulación sintética",
  });
  await session.run("CUSTOMER_DELETE", { id: ids.customer });
  return session.state();
}

// Only generated row IDs and creation timestamps differ legitimately between independent runs.
// Business dates, money, grams, request IDs, seeded IDs and actor identity remain exact.
function canonicalState(state, initial) {
  const initialIds = new Set(TABLES.flatMap((table) => initial[table].map((row) => row.id)));
  const ids = new Map();
  for (const table of TABLES)
    state[table].forEach((row, index) => {
      if (!initialIds.has(row.id)) ids.set(row.id, `${table}:${index}`);
    });
  state.inventoryMovements.forEach((movement, index) => {
    if (movement.source_type === "ADJUSTMENT" && !ids.has(movement.source_id)) {
      assert.match(movement.source_id, /^[0-9a-f-]{36}$/i);
      ids.set(movement.source_id, `adjustment:${index}`);
    }
  });
  function visit(value, key = "") {
    if (Array.isArray(value)) return value.map((entry) => visit(entry));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([name, entry]) => {
          if (["old_value", "new_value"].includes(name) && typeof entry === "string") {
            return [name, JSON.stringify(visit(JSON.parse(entry), value.field_name ?? ""))];
          }
          return [name, visit(entry, name)];
        }),
      );
    if (typeof value !== "string") return value;
    if (ids.has(value)) return ids.get(value);
    if (key.endsWith("_at") && /^\d{4}-\d\d-\d\dT/.test(value)) return "timestamp";
    return value;
  }
  return visit(state);
}

test(
  "Puerto SQLite de referencia y adaptador SQLite en disco conservan resultados e historial comercial equivalentes",
  { timeout: 180000 },
  async (t) => {
    const memory = memoryPersistence();
    t.after(memory.close);
    const disk = diskFixture(t);
    const referenceStore = createStore(() => memory.binding);
    const sqliteStore = createStore(() => disk.binding);
    const initial = seedState();
    initial.users.push({
      id: adminIdentity.userId,
      name: adminIdentity.displayName,
      role: "ADMIN",
      is_active: true,
      created_at: "2026-10-14T00:00:00.000Z",
      created_by: adminIdentity.userId,
    });
    await referenceStore.persistState(null, initial);
    await sqliteStore.persistState(null, initial);
    const reference = await historyScenario(referenceStore);
    const sqlite = await historyScenario(sqliteStore);
    assert.deepEqual(canonicalState(sqlite, initial), canonicalState(reference, initial));
    assert.deepEqual(balanceSummary(sqlite), balanceSummary(reference));
    assert.deepEqual(stock(sqlite, "prod-1"), stock(reference, "prod-1"));
    assert.deepEqual(await referenceStore.loadState(), reference);
    assert.deepEqual(await sqliteStore.loadState(), sqlite);
    assert.equal(sqlite.customers[0].deleted_by, adminIdentity.userId);
    assert.ok(sqlite.corrections.length > 0 && sqlite.correctionFields.length > 0 && sqlite.audit.length > 0);
  },
);
