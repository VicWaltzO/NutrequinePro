import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createStore } from "../../lib/application-store.mjs";
import { saleSummary, paymentSummary, stock, balanceSummary } from "../../lib/domain.mjs";
import { testDatabase } from "./persistence-fixtures.mjs";

export const scenarioDate = "2026-10-14";
export const adminIdentity = { userId: "regression-admin", displayName: "Administrador sintético" };

export function scenarioSession(store, identity = adminIdentity) {
  return {
    state: () => store.loadState(),
    run: async (type, payload, request_id = randomUUID()) =>
      (await store.runCommand({ type, payload, request_id }, identity)).result,
  };
}

export async function regressionFixture(t) {
  const database = testDatabase(t);
  const store = createStore(() => database.binding);
  await store.ensureState(adminIdentity);
  const session = scenarioSession(store);
  const customer = await session.run("CUSTOMER_SAVE", { name: "Cliente sintético 02", site_ids: ["site-1"] });
  return { ...session, customer, store, database };
}

export const salePayload = (customer_id, extra = {}) => ({
  customer_id,
  site_id: "site-1",
  sale_date: scenarioDate,
  payment_condition: "CREDIT",
  items: [{ product_id: "prod-1", quantity: 4, unit_price: "73.01", unit_weight_kg: "25.001" }],
  ...extra,
});

export const productionPayload = (extra = {}) => ({
  production_date: scenarioDate,
  products: [{ product_id: "prod-1", nuclei_count: 1 }],
  confirm: true,
  ...extra,
});

export const paymentPayload = (customer_id, sale_id, extra = {}) => ({
  customer_id,
  payment_date: scenarioDate,
  payment_method: "TRANSFER",
  total_amount: "10.01",
  applications: [{ sale_id, applied_amount: "10.01" }],
  ...extra,
});

export async function rejectsWithoutChange(session, action, message) {
  const before = await session.state();
  await assert.rejects(action, message);
  assert.deepEqual(await session.state(), before, "El rechazo debe conservar todas las entidades y revisión");
}

// The transport supplies only commands and state; these assertions do not depend on D1 or HTTP.
export async function cashCreditScenario(session) {
  const customer = await session.run("CUSTOMER_SAVE", { name: "Cliente escenario portable" });
  await session.run("INVENTORY_ADJUST", {
    product_id: "prod-1",
    quantity: 10,
    weight_kg: "250.010",
    direction: "IN",
    date: scenarioDate,
    reason: "Stock sintético del escenario",
  });
  const firstSale = await session.run(
    "SALE_SAVE",
    salePayload(customer, {
      payment_condition: "CASH",
      payment_method: "TRANSFER",
      paid_amount: "300.05",
      deliver: true,
    }),
  );
  let state = await session.state();
  const payment = state.payments.find((row) => row.customer_id === customer);
  assert.equal(saleSummary(state, { id: firstSale }).total, 29204);
  assert.equal(paymentSummary(state, payment).available, 801);
  const secondSale = await session.run(
    "SALE_SAVE",
    salePayload(customer, {
      items: [{ product_id: "prod-1", quantity: 1, unit_price: "10.01", unit_weight_kg: "25.001" }],
    }),
  );
  await session.run(
    "PAYMENT_APPLY_CREDIT",
    {
      payment_id: payment.id,
      applications: [{ sale_id: secondSale, applied_amount: "8.01" }],
    },
    "portable-credit-application",
  );
  const afterApplication = await session.state();
  await session.run(
    "PAYMENT_APPLY_CREDIT",
    {
      payment_id: payment.id,
      applications: [{ sale_id: secondSale, applied_amount: "8.01" }],
    },
    "portable-credit-application",
  );
  assert.deepEqual(await session.state(), afterApplication, "Reintentar crédito no debe duplicar auditoría");
  await session.run("SALE_DELIVER", { id: secondSale });
  state = await session.state();
  assert.equal(saleSummary(state, { id: secondSale }).balance, 200);
  assert.equal(paymentSummary(state, payment).available, 0);
  assert.equal(state.payments.filter((row) => row.customer_id === customer).length, 1);
  assert.equal(stock(state, "prod-1").quantity, 5);
  assert.equal(stock(state, "prod-1").weight_kg, 125005);
  assert.equal(balanceSummary(state).collections, 30005);
  return { customer, firstSale, secondSale, payment: payment.id };
}

// Pending acceptance cases for components that are deliberately not implemented in this task.
export const migrationAcceptanceCases = [
  { id: "LOCAL-AUTH-01", actions: ["login", "read", "logout", "read-denied"], invariant: "Sesión revocada" },
  {
    id: "LOCAL-AUTH-02",
    actions: ["bind-existing-user", "write"],
    invariant: "IDs y autoría histórica intactos",
  },
  {
    id: "SQLITE-DISK-01",
    actions: ["cash-credit", "stop", "restart", "read"],
    invariant: "Estado persistente idéntico",
  },
  {
    id: "NODE-OFFLINE-01",
    actions: ["block-external-network", "login", "cash-credit"],
    invariant: "Solo tráfico loopback",
  },
];
