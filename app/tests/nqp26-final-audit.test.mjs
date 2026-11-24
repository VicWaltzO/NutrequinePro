import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../lib/application-store.mjs";
import { stock } from "../lib/domain.mjs";
import { diskFixture, persistenceTest } from "./helpers/persistence-fixtures.mjs";
import { regressionFixture, salePayload, scenarioDate } from "./helpers/regression-scenarios.mjs";
import { ready, apply, closeCommand } from "./helpers/mill-fixture.mjs";

persistenceTest("NQP40: las unidades remanentes conservan peso y el rechazo no escribe", async (t) => {
  const f = await regressionFixture(t);
  const adjust = (quantity, weight_kg, direction = "IN") =>
    f.run("INVENTORY_ADJUST", {
      product_id: "prod-1",
      quantity,
      weight_kg,
      direction,
      date: scenarioDate,
      reason: "Conteo sintético",
    });
  const original = await f.state();
  await assert.rejects(adjust(2, "0.001"), /gramo por unidad/);
  assert.deepEqual(await f.state(), original);
  await adjust(2, "50");
  const before = await f.state();
  await assert.rejects(adjust(2, "0.001"), /gramo por unidad/);
  await assert.rejects(adjust(1, "50", "OUT"), /unidades remanentes/);
  const deliver = (quantity, unit_weight_kg) =>
    f.run(
      "SALE_SAVE",
      salePayload(f.customer, {
        deliver: true,
        items: [{ product_id: "prod-1", quantity, unit_price: "100", unit_weight_kg }],
      }),
    );
  await assert.rejects(deliver(1, "50"), /Stock físico insuficiente/);
  assert.deepEqual(await f.state(), before);
  await deliver(2, "24");
  assert.deepEqual(stock(await f.state(), "prod-1"), { quantity: 0, weight_kg: 2000, committed: 0 });
  const after = await f.state();
  await assert.rejects(deliver(1, "1"), /Stock físico insuficiente/);
  assert.deepEqual(await f.state(), after);
});

persistenceTest(
  "NQP40: rectificación registra el estado financiero final en toda la auditoría",
  async (t) => {
    const f = await regressionFixture(t);
    const id = await f.run(
      "SALE_SAVE",
      salePayload(f.customer, {
        payment_condition: "CASH",
        payment_method: "CASH",
        payment_date: scenarioDate,
        paid_amount: "73.01",
        items: [{ product_id: "prod-1", quantity: 2, unit_price: "73.01" }],
      }),
    );
    const before = await f.state();
    const item = before.saleItems.find((row) => row.sale_id === id);
    await f.run("SALE_CORRECT", {
      id,
      reason: "Cantidad sintética corregida",
      items: [{ product_id: "prod-1", original_item_id: item.id, quantity: 1 }],
    });
    const after = await f.state();
    const correction = after.corrections.find((row) => row.entity_type === "SALE" && row.entity_id === id);
    const field = after.correctionFields.find(
      (row) => row.correction_id === correction.id && row.field_name === "sale",
    );
    assert.equal(correction.old_snapshot.sale.financial_status, "PARTIAL");
    assert.equal(correction.new_snapshot.sale.financial_status, "PAID");
    assert.deepEqual(
      correction.new_snapshot.sale,
      after.sales.find((sale) => sale.id === id),
    );
    assert.deepEqual(JSON.parse(field.new_value), correction.new_snapshot.sale);
    assert.deepEqual(after.payments, before.payments);
    assert.deepEqual(after.inventoryMovements, before.inventoryMovements);
  },
);

test("NQP40: importación rechaza sacos incongruentes con la auditoría del molino", async (t) => {
  const f = ready();
  const { binding, database } = diskFixture(t);
  const store = createStore(() => binding, f.options);
  const valid = apply(f.s, closeCommand(f.s, 39), f.options).state;
  const invalid = structuredClone(valid);
  const closure = invalid.millClosures[0];
  const entry = invalid.inventoryMovements.find((move) => move.id === closure.movement_id);
  closure.actual_bags = 40;
  closure.waste_grams = 0;
  entry.quantity = 40;
  entry.weight_kg = 1000000;
  await assert.rejects(store.persistState(null, invalid), /auditoría.*cierre del molino/);
  assert.equal(await store.loadState(), null);
  await store.persistState(null, valid);
  assert.equal((await store.loadState()).millClosures[0].actual_bags, 39);
  assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
});
