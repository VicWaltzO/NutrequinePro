import { test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { join } from "node:path";
import { createD1Adapter } from "../lib/adapters/d1.ts";
import { createStore } from "../lib/application-store.mjs";
import { TABLES, seedState, productionSummary, saleSummary, balanceSummary, stock } from "../lib/domain.mjs";
import { diskFixture, historicalSchema, temporaryDataDirectory } from "./helpers/persistence-fixtures.mjs";
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
  "D1 real en Miniflare y SQLite en disco conservan resultados e historial comercial equivalentes",
  { timeout: 180000 },
  async (t) => {
    let miniflare;
    const directory = temporaryDataDirectory(t, async () => {
      await miniflare?.dispose();
    });
    miniflare = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("synthetic"); } };',
      compatibilityDate: "2026-05-15",
      host: "127.0.0.1",
      port: 0,
      inspectorPort: 0,
      cf: false,
      d1Databases: { DB: "synthetic-parity-05" },
      d1Persist: join(directory, "d1"),
    });
    const native = await miniflare.getD1Database("DB");
    await native.batch(
      historicalSchema
        .split("--> statement-breakpoint")
        .map((sql) => sql.trim())
        .filter(Boolean)
        .map((sql) => native.prepare(sql)),
    );
    const disk = diskFixture(t);
    const d1Store = createStore(() => createD1Adapter(native));
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
    await d1Store.persistState(null, initial);
    await sqliteStore.persistState(null, initial);
    const d1 = await historyScenario(d1Store);
    const sqlite = await historyScenario(sqliteStore);
    assert.deepEqual(canonicalState(sqlite, initial), canonicalState(d1, initial));
    assert.deepEqual(balanceSummary(sqlite), balanceSummary(d1));
    assert.deepEqual(stock(sqlite, "prod-1"), stock(d1, "prod-1"));
    assert.deepEqual(await d1Store.loadState(), d1);
    assert.deepEqual(await sqliteStore.loadState(), sqlite);
    assert.equal(sqlite.customers[0].deleted_by, adminIdentity.userId);
    assert.ok(sqlite.corrections.length > 0 && sqlite.correctionFields.length > 0 && sqlite.audit.length > 0);
  },
);
