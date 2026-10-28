import { persistenceTest as test } from "./helpers/persistence-fixtures.mjs";
import assert from "node:assert/strict";
import { saleSummary } from "../lib/domain.mjs";
import { regressionFixture, salePayload, rejectsWithoutChange } from "./helpers/regression-scenarios.mjs";

test("NQP26-02: duplicados compatibles se rechazan sin venta, cobro ni movimientos", async (t) => {
  const f = await regressionFixture(t);
  const row = { product_id: "prod-1", quantity: 1, unit_price: 73, unit_weight_kg: 25 };
  await rejectsWithoutChange(
    f,
    () =>
      f.run(
        "SALE_SAVE",
        salePayload(f.customer, {
          payment_condition: "CASH",
          payment_method: "TRANSFER",
          paid_amount: 73,
          items: [row, { ...row, quantity: 2, unit_price: "73.00", unit_weight_kg: "25.000" }],
        }),
      ),
    /líneas iguales/,
  );
  const sale = await f.run(
    "SALE_SAVE",
    salePayload(f.customer, {
      items: [row, { ...row, unit_price: 72 }, { ...row, unit_weight_kg: 24 }],
    }),
  );
  const state = await f.state();
  const items = saleSummary(state, { id: sale }).items;
  assert.deepEqual(
    items.map((line) => [line.unit_price, line.unit_weight_kg]),
    [
      [7300, 25000],
      [7200, 25000],
      [7300, 24000],
    ],
  );
  await rejectsWithoutChange(
    f,
    () =>
      f.run("SALE_CORRECT", {
        id: sale,
        reason: "Duplicado nuevo sintético",
        items: [row, row],
      }),
    /líneas iguales/,
  );
});

test("NQP26-02: rectificar legacy preserva identidades duplicadas previas, no permite crear otras", async (t) => {
  const f = await regressionFixture(t);
  const sale = await f.run(
    "SALE_SAVE",
    salePayload(f.customer, {
      items: [{ product_id: "prod-1", quantity: 1, unit_price: 73, unit_weight_kg: 25 }],
    }),
  );
  const before = await f.state();
  const legacy = structuredClone(before);
  const first = legacy.saleItems.find((row) => row.sale_id === sale);
  for (const field of ["presentation_unit_snapshot", "weight_policy_snapshot", "unit_weight_grams_snapshot"])
    delete first[field];
  legacy.saleItems.push({ ...first, id: "legacy-second-item" });
  await f.store.persistState(before, legacy);
  const originals = structuredClone(legacy.saleItems);
  const rows = originals.map((line) => ({
    original_item_id: line.id,
    product_id: line.product_id,
    quantity: 2,
    unit_price: 73,
    unit_weight_kg: 25,
  }));
  await f.run("SALE_CORRECT", { id: sale, reason: "Conservar líneas históricas", items: rows });
  const corrected = await f.state();
  assert.equal(saleSummary(corrected, { id: sale }).items.length, 2);
  for (const original of originals)
    assert.deepEqual(
      corrected.saleItems.find((row) => row.id === original.id),
      { ...original, is_current: false },
    );
  const current = saleSummary(corrected, { id: sale }).items;
  const repeated = {
    original_item_id: current[0].id,
    product_id: "prod-1",
    quantity: 1,
    unit_price: 73,
    unit_weight_kg: 25,
  };
  await rejectsWithoutChange(
    f,
    () => f.run("SALE_CORRECT", { id: sale, reason: "Identidad repetida", items: [repeated, repeated] }),
    /histórica está repetida/,
  );
});
