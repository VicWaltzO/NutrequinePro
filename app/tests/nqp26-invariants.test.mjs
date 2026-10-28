import { test } from "node:test";
import assert from "node:assert/strict";
import { persistenceTest } from "./helpers/persistence-fixtures.mjs";
import { createStore } from "../lib/application-store.mjs";
import { stock, saleSummary } from "../lib/domain.mjs";
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
  ["I03", "entrada de 10 completa primero el faltante de 5 según fecha", "05/06"],
  ["I04", "fecha igual desempata por registro e identificador estable", "05/06"],
  ["I06", "cancelación libera exactamente la cobertura y la reasigna", "05"],
  ["I11", "ingreso directo atiende frascos sin planificar sacos", "05"],
  ["I14", "compra previa al corte no incrementa el saldo inicial", "21"],
  ["I15", "plan 20 y real 12 consume solo 12 y cierra preparación", "28"],
  ["I16", "preparar núcleos no ingresa sacos antes del cierre del molino", "28/30"],
  ["I17", "39 sacos reales reciben todo el costo aplicable del producto", "30/31"],
  ["I18", "rectificar cerrados preserva costos históricos y compensa", "34/35"],
  ["I19", "compra de dos microinsumos crea un único gasto", "22"],
];
for (const [id, expectation, task] of futureContracts)
  test.todo(`NQP26 ${id}: ${expectation} · pendiente NQP26-${task}`);
