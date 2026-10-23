import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nucleusHundredths,
  perNucleusAmount,
  productionYield,
} from "../shared/domain/production-quantities.mjs";

test("núcleos: coma y punto equivalentes, dos decimales y límites explícitos", () => {
  for (const value of ["0,50", "0.50", 0.5]) assert.equal(nucleusHundredths(value), 50);
  assert.equal(nucleusHundredths("1,01"), 101);
  assert.equal(nucleusHundredths("10000000"), 1e9);
  for (const value of [
    "0,001",
    "0.001",
    "1,000.00",
    "1.000,00",
    "1e2",
    "-1",
    "",
    null,
    true,
    [],
    {},
    NaN,
    Infinity,
    "10000000.01",
  ])
    assert.throws(() => nucleusHundredths(value));
});

test("núcleos: gramos y céntimos se redondean a enteros sin residuos binarios", () => {
  assert.equal(perNucleusAmount(123001, 29), 35670);
  assert.equal(perNucleusAmount(1, 50), 1);
  assert.equal(perNucleusAmount(25000, 50), 12500);
});

test("núcleos: rendimiento proporcional, máximo de sacos completos y remanente no comercial", () => {
  assert.deepEqual(productionYield(100, 25, 625000), { bags: 25, weight: 625000, nonCommercialWeight: 0 });
  assert.deepEqual(productionYield(50, 25, 625000), { bags: 12, weight: 300000, nonCommercialWeight: 12500 });
  assert.deepEqual(productionYield(101, 40, 1000000), {
    bags: 40,
    weight: 1000000,
    nonCommercialWeight: 10000,
  });
  assert.deepEqual(productionYield(29, 40, 1000000), {
    bags: 11,
    weight: 275000,
    nonCommercialWeight: 15000,
  });
});

import { createStore } from "../lib/application-store.mjs";
import { productionSummary, stock, seedState } from "../lib/domain.mjs";
import { productionFormPreview } from "../features/produccion/hooks/production-form-preview.ts";
import { persistenceTest, testDatabase } from "./helpers/persistence-fixtures.mjs";
import { randomUUID } from "node:crypto";

persistenceTest(
  "núcleos decimales: 3,57 persiste, confirma, rectifica y anula sin stock fraccionario",
  async (t) => {
    const database = testDatabase(t);
    const store = createStore(() => database.binding);
    const admin = { userId: "decimal-admin", displayName: "Administrador sintético" };
    await store.ensureState(admin);
    const run = async (type, payload) => store.runCommand({ type, payload, request_id: randomUUID() }, admin);
    const input = {
      production_date: "2026-10-23",
      products: [{ product_id: "prod-1", nuclei_count: "3,57" }],
      nucleus_cost: "0.01",
      packaging_cost: "0.01",
      confirm: false,
    };
    const initial = await store.loadState();
    const comma = productionFormPreview(initial, { "prod-1": "3,57" }, {}, [], input);
    const point = productionFormPreview(initial, { "prod-1": "3.57" }, {}, [], input);
    assert.deepEqual(comma, point);
    assert.equal(comma.nuclei, 3.57);
    assert.equal(comma.bags, 142);
    assert.equal(comma.weight, 3550000);
    assert.equal(comma.nonCommercialWeight, 20000);
    const saved = await run("PRODUCTION_SAVE", input);
    const id = saved.result;
    let state = await store.loadState();
    let summary = productionSummary(state, { id });
    assert.equal(summary.bags, 142);
    assert.equal(summary.weight, 3550000);
    assert.equal(summary.products[0].nuclei_count, 3.57);
    assert.equal(summary.products[0].formula_weight_kg, 3527160);
    assert.equal(summary.costs.find((row) => row.category === "NUCLEUS").amount, 4);
    assert.equal(summary.costs.find((row) => row.category === "PACKAGING").amount, 142);
    assert.equal(summary.estimated, comma.estimated);
    assert.equal(stock(state, "prod-1").quantity, 0);
    for (const nuclei_count of ["3,571", "3.571", "-1", true, null, "1,000.00"]) {
      await assert.rejects(
        run("PRODUCTION_SAVE", { ...input, id, products: [{ product_id: "prod-1", nuclei_count }] }),
      );
      assert.deepEqual(await store.loadState(), state);
    }
    await run("PRODUCTION_CONFIRM", { id });
    state = await store.loadState();
    const historical = productionSummary(state, { id }).products[0];
    assert.equal(stock(state, "prod-1").quantity, 142);
    assert.equal(stock(state, "prod-1").weight_kg, 3550000);
    await run("PRODUCTION_CORRECT_QUANTITIES", {
      id,
      reason: "Corrección decimal sintética",
      products: [{ product_id: "prod-1", nuclei_count: "1.25" }],
    });
    state = await store.loadState();
    summary = productionSummary(state, { id });
    assert.equal(summary.products[0].nuclei_count, 1.25);
    assert.equal(summary.bags, 50);
    assert.equal(summary.weight, 1250000);
    assert.equal(stock(state, "prod-1").quantity, 50);
    assert.equal(stock(state, "prod-1").weight_kg, 1250000);
    assert.equal(state.productionProducts.find((row) => row.id === historical.id).nuclei_count, 3.57);
    assert.ok(
      summary.ingredients.every(
        (row) => Number.isSafeInteger(row.total_kg) && Number.isSafeInteger(row.theoretical_gross_cost),
      ),
    );
    await run("PRODUCTION_CANCEL", { id, reason: "Anulación sintética" });
    state = await store.loadState();
    assert.equal(stock(state, "prod-1").quantity, 0);
    assert.equal(stock(state, "prod-1").weight_kg, 0);
    assert.equal(
      state.inventoryMovements
        .filter((row) => row.item_type === "INGREDIENT")
        .reduce((total, row) => total + row.weight_kg, 0),
      0,
    );
  },
);

test("núcleos: vista previa fuera de rango informa un error sin romper el formulario", () => {
  const state = seedState();
  const quantity = productionFormPreview(state, { "prod-1": "10000000" }, {}, [], {
    nucleus_cost: 250,
    packaging_cost: 1.1,
  });
  assert.ok(quantity.errors.length > 0);
  const price = productionFormPreview(state, { "prod-1": "3,57" }, {}, [], {
    nucleus_cost: "999999999999999999999",
    packaging_cost: 1.1,
  });
  assert.ok(price.errors.length > 0);
});
