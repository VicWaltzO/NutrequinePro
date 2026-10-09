import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  seedState,
  executeCommand,
  TABLES,
  SQL_NAMES,
  paymentSummary,
  saleSummary,
  balanceSummary,
} from "../lib/domain.mjs";
import { writePlan } from "../lib/persistence.mjs";
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(readFileSync(new URL("../drizzle/0000_nervous_silver_fox.sql", import.meta.url), "utf8"));
  const persist = (before, after) => {
    db.exec("BEGIN");
    try {
      for (const x of writePlan(before, after)) db.prepare(x.sql).run(...x.args);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const load = () => {
    const cfg = db.prepare("SELECT * FROM settings WHERE id='company'").get();
    return {
      revision: cfg.revision,
      config: JSON.parse(cfg.data),
      ...Object.fromEntries(
        TABLES.map((t) => [
          t,
          db
            .prepare(`SELECT data FROM ${SQL_NAMES[t]}`)
            .all()
            .map((x) => JSON.parse(x.data)),
        ]),
      ),
    };
  };
  const initial = seedState();
  initial.users.push({ id: "admin", name: "Admin", role: "ADMIN", is_active: true });
  persist(null, initial);
  return { db, persist, load, actor: initial.users[0] };
}
test("migración, datos iniciales y round-trip persistente", () => {
  const f = fixture(),
    s = f.load();
  assert.equal(s.products.length, 4);
  assert.equal(s.ingredients.length, 10);
  assert.equal(s.formulaIngredients.length, 40);
  assert.equal(s.sales.length, 0);
  assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length, 0);
});
test("venta contado, pago, aplicación e inventario se guardan juntos", () => {
  const f = fixture();
  let s = f.load();
  let out = executeCommand(s, { type: "CUSTOMER_SAVE", payload: { name: "Cliente SQL" } }, f.actor);
  f.persist(s, out.state);
  s = f.load();
  const c = s.customers[0].id;
  out = executeCommand(
    s,
    {
      type: "PRODUCTION_SAVE",
      payload: {
        production_date: "2026-10-06",
        products: [{ product_id: "prod-1", nuclei_count: 1 }],
        confirm: true,
      },
    },
    f.actor,
  );
  f.persist(s, out.state);
  s = f.load();
  out = executeCommand(
    s,
    {
      type: "SALE_SAVE",
      payload: {
        customer_id: c,
        site_id: "site-1",
        sale_date: "2026-10-06",
        payment_condition: "CASH",
        payment_method: "TRANSFER",
        items: [{ product_id: "prod-1", quantity: 10, unit_price: 73, unit_weight_kg: 25 }],
        deliver: true,
      },
    },
    f.actor,
  );
  f.persist(s, out.state);
  const a = f.load();
  assert.equal(a.sales.length, 1);
  assert.equal(a.payments.length, 1);
  assert.equal(a.paymentApplications.length, 1);
  assert.equal(a.inventoryMovements.filter((x) => x.movement_type === "SALE_OUT").length, 1);
  assert.equal(a.sales[0].financial_status, "PAID");
});
test("fallo de integridad revierte todas las escrituras del batch", () => {
  const f = fixture(),
    before = f.load();
  const out = executeCommand(
    before,
    { type: "CUSTOMER_SAVE", payload: { name: "No debe sobrevivir" } },
    f.actor,
  );
  out.state.customerSites.push({ id: "bad-link", customer_id: out.result, site_id: "inexistente" });
  assert.throws(() => f.persist(before, out.state), /FOREIGN KEY/);
  assert.equal(f.load().customers.length, 0);
  assert.equal(f.load().revision, before.revision);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM transaction_guards").get().n, 0);
});
test("revision guard bloquea escrituras simultáneas desde datos obsoletos", () => {
  const f = fixture(),
    before = f.load();
  const a = executeCommand(before, { type: "CUSTOMER_SAVE", payload: { name: "Primero" } }, f.actor),
    b = executeCommand(before, { type: "CUSTOMER_SAVE", payload: { name: "Segundo" } }, f.actor);
  f.persist(before, a.state);
  assert.throws(() => f.persist(before, b.state), /CHECK/);
  assert.equal(f.load().customers.length, 1);
  assert.equal(f.load().customers[0].name, "Primero");
});

test("saldo a favor persiste, se aplica una sola vez y conserva caja e historial", () => {
  const f = fixture();
  const run = (type, payload) => {
    const before = f.load(),
      out = executeCommand(before, { type, payload }, f.actor);
    f.persist(before, out.state);
    return out.result;
  };
  const customer = run("CUSTOMER_SAVE", { name: "Cliente prueba saldo SQL" });
  const sale = {
    customer_id: customer,
    site_id: "site-1",
    sale_date: "2026-10-09",
    payment_condition: "CASH",
    payment_method: "TRANSFER",
    paid_amount: 800,
    items: [{ product_id: "prod-1", quantity: 10, unit_price: 73, unit_weight_kg: 25 }],
    deliver: false,
  };
  run("SALE_SAVE", sale);
  const pay = f.load().payments[0];
  assert.equal(paymentSummary(f.load(), pay).available, 7000);
  const next = run("SALE_SAVE", { ...sale, payment_condition: "CREDIT" });
  const before = f.load(),
    command = {
      type: "PAYMENT_APPLY_CREDIT",
      payload: { payment_id: pay.id, applications: [{ sale_id: next, applied_amount: 70 }] },
    };
  const first = executeCommand(before, command, f.actor),
    concurrent = executeCommand(before, command, f.actor);
  f.persist(before, first.state);
  assert.throws(() => f.persist(before, concurrent.state), /CHECK/);
  const loaded = f.load();
  assert.equal(paymentSummary(loaded, pay).available, 0);
  assert.equal(saleSummary(loaded, { id: next }).balance, 66000);
  assert.equal(loaded.payments.length, 1);
  assert.equal(loaded.paymentApplications.length, 2);
  assert.equal(balanceSummary(loaded).collections, 80000);
  run("PAYMENT_REVERSE", { id: pay.id, date: "2026-10-09", reason: "Prueba reversión SQL" });
  const reversed = f.load();
  assert.equal(balanceSummary(reversed).collections, 0);
  assert.equal(balanceSummary(reversed).receivable, 146000);
  assert.equal(paymentSummary(reversed, pay).available, 0);
  assert.equal(reversed.paymentApplications.length, 2);
  assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length, 0);
});
