import { test } from "node:test";
import assert from "node:assert/strict";
import { persistenceTest } from "./helpers/persistence-fixtures.mjs";
import { createStore } from "../lib/application-store.mjs";
import { stock, saleSummary, executeCommand } from "../lib/domain.mjs";
import { coverageFixture, currentRows, coverageOptions } from "./helpers/coverage-fixtures.mjs";
import {
  regressionFixture,
  scenarioSession,
  productionPayload,
  salePayload,
  paymentPayload,
  rejectsWithoutChange,
} from "./helpers/regression-scenarios.mjs";

persistenceTest("NQP26 I05: cobrar un pedido pendiente conserva stock y no lo entrega", async (t) => {
  const f = await regressionFixture(t);
  const sale = await f.run("SALE_SAVE", salePayload(f.customer));
  const before = await f.state();
  await f.run("PAYMENT_CREATE", paymentPayload(f.customer, sale));
  const after = await f.state();
  assert.deepEqual(after.inventoryMovements, before.inventoryMovements);
  assert.deepEqual(stock(after, "prod-1"), stock(before, "prod-1"));
  assert.equal(after.sales.find((row) => row.id === sale).fulfillment_status, "PENDING");
  assert.equal(saleSummary(after, { id: sale }).paid, 1001);
  assert.equal(saleSummary(after, { id: sale }).balance, 28203);
});

persistenceTest(
  "NQP26 I08: reintentar venta, cobro y salida idénticos conserva el documento completo",
  async (t) => {
    const f = await regressionFixture(t);
    await f.run("PRODUCTION_SAVE", productionPayload());
    const payload = salePayload(f.customer, {
      deliver: true,
      payment_condition: "CASH",
      payment_method: "TRANSFER",
      paid_amount: "10.01",
      items: [{ product_id: "prod-1", quantity: 4, unit_weight_kg: 25, unit_price: "73.01" }],
    });
    const first = await f.run("SALE_SAVE", payload, "nqp26-sale-retry");
    const beforeRetry = await f.state();
    const second = await f.run("SALE_SAVE", structuredClone(payload), "nqp26-sale-retry");
    assert.equal(first, second);
    const after = await f.state();
    assert.deepEqual(after, beforeRetry);
    assert.equal(after.inventoryMovements.filter((row) => row.source_id === first).length, 1);
    assert.equal(after.payments.length, 1);
    assert.equal(after.audit.filter((row) => row.request_id === "nqp26-sale-retry").length, 1);
  },
);

persistenceTest(
  "NQP26 I20: fallo SQL entre escritura comercial y auditoría revierte y admite reintento",
  async (t) => {
    const f = await regressionFixture(t);
    await f.run("PRODUCTION_SAVE", productionPayload());
    const before = await f.state();
    let injected = false;
    const binding = {
      ...f.database.binding,
      batch(statements) {
        const auditIndex = statements.findIndex((statement) => statement.sql.startsWith("INSERT INTO audit"));
        if (auditIndex === -1) return f.database.binding.batch(statements);
        injected = true;
        const invalid = f.database.binding
          .prepare("INSERT INTO customer_sites(id,data,customer_id,site_id) VALUES (?,?,?,?)")
          .bind("nqp26-fault", "{}", f.customer, "missing-site");
        return f.database.binding.batch([
          ...statements.slice(0, auditIndex),
          invalid,
          ...statements.slice(auditIndex),
        ]);
      },
    };
    const failing = scenarioSession(createStore(() => binding));
    const payload = salePayload(f.customer, {
      deliver: true,
      payment_condition: "CASH",
      payment_method: "TRANSFER",
      items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 25, unit_price: 73 }],
    });
    await assert.rejects(failing.run("SALE_SAVE", payload, "nqp26-atomic"), /FOREIGN KEY/);
    assert.equal(injected, true);
    assert.deepEqual(await f.state(), before);
    const sale = await f.run("SALE_SAVE", payload, "nqp26-atomic");
    const committed = await f.state();
    assert.equal(committed.sales.find((row) => row.id === sale).commercial_status, "CONFIRMED");
    assert.equal(committed.payments.length, 1);
    assert.equal(committed.audit.filter((row) => row.request_id === "nqp26-atomic").length, 1);
    assert.equal(f.database.database.prepare("SELECT count(*) AS n FROM transaction_guards").get().n, 0);
  },
);

persistenceTest(
  "NQP26 DC01: reconfirmar producción con otro request_id no duplica entradas ni consumos",
  async (t) => {
    const f = await regressionFixture(t);
    const production = await f.run("PRODUCTION_SAVE", productionPayload());
    await rejectsWithoutChange(
      f,
      () => f.run("PRODUCTION_CONFIRM", { id: production }, "nqp26-confirm-again"),
      /ya confirmada/,
    );
  },
);

// These are future acceptance contracts, not evidence that the features work.
// See docs/actualizacion-seguridad/NQP26-01_MATRIZ_PRUEBAS.md before activating them.
// I01/I02/I10/I12/I13 now run in nqp26-reservations.test.mjs;
// I07 in nqp26-reservations-http.test.mjs; I09 in command-replay.test.mjs and HTTP.
const futureContracts = [
  ["I14", "compra previa al corte no incrementa el saldo inicial", "21"],
  ["I15", "plan 20 y real 12 consume solo 12 y cierra preparación", "28"],
  ["I16", "preparar núcleos no ingresa sacos antes del cierre del molino", "28/30"],
  ["I17", "39 sacos reales reciben todo el costo aplicable del producto", "30/31"],
  ["I18", "rectificar cerrados preserva costos históricos y compensa", "34/35"],
  ["I19", "compra de dos microinsumos crea un único gasto", "22"],
];
for (const [id, expectation, task] of futureContracts)
  test.todo(`NQP26 ${id}: ${expectation} · pendiente NQP26-${task}`);

persistenceTest("NQP26 I03: entrada 10 completa 5 y asigna otros 5 por entrega", async (t) => {
  const f = await coverageFixture(t);
  await f.adjust(35);
  const a = await f.sell(40);
  const b = await f.sell(35, "2026-11-02");
  await f.adjust(10);
  const s = await f.state();
  assert.deepEqual(
    [a, b].map((id) => currentRows(s, id)[0].coverage.quantity),
    [40, 5],
  );
  assert.equal(stock(s, "prod-1").quantity, 0);
  assert.equal(stock(s, "prod-1").weight_kg, 0);
  assert.ok(s.sales.every((r) => r.fulfillment_status === "PENDING"));
});

persistenceTest("NQP26 I04: cola real desempata por instante UTC, ID ordinal y línea", async (t) => {
  const f = await coverageFixture(t);
  const ids = [await f.sell(1), await f.sell(1), await f.sell(1)];
  const before = await f.state();
  const prepared = structuredClone(before);
  const ordinal = [...ids].sort();
  for (const sale of prepared.sales) sale.created_at = "2026-10-29T12:00:00Z";
  prepared.sales.find((s) => s.id === ordinal[1]).created_at = "2026-10-29T07:00:00-05:00";
  prepared.sales.find((s) => s.id === ordinal[2]).created_at = "2026-10-29T11:59:59Z";
  prepared.sales.reverse();
  prepared.saleItems.reverse();
  const command = { type: "INVENTORY_ADJUST", payload: f.adjustment(2), request_id: "permuted-queue" };
  const actor = prepared.users.find((u) => u.role === "ADMIN");
  const permuted = structuredClone(prepared);
  permuted.sales.reverse();
  permuted.saleItems.reverse();
  const allocated = [prepared, permuted].map(
    (state) => executeCommand(state, command, actor, "2026-10-29T13:00:00Z", coverageOptions).state,
  );
  const quantities = (state) => ordinal.map((id) => currentRows(state, id)[0].coverage.quantity);
  assert.deepEqual(quantities(allocated[0]), quantities(allocated[1]));
  assert.deepEqual(quantities(allocated[0]), [1, 0, 1]);
  await f.store.persistState(before, prepared);
  await f.adjust(1);
  let s = await f.state();
  assert.equal(currentRows(s, ordinal[2])[0].coverage.quantity, 1);
  await f.adjust(1);
  s = await f.state();
  assert.equal(currentRows(s, ordinal[0])[0].coverage.quantity, 1);
  assert.equal(currentRows(s, ordinal[1])[0].coverage.quantity, 0);
});

persistenceTest("NQP26 I06: cancelar libera 8, cubre 4 y deja 4 comerciales", async (t) => {
  const f = await coverageFixture(t);
  await f.adjust(8);
  const a = await f.sell(10);
  const b = await f.sell(4);
  await f.run("SALE_CANCEL", { id: a, reason: "Ensayo liberación" });
  const s = await f.state();
  assert.equal(currentRows(s, a)[0].coverage.quantity, 0);
  assert.equal(currentRows(s, b)[0].coverage.quantity, 4);
  assert.equal(stock(s, "prod-1").quantity, 4);
  assert.equal(stock(s, "prod-1").weight_kg, 100000);
});

persistenceTest("NQP26 I11: reposición directa de frascos sin lote de núcleos", async (t) => {
  const f = await coverageFixture(t);
  const product_id = await f.run("PRODUCT_SAVE", {
    name: "CascoPlus+ sintético",
    presentation_unit: "BOTTLE",
    unit_weight_grams: 2200,
    weight_policy: "FIXED",
    stock_entry_mode: "DIRECT_STOCK",
    default_sale_price: 10,
    is_sellable: true,
  });
  const id = await f.sell(2, "2026-11-01", { items: [{ product_id, quantity: 2, unit_weight_kg: 2.2 }] });
  await f.adjust(2, product_id, 4.4);
  const s = await f.state();
  assert.equal(currentRows(s, id)[0].coverage.quantity, 2);
  assert.equal(currentRows(s, id)[0].coverage.weight_grams, 4400);
  assert.equal(stock(s, product_id).quantity, 0);
  assert.equal(s.productions.length, 0);
});
