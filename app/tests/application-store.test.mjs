import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../lib/application-store.mjs";
import { DomainError, executeCommand, saleSummary, balanceSummary, stock } from "../lib/domain.mjs";
import { memoryPersistence } from "./helpers/memory-persistence.mjs";

const admin = { userId: "test-admin", displayName: "Administrador de prueba" };
const command = (type, payload, request_id) => ({ type, payload, request_id });

test("inicialización concurrente conserva un solo administrador y no reinicia la base", async (t) => {
  const database = memoryPersistence();
  t.after(database.close);
  const store = createStore(() => database.binding);
  assert.equal(await store.loadState(), null);
  const [first, second] = await Promise.all([
    store.ensureState(admin),
    store.ensureState({ userId: "other", displayName: "Otro usuario de prueba" }),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.users.length, 1);
  assert.equal(first.users[0].id, admin.userId);
  await store.runCommand(command("CUSTOMER_SAVE", { name: "Cliente persistente" }, "customer-1"), admin);
  assert.equal((await store.ensureState(admin)).customers.length, 1);
});

test("un reintento idempotente no duplica registros ni auditoría; otra identidad no puede escribir", async (t) => {
  const database = memoryPersistence();
  t.after(database.close);
  const store = createStore(() => database.binding);
  const input = command("CUSTOMER_SAVE", { name: "Cliente de prueba" }, "unique-request");
  const first = await store.runCommand(input, admin),
    retry = await store.runCommand(input, admin);
  assert.equal(retry.result, first.result);
  assert.equal(retry.state.customers.length, 1);
  assert.equal(retry.state.audit.length, 1);
  await assert.rejects(
    store.runCommand(input, { userId: "unauthorized", displayName: "Sin acceso" }),
    /Usuario sin acceso/,
  );
  assert.equal((await store.loadState()).revision, first.state.revision);
});

test("comandos simultáneos con revisión obsoleta no sobrescriben cambios y pueden reintentarse", async (t) => {
  const database = memoryPersistence();
  t.after(database.close);
  const store = createStore(() => database.binding);
  await store.ensureState(admin);
  const inputs = [
    command("CUSTOMER_SAVE", { name: "Primero" }, "request-a"),
    command("CUSTOMER_SAVE", { name: "Segundo" }, "request-b"),
  ];
  const results = await Promise.allSettled(inputs.map((input) => store.runCommand(input, admin)));
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  const rejected = results.findIndex((row) => row.status === "rejected");
  assert.ok(results[rejected].reason instanceof DomainError);
  assert.match(results[rejected].reason.message, /Otra operación/);
  assert.equal((await store.loadState()).customers.length, 1);
  await store.runCommand(inputs[rejected], admin);
  const state = await store.loadState();
  assert.equal(state.customers.length, 2);
  assert.equal(state.audit.length, 2);
  assert.equal(database.database.prepare("SELECT count(*) AS n FROM transaction_guards").get().n, 0);
});

test("casos de uso reales guardan venta, entrega, cobro y crédito juntos y sobreviven a la recarga", async (t) => {
  const database = memoryPersistence();
  t.after(database.close);
  const store = createStore(() => database.binding);
  let sequence = 0;
  const run = async (type, payload) =>
    (await store.runCommand(command(type, payload, "operation-" + ++sequence), admin)).result;
  const customer = await run("CUSTOMER_SAVE", { name: "Cliente de prueba" });
  await run("PRODUCTION_SAVE", {
    production_date: "2026-10-09",
    products: [{ product_id: "prod-1", nuclei_count: 1 }],
    confirm: true,
  });
  const sale = await run("SALE_SAVE", {
    customer_id: customer,
    site_id: "site-1",
    sale_date: "2026-10-09",
    payment_date: "2026-10-09",
    payment_condition: "CASH",
    payment_method: "TRANSFER",
    paid_amount: 800,
    items: [{ product_id: "prod-1", quantity: 10, unit_weight_kg: 25, unit_price: 73 }],
    deliver: true,
  });
  let state = await store.loadState();
  assert.equal(state.payments.length, 1);
  assert.equal(balanceSummary(state).customer_credit, 7000);
  assert.equal(stock(state, "prod-1").quantity, 30);
  const pending = await run("SALE_SAVE", {
    customer_id: customer,
    site_id: "site-1",
    sale_date: "2026-10-09",
    payment_condition: "CREDIT",
    items: [{ product_id: "prod-1", quantity: 2, unit_weight_kg: 25, unit_price: 73 }],
  });
  await run("PAYMENT_APPLY_CREDIT", {
    payment_id: state.payments[0].id,
    applications: [{ sale_id: pending, applied_amount: 70 }],
  });
  await run("SALE_DELIVER", { id: pending });
  state = await createStore(() => database.binding).loadState();
  assert.equal(state.payments.length, 1);
  assert.equal(balanceSummary(state).collections, 80000);
  assert.equal(balanceSummary(state).customer_credit, 0);
  assert.equal(
    saleSummary(
      state,
      state.sales.find((row) => row.id === sale),
    ).balance,
    0,
  );
  assert.equal(
    saleSummary(
      state,
      state.sales.find((row) => row.id === pending),
    ).balance,
    7600,
  );
  assert.equal(stock(state, "prod-1").quantity, 28);
  assert.equal(database.database.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("el store revierte un batch inválido completo y el dispatcher rechaza propiedades heredadas", async (t) => {
  const database = memoryPersistence();
  t.after(database.close);
  const store = createStore(() => database.binding),
    before = await store.ensureState(admin),
    actor = before.users[0];
  const outcome = executeCommand(
    before,
    command("CUSTOMER_SAVE", { name: "No debe persistir" }, "request"),
    actor,
  );
  outcome.state.customerSites.push({
    id: "invalid-relation",
    customer_id: outcome.result,
    site_id: "missing",
  });
  await assert.rejects(store.persistState(before, outcome.state), /FOREIGN KEY/);
  assert.deepEqual(await store.loadState(), before);
  for (const type of ["constructor", "toString", "__proto__"])
    assert.throws(() => executeCommand(before, { type }, actor), /Operación desconocida/);
});
