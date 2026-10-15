import { persistenceTest as test } from "./helpers/persistence-fixtures.mjs";
import assert from "node:assert/strict";
import {
  regressionFixture,
  scenarioSession,
  scenarioDate,
  salePayload,
  productionPayload,
  paymentPayload,
  rejectsWithoutChange,
  adminIdentity,
} from "./helpers/regression-scenarios.mjs";

async function roleSession(f, role) {
  const identity = { userId: role.toLowerCase() + "-synthetic", displayName: role + " sintético" };
  await f.run("USER_SAVE", { id: identity.userId, name: identity.displayName, role });
  return scenarioSession(f.store, identity);
}

test("R21: operador crea maestros permitidos, versión de fórmula, borrador, venta, cobro y gasto", async (t) => {
  const f = await regressionFixture(t);
  const operator = await roleSession(f, "OPERATOR");
  const customer = await operator.run("CUSTOMER_SAVE", { name: "Cliente sintético del operador" });
  const site = await operator.run("SITE_SAVE", { name: "Sede sintética del operador" });
  const formula = await operator.run("FORMULA_SAVE", {
    product_id: "prod-1",
    valid_from: scenarioDate,
    ingredients: [{ ingredient_id: "ing-1", kg_per_nucleus: "1.001" }],
  });
  const production = await operator.run("PRODUCTION_SAVE", productionPayload({ confirm: false }));
  const sale = await operator.run("SALE_SAVE", salePayload(customer, { site_id: site }));
  await operator.run("PAYMENT_CREATE", paymentPayload(customer, sale));
  await operator.run("EXPENSE_CREATE", {
    date: scenarioDate,
    category: "OPERATING",
    amount: "0.01",
    description: "Gasto sintético",
  });
  const state = await f.state();
  assert.equal(state.productions.find((row) => row.id === production).status, "DRAFT");
  assert.equal(state.formulas.find((row) => row.id === formula).version, 2);
  assert.equal(state.payments[0].total_amount, 1001);
  assert.equal(state.expenses[0].amount, 1);
  assert.ok(
    state.audit
      .filter((row) => row.created_by === "operator-synthetic")
      .every((row) => row.actor_role === "OPERATOR"),
  );
});

test("R22: operador no ejecuta acciones administrativas ni confirma mediante SAVE o concilia por alias", async (t) => {
  const f = await regressionFixture(t);
  const operator = await roleSession(f, "OPERATOR");
  const production = await f.run("PRODUCTION_SAVE", productionPayload({ confirm: false }));
  const sale = await f.run("SALE_SAVE", salePayload(f.customer));
  const payment = await f.run("PAYMENT_CREATE", paymentPayload(f.customer, sale));
  const payloads = {
    USER_SAVE: { id: "intruder", name: "No crear", role: "ADMIN" },
    CONFIG_SAVE: { company_name: "No cambiar" },
    PRODUCT_SAVE: { id: "prod-1", name: "No cambiar" },
    INGREDIENT_SAVE: { id: "ing-1", name: "No cambiar" },
    SALE_CORRECT: { id: sale, reason: "Ensayo" },
    SALE_CANCEL: { id: sale, reason: "Ensayo" },
    PAYMENT_REVERSE: { id: payment, reason: "Ensayo" },
    PRODUCTION_CONFIRM: { id: production },
    PRODUCTION_SAVE: productionPayload({ id: production, confirm: true }),
    PRODUCTION_RECONCILE: { id: production, reason: "Ensayo" },
    PRODUCTION_CORRECT: { id: production, reason: "Ensayo" },
    PRODUCTION_CORRECT_QUANTITIES: { id: production, reason: "Ensayo" },
    PRODUCTION_CLOSE: { id: production },
    PRODUCTION_CANCEL: { id: production, reason: "Ensayo" },
    INVENTORY_ADJUST: {
      product_id: "prod-1",
      quantity: 1,
      weight_kg: "25",
      direction: "IN",
      reason: "Ensayo",
      date: scenarioDate,
    },
    EXPENSE_CANCEL: { id: "synthetic-expense", reason: "Ensayo" },
  };
  for (const [type, payload] of Object.entries(payloads)) {
    await rejectsWithoutChange(f, () => operator.run(type, payload), /administrador/i);
  }
});

test("R23: VIEWER rechaza cada comando público y conserva revisión, auditoría y todas las entidades", async (t) => {
  const f = await regressionFixture(t);
  const viewer = await roleSession(f, "VIEWER");
  const types = [
    "CUSTOMER_SAVE",
    "CUSTOMER_DELETE",
    "SITE_SAVE",
    "PRODUCT_SAVE",
    "INGREDIENT_SAVE",
    "FORMULA_SAVE",
    "PRODUCTION_SAVE",
    "PRODUCTION_CONFIRM",
    "PRODUCTION_RECONCILE",
    "PRODUCTION_CORRECT",
    "PRODUCTION_CORRECT_QUANTITIES",
    "PRODUCTION_CLOSE",
    "PRODUCTION_CANCEL",
    "SALE_SAVE",
    "SALE_DELIVER",
    "SALE_CORRECT",
    "SALE_CANCEL",
    "RETURN_CREATE",
    "PAYMENT_CREATE",
    "PAYMENT_APPLY_CREDIT",
    "PAYMENT_REVERSE",
    "EXPENSE_CREATE",
    "EXPENSE_CANCEL",
    "INVENTORY_ADJUST",
    "CONFIG_SAVE",
    "USER_SAVE",
  ];
  for (const type of types) await rejectsWithoutChange(f, () => viewer.run(type, {}), /solo puede consultar/);
});

test("R24: administrador conserva último ADMIN activo y no pierde autoría al cambiar nombre", async (t) => {
  const f = await regressionFixture(t);
  const input = { id: adminIdentity.userId, name: "Administrador renombrado", role: "ADMIN" };
  await rejectsWithoutChange(
    f,
    () => f.run("USER_SAVE", { ...input, role: "OPERATOR" }),
    /al menos un administrador/,
  );
  await rejectsWithoutChange(
    f,
    () => f.run("USER_SAVE", { ...input, is_active: false }),
    /al menos un administrador/,
  );
  const before = await f.state();
  await f.run("USER_SAVE", input);
  const state = await f.state();
  assert.equal(state.users[0].name, input.name);
  assert.deepEqual(state.audit.slice(0, before.audit.length), before.audit);
  assert.equal(state.customers[0].created_by, adminIdentity.userId);
});
