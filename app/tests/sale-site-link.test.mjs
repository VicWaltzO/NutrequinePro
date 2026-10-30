import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { persistenceTest, diskFixture } from "./helpers/persistence-fixtures.mjs";
import {
  regressionFixture,
  salePayload,
  rejectsWithoutChange,
  adminIdentity,
  scenarioSession,
} from "./helpers/regression-scenarios.mjs";
import { createStore } from "../lib/application-store.mjs";
import { executeCommand } from "../lib/domain.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { coverageFixture } from "./helpers/coverage-fixtures.mjs";
import { saleSiteContext, changeSaleParty } from "../features/ventas/hooks/sale-sites.mjs";

const link = { site_link_mode: "LINK", confirm_site_link: true, confirm: true };

persistenceTest(
  "D10-02/07/08/09/10/11/12/18/22: puntual, borrador, vínculo y reactivación preservan principal e históricos",
  async (t) => {
    const f = await regressionFixture(t);
    const site = await f.run("SITE_SAVE", { name: "Destino sintético" });
    const before = await f.state();
    const old = await f.run("SALE_SAVE", salePayload(f.customer, { site_id: site }));
    const draft = await f.run("SALE_SAVE", salePayload(f.customer, { site_id: site, confirm: false }));
    assert.deepEqual((await f.state()).customerSites, before.customerSites);
    await f.run("SALE_SAVE", salePayload(f.customer, { id: draft, site_id: site, ...link }));
    const linked = await f.state();
    const relation = linked.customerSites.find((x) => x.site_id === site && x.customer_id === f.customer);
    assert.equal(relation.is_active, true);
    assert.equal(relation.is_default, false);
    await f.run("SALE_SAVE", salePayload(f.customer, { site_id: site, ...link }));
    assert.deepEqual((await f.state()).customerSites, linked.customerSites);
    await f.run("CUSTOMER_SITES_SAVE", { id: f.customer, site_ids: ["site-1"] });
    const inactive = await f.state();
    await f.run("SALE_SAVE", salePayload(f.customer, { site_id: site }));
    assert.deepEqual((await f.state()).customerSites, inactive.customerSites);
    await f.run("SALE_SAVE", salePayload(f.customer, { site_id: site, ...link }));
    const final = await f.state();
    assert.equal(
      final.customerSites.filter((x) => x.site_id === site && x.customer_id === f.customer).length,
      1,
    );
    assert.equal(final.customerSites.find((x) => x.id === relation.id).is_active, true);
    assert.deepEqual(
      final.customerSites.filter((x) => x.site_id !== site),
      before.customerSites,
    );
    assert.deepEqual(
      final.sales.find((x) => x.id === old),
      linked.sales.find((x) => x.id === old),
    );
  },
);

persistenceTest("D10-06/14/15/17/21: contrato estricto y fallos de stock/pago sin escrituras", async (t) => {
  const f = await regressionFixture(t);
  const site_id = await f.run("SITE_SAVE", { name: "Destino rechazado" });
  const invalid = [
    { site_link_mode: null },
    { site_link_mode: true },
    { site_link_mode: "FORGED" },
    { site_link_mode: "LINK" },
    { ...link, confirm: false },
    { ...link, confirm: undefined },
    { ...link, confirm_site_link: "true" },
    { ...link, confirm_site_link: 1 },
    { ...link, confirm_site_link: null },
    { confirm_site_link: true },
    { confirm: "false" },
    { deliver: "false" },
    { create_production: 0 },
    { ...link, deliver: true },
    { ...link, payment_condition: "CASH", paid_amount: 10, payment_method: "INVALID" },
  ];
  for (const extra of invalid)
    await rejectsWithoutChange(f, () => f.run("SALE_SAVE", salePayload(f.customer, { site_id, ...extra })));
  await f.run("SITE_SAVE", { id: site_id, name: "Destino rechazado", is_active: false });
  await rejectsWithoutChange(
    f,
    () => f.run("SALE_SAVE", salePayload(f.customer, { site_id, ...link })),
    /activos/,
  );
  await f.run("SITE_SAVE", { id: site_id, name: "Destino rechazado", is_active: true });
  await f.run("CUSTOMER_SAVE", { id: f.customer, name: "Cliente sintético 02", is_active: false });
  await rejectsWithoutChange(
    f,
    () => f.run("SALE_SAVE", salePayload(f.customer, { site_id, ...link })),
    /activos/,
  );
});

test("D10-03/05/13/24: selección pura, principal habilitada, orden por grupos y aprobación invalidada", () => {
  const state = {
    customers: [{ id: "c", name: "Cliente", is_active: true }],
    sites: [
      { id: "a", name: "Zeta", is_active: true },
      { id: "b", name: "Álamo", is_active: true },
      { id: "off", name: "Inactiva", is_active: false },
    ],
    customerSites: [{ id: "r", customer_id: "c", site_id: "a", is_active: true, is_default: true }],
  };
  const before = structuredClone(state);
  const values = { customer_id: "", site_id: "b", ...link };
  const next = changeSaleParty(values, "customer_id", "c", state);
  assert.equal(next.site_id, "a");
  assert.equal(next.site_link_mode, "ONE_TIME");
  assert.equal(next.confirm_site_link, false);
  const context = saleSiteContext(state, "c", "b");
  assert.equal(context.needsChoice, true);
  assert.deepEqual(
    context.other.map((x) => x.id),
    ["b"],
  );
  assert.equal(saleSiteContext(state, "c", "a").needsChoice, false);
  assert.deepEqual(state, before);
  state.sites[0].is_active = false;
  assert.equal(saleSiteContext(state, "c", "b").principal, undefined);
});

test("D10-19/20: dos conexiones, revisión optimista, reintento idempotente y reinicio", async (t) => {
  let second;
  t.after(() => second?.close());
  const db = diskFixture(t);
  second = openSqliteDatabase(db.filename);
  const a = createStore(() => db.binding);
  const b = createStore(() => second);
  await a.ensureState(adminIdentity);
  const f = scenarioSession(a);
  const customer = await f.run("CUSTOMER_SAVE", { name: "Cliente carrera" });
  const payload = salePayload(customer, link);
  const commands = [0, 1].map(() => ({ type: "SALE_SAVE", payload, request_id: randomUUID() }));
  const results = await Promise.allSettled([
    a.runCommand(commands[0], adminIdentity),
    b.runCommand(commands[1], adminIdentity),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const retry = results.findIndex((x) => x.status === "rejected");
  await b.runCommand(commands[retry], adminIdentity);
  const saved = await a.loadState();
  assert.equal(saved.sales.length, 2);
  assert.equal(saved.customerSites.filter((x) => x.customer_id === customer).length, 1);
  await b.runCommand(commands[retry], adminIdentity);
  assert.deepEqual(await a.loadState(), saved);
  await assert.rejects(
    () =>
      b.runCommand(
        { ...commands[retry], payload: { ...payload, site_link_mode: "ONE_TIME", confirm_site_link: false } },
        adminIdentity,
      ),
    /identificador/,
  );
  assert.deepEqual(await createStore(() => second).loadState(), saved);
  // A valid command computed before another operator disables the destination
  // must fail the revision guard, even if its domain validation had succeeded.
  const stale = executeCommand(saved, { type: "SALE_SAVE", payload }, saved.users[0]);
  await scenarioSession(b).run("SITE_SAVE", { id: "site-1", name: saved.sites[0].name, is_active: false });
  const disabled = await a.loadState();
  await assert.rejects(() => a.persistState(saved, stale.state), /Otra operación/);
  assert.deepEqual(await b.loadState(), disabled);
});

test("D10-21: fallo SQL posterior a asociación revierte venta, relación, auditoría y revisión", async (t) => {
  const db = diskFixture(t);
  const store = createStore(() => db.binding);
  await store.ensureState(adminIdentity);
  const f = scenarioSession(store);
  const customer = await f.run("CUSTOMER_SAVE", { name: "Cliente rollback" });
  await f.run("INVENTORY_ADJUST", {
    product_id: "prod-1",
    quantity: 10,
    weight_kg: 300,
    direction: "IN",
    date: "2026-10-14",
    reason: "Stock sintético rollback",
  });
  db.database.exec(
    "CREATE TRIGGER synthetic_sale_audit_failure BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'synthetic injected failure'); END;",
  );
  await rejectsWithoutChange(
    f,
    () =>
      f.run(
        "SALE_SAVE",
        salePayload(customer, {
          ...link,
          deliver: true,
          payment_condition: "CASH",
          payment_method: "TRANSFER",
          paid_amount: 100,
        }),
      ),
    /synthetic/,
  );
});

persistenceTest(
  "D10-26: composición aislada conserva vínculo optativo sin activar reservas empresariales",
  async (t) => {
    const f = await coverageFixture(t);
    await f.sell(2);
    assert.equal((await f.state()).customerSites.length, 0);
    await f.sell(2, "2026-11-01", link);
    assert.equal((await f.state()).customerSites.filter((x) => x.customer_id === f.customer).length, 1);
  },
);
