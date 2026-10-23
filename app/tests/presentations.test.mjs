import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { persistenceTest, temporaryDataDirectory } from "./helpers/persistence-fixtures.mjs";
import {
  regressionFixture,
  rejectsWithoutChange,
  scenarioSession,
  adminIdentity,
  salePayload,
} from "./helpers/regression-scenarios.mjs";
import { stock, saleSummary, seedState, executeCommand } from "../lib/domain.mjs";
import { productPresentation, unitLabels } from "../shared/domain/presentation.mjs";
import { saleReport } from "../features/documentos/domain/operation-reports.ts";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { backupDatabase, restoreDatabase, verifyBackup } from "../lib/sqlite/recovery.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";

// Only synthetic prices/quantities are used here; no business master is seeded by the application.
export const bottleInput = {
  name: "CascoPlus+",
  category: "SUPPLEMENT",
  presentation_unit: "BOTTLE",
  unit_weight_grams: 2200,
  weight_policy: "FIXED",
  stock_entry_mode: "DIRECT_STOCK",
  is_active: true,
  is_sellable: true,
  default_sale_price: "12.34",
};
const day = "2026-10-22";
const receipt = (product_id, quantity = 5, extra = {}) => ({
  product_id,
  quantity,
  direction: "IN",
  date: day,
  reason: "Ingreso físico sintético",
  ...extra,
});
const sale = (f, product, extra = {}) =>
  salePayload(f.customer, { items: [{ product_id: product, quantity: 2 }], ...extra });

persistenceTest(
  "presentaciones: ficha incompleta sin precio, validación e idempotencia sin fórmulas ni stock inventados",
  async (t) => {
    const f = await regressionFixture(t);
    const id = await f.run(
      "PRODUCT_SAVE",
      { ...bottleInput, is_sellable: false, default_sale_price: null },
      "bottle-master",
    );
    assert.equal(
      await f.run(
        "PRODUCT_SAVE",
        { ...bottleInput, is_sellable: false, default_sale_price: null },
        "bottle-master",
      ),
      id,
    );
    let state = await f.state();
    const product = state.products.find((x) => x.id === id);
    assert.equal(product.default_sale_price, null);
    assert.equal(product.bags_per_nucleus, undefined);
    assert.equal(product.commercial_weight_per_nucleus_kg, undefined);
    assert.equal(product.standard_bag_weight_kg, undefined);
    assert.equal(state.formulas.filter((x) => x.product_id === id).length, 0);
    assert.deepEqual(stock(state, id), { quantity: 0, weight_kg: 0, committed: 0 });
    await rejectsWithoutChange(f, () => f.run("SALE_SAVE", sale(f, id)), /habilitado/);
    await rejectsWithoutChange(
      f,
      () => f.run("PRODUCT_SAVE", { ...bottleInput, id, default_sale_price: null }),
      /precio base/,
    );
    await rejectsWithoutChange(f, () => f.run("PRODUCT_SAVE", bottleInput), /Ya existe/);
    await f.run("PRODUCT_SAVE", { ...bottleInput, id });
    state = await f.state();
    assert.equal(state.products.filter((x) => x.name === "CascoPlus+").length, 1);
    assert.ok(!state.products.some((x) => x.name === "CASCOQUINE"));
    for (const invalid of [
      { presentation_unit: "UNKNOWN" },
      { weight_policy: "VARIABLE" },
      { unit_weight_grams: 2.2 },
      { stock_entry_mode: "NUCLEUS_PRODUCTION" },
      { image: "https://example.com/photo.jpg" },
    ])
      await rejectsWithoutChange(f, () => f.run("PRODUCT_SAVE", { ...bottleInput, id, ...invalid }));
  },
);

persistenceTest(
  "presentaciones: 5 frascos, entrega 2, devolución 1 y anulación exacta sin duplicados",
  async (t) => {
    const f = await regressionFixture(t);
    const product = await f.run("PRODUCT_SAVE", bottleInput);
    await f.run("INVENTORY_ADJUST", receipt(product));
    assert.equal(stock(await f.state(), product).weight_kg, 11000);
    const id = await f.run("SALE_SAVE", sale(f, product, { deliver: true }));
    let state = await f.state();
    const line = saleSummary(state, { id }).items[0];
    assert.equal(line.subtotal, 2468);
    assert.equal(line.total_weight_kg, 4400);
    assert.equal(line.presentation_unit_snapshot, "BOTTLE");
    assert.deepEqual(stock(state, product), { quantity: 3, weight_kg: 6600, committed: 0 });
    const returnPayload = {
      sale_id: id,
      return_date: day,
      reason: "Retorno sintético",
      economic_amount: "1.00",
      items: [{ sale_item_id: line.id, quantity: 1 }],
    };
    await f.run("RETURN_CREATE", returnPayload, "bottle-return");
    await f.run("RETURN_CREATE", returnPayload, "bottle-return");
    state = await f.state();
    assert.deepEqual(stock(state, product), { quantity: 4, weight_kg: 8800, committed: 0 });
    assert.equal(state.returnItems.filter((x) => x.sale_item_id === line.id).length, 1);
    assert.equal(saleSummary(state, { id }).total, 2368);
    assert.equal(state.inventoryMovements.at(-1).presentation_unit_snapshot, "BOTTLE");
    for (const quantity of [0.5, 2])
      await rejectsWithoutChange(f, () =>
        f.run("RETURN_CREATE", { ...returnPayload, items: [{ sale_item_id: line.id, quantity }] }),
      );
    await f.run("SALE_CANCEL", { id, reason: "Anulación sintética" });
    assert.deepEqual(stock(await f.state(), product), { quantity: 5, weight_kg: 11000, committed: 0 });
  },
);

persistenceTest(
  "presentaciones: API rechaza pesos alterados, fracciones, stock insuficiente y producción incompatible atómicamente",
  async (t) => {
    const f = await regressionFixture(t);
    const product = await f.run("PRODUCT_SAVE", bottleInput);
    await f.run("INVENTORY_ADJUST", receipt(product));
    for (const item of [
      { quantity: 3, unit_weight_kg: 25 },
      { quantity: 2, unit_weight_kg: 2 },
      { quantity: 1.5 },
      { quantity: 6 },
    ])
      await rejectsWithoutChange(f, () =>
        f.run("SALE_SAVE", sale(f, product, { items: [{ product_id: product, ...item }], deliver: true })),
      );
    for (const invalid of [
      { quantity: 1.5 },
      { weight_kg: "10" },
      { weight_kg: "11.001" },
      { direction: "BAD" },
      { direction: "OUT", quantity: 6 },
    ])
      await rejectsWithoutChange(f, () => f.run("INVENTORY_ADJUST", receipt(product, 5, invalid)));
    await rejectsWithoutChange(
      f,
      () =>
        f.run("PRODUCTION_SAVE", {
          production_date: day,
          products: [{ product_id: product, nuclei_count: 1 }],
          confirm: true,
        }),
      /ingreso directo/,
    );
    await rejectsWithoutChange(
      f,
      () =>
        f.run("FORMULA_SAVE", {
          product_id: product,
          ingredients: [{ ingredient_id: "ing-1", kg_per_nucleus: 1 }],
        }),
      /ingreso directo/,
    );
    const id = await f.run("SALE_SAVE", sale(f, product, { items: [{ product_id: product, quantity: 3 }] }));
    const line = saleSummary(await f.state(), { id }).items[0];
    assert.equal(line.total_weight_kg, 6600);
    assert.equal(line.subtotal, 3702);
    await rejectsWithoutChange(
      f,
      () => f.run("PRODUCT_SAVE", { ...bottleInput, id: product, unit_weight_grams: 3000 }),
      /historial/,
    );
  },
);

persistenceTest(
  "presentaciones: venta futura de frascos y venta mixta planifican solo sacos y entregan con stock físico",
  async (t) => {
    const f = await regressionFixture(t);
    const product = await f.run("PRODUCT_SAVE", bottleInput);
    const id = await f.run("SALE_SAVE", sale(f, product, { create_production: true }));
    let state = await f.state();
    assert.equal(state.productions.length, 0);
    assert.deepEqual(stock(state, product), { quantity: 0, weight_kg: 0, committed: 2 });
    await rejectsWithoutChange(f, () => f.run("SALE_DELIVER", { id }), /insuficiente/);
    const mixed = await f.run(
      "SALE_SAVE",
      sale(f, product, {
        create_production: true,
        items: [
          { product_id: product, quantity: 1 },
          { product_id: "prod-1", quantity: 1, unit_weight_kg: "25.001" },
        ],
      }),
    );
    state = await f.state();
    assert.equal(state.productions.length, 1);
    assert.deepEqual(
      state.productionProducts.map((x) => x.product_id),
      ["prod-1"],
    );
    assert.equal(stock(state, product).quantity, 0);
    await f.run("INVENTORY_ADJUST", receipt(product));
    await f.run("SALE_DELIVER", { id });
    await f.run("INVENTORY_ADJUST", receipt("prod-1", 1, { weight_kg: "25.001" }));
    await f.run("SALE_DELIVER", { id: mixed });
    state = await f.state();
    assert.deepEqual(stock(state, product), { quantity: 2, weight_kg: 4400, committed: 0 });
    const report = saleReport(state, mixed, new Date().toISOString());
    assert.deepEqual(
      report.items.map((x) => x.units),
      ["frascos", "sacos"],
    );
    assert.equal(report.items[0].bagWeight, 2200);
    const original = structuredClone(state.saleItems);
    await f.run("PRODUCT_SAVE", {
      ...bottleInput,
      id: product,
      name: "Suplemento sintético actualizado",
      default_sale_price: "99.00",
    });
    assert.deepEqual((await f.state()).saleItems, original);
  },
);

test("presentaciones: compatibilidad histórica BASE 50 kg, otros 25 kg y rectificación de peso extraordinario", () => {
  let state = seedState();
  const admin = { id: "admin", role: "ADMIN", name: "Sintético", is_active: true };
  const run = (type, payload) => {
    const result = executeCommand(state, { type, payload }, admin);
    state = result.state;
    return result.result;
  };
  for (const product of state.products)
    assert.equal(productPresentation(product).unit_weight_grams, product.name === "BASE" ? 50000 : 25000);
  const customer = run("CUSTOMER_SAVE", { name: "Histórico sintético" });
  const id = run(
    "SALE_SAVE",
    salePayload(customer, { items: [{ product_id: "prod-1", quantity: 3, unit_weight_kg: "17.001" }] }),
  );
  const old = state.saleItems[0];
  delete old.presentation_unit_snapshot;
  delete old.weight_policy_snapshot;
  delete old.unit_weight_grams_snapshot;
  run("SALE_CORRECT", {
    id,
    reason: "Preservar peso histórico",
    items: [{ original_item_id: old.id, product_id: "prod-1", quantity: 3, unit_weight_kg: "17.001" }],
  });
  const line = saleSummary(state, { id }).items[0];
  assert.equal(line.total_weight_kg, 51003);
  assert.equal(line.presentation_unit_snapshot, "BAG");
  assert.equal(unitLabels(line).plural, "sacos");
});

persistenceTest(
  "presentaciones: rectificación entregada compensa gramos y conserva precio y presentación históricos",
  async (t) => {
    const f = await regressionFixture(t);
    const product = await f.run("PRODUCT_SAVE", bottleInput);
    await f.run("INVENTORY_ADJUST", receipt(product));
    const id = await f.run("SALE_SAVE", sale(f, product, { deliver: true }));
    const old = saleSummary(await f.state(), { id }).items[0];
    await f.run("PRODUCT_SAVE", { ...bottleInput, id: product, default_sale_price: "99.00" });
    const input = {
      id,
      reason: "Cantidad rectificada sintética",
      items: [
        { original_item_id: old.id, product_id: product, quantity: 1, unit_price: old.unit_price / 100 },
      ],
    };
    await rejectsWithoutChange(
      f,
      () => f.run("SALE_CORRECT", { ...input, items: [{ ...input.items[0], unit_weight_kg: 25 }] }),
      /peso/,
    );
    await f.run("SALE_CORRECT", input);
    const state = await f.state();
    const line = saleSummary(state, { id }).items[0];
    assert.equal(line.reference_unit_price, old.reference_unit_price);
    assert.equal(line.unit_price, old.unit_price);
    assert.equal(line.presentation_unit_snapshot, "BOTTLE");
    assert.deepEqual(stock(state, product), { quantity: 4, weight_kg: 8800, committed: 0 });
    assert.deepEqual(
      state.saleItems.find((x) => x.id === old.id),
      { ...old, is_current: false },
    );
  },
);

test("presentaciones: SQLite nuevo conserva atributos y movimientos al cerrar, reiniciar y restaurar respaldo", async (t) => {
  let connection;
  const root = temporaryDataDirectory(t, () => connection?.close());
  const directory = createPrivateDirectory(join(root, "private"));
  const filename = join(directory, "new.sqlite");
  initializeDatabase(filename);
  connection = openSqliteDatabase(filename);
  let store = createStore(() => connection);
  await store.ensureState(adminIdentity);
  const f = scenarioSession(store);
  const product = await f.run("PRODUCT_SAVE", bottleInput);
  await f.run("INVENTORY_ADJUST", receipt(product));
  const before = await f.state();
  connection.close();
  connection = openSqliteDatabase(filename);
  store = createStore(() => connection);
  assert.deepEqual(await store.loadState(), before);
  const backup = join(directory, "copy.sqlite");
  await backupDatabase(filename, backup);
  verifyBackup(backup);
  const restored = join(directory, "restored.sqlite");
  await restoreDatabase(backup, restored);
  const restoredConnection = openSqliteDatabase(restored);
  try {
    assert.deepEqual(await createStore(() => restoredConnection).loadState(), before);
  } finally {
    restoredConnection.close();
  }
});
