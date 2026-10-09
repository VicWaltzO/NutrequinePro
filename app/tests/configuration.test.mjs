import { test } from "node:test";
import assert from "node:assert/strict";
import { seedState, executeCommand } from "../lib/domain.mjs";

const actor = { id: "admin", name: "Administrador de prueba", role: "ADMIN", is_active: true };
const input = {
  company_name: "Empresa de prueba",
  default_nucleus_cost: "250",
  default_packaging_cost: "1.10",
};
const save = (state, payload, identity = actor) =>
  executeCommand(state, { type: "CONFIG_SAVE", payload: { ...input, ...payload } }, identity);

test("company settings retain historical operations, validate defaults and record an audit", () => {
  const customer = executeCommand(
    seedState(),
    { type: "CUSTOMER_SAVE", payload: { name: "Cliente de prueba" } },
    actor,
  );
  const before = executeCommand(
    customer.state,
    {
      type: "SALE_SAVE",
      payload: {
        customer_id: customer.result,
        site_id: "site-1",
        sale_date: "2026-10-06",
        payment_condition: "CREDIT",
        items: [{ product_id: "prod-1", quantity: 2, unit_price: 73, unit_weight_kg: 25 }],
        confirm: true,
        deliver: false,
      },
    },
    actor,
  ).state;
  const after = save(before, {
    tax_id: "00000000000",
    address: "Dirección de prueba",
    phone: "000000000",
    contact_email: "prueba@example.com",
    default_payment_condition: "CASH",
    default_payment_method: "TRANSFER",
    expense_categories: ["LOGISTICS", "OTHER"],
    default_expense_category: "OTHER",
  }).state;
  assert.equal(after.config.default_payment_condition, "CASH");
  assert.equal(after.config.default_payment_method, "TRANSFER");
  assert.equal(after.config.default_expense_category, "OTHER");
  assert.equal(after.config.contact_email, "prueba@example.com");
  assert.deepEqual(after.sales, before.sales);
  assert.equal(before.config.contact_email, undefined);
  assert.equal(after.audit.at(-1).action, "CONFIG_SAVE");
  assert.equal(after.corrections.at(-1).entity_type, "CONFIG");
  const updated = save(after, { expense_categories: ["LOGISTICS"] }).state;
  assert.equal(updated.config.default_expense_category, "LOGISTICS");
  assert.equal(updated.config.default_payment_method, "TRANSFER");
  assert.equal(updated.config.contact_email, "prueba@example.com");
});

test("invalid company defaults and non-admin writes leave the original state intact", () => {
  const state = seedState(),
    original = structuredClone(state);
  for (const payload of [
    { default_payment_condition: "INVALID" },
    { default_payment_method: "OTHER" },
    { default_expense_category: "UNKNOWN" },
    { expense_categories: [] },
    { expense_categories: "LOGISTICS" },
    { contact_email: "invalid" },
    { phone: { value: "invalid" } },
  ])
    assert.throws(() => save(state, payload));
  for (const role of ["OPERATOR", "VIEWER"]) assert.throws(() => save(state, {}, { ...actor, role }));
  assert.deepEqual(state, original);
});
