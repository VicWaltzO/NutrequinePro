import { test } from "node:test";
import { persistenceTest, diskFixture } from "./helpers/persistence-fixtures.mjs";
import { createStore } from "../lib/application-store.mjs";
import assert from "node:assert/strict";
import {
  regressionFixture,
  rejectsWithoutChange,
  cashCreditScenario,
  salePayload,
} from "./helpers/regression-scenarios.mjs";
import { customerProfile } from "../features/clientes/domain/profile.mjs";

persistenceTest(
  "sedes: alta y vínculo atómicos, principal independiente y relaciones históricas",
  async (t) => {
    const f = await regressionFixture(t);
    const other = await f.run("CUSTOMER_SAVE", { name: "Otro cliente sintético", site_ids: ["site-1"] });
    await f.run("CUSTOMER_SITES_SAVE", {
      id: f.customer,
      site_ids: ["site-1"],
      new_sites: ["Sede compartida sintética"],
      default_site_id: "new:0",
    });
    let state = await f.state();
    const created = state.sites.find((row) => row.name === "Sede compartida sintética");
    assert.ok(created);
    assert.equal(
      state.customerSites.find((row) => row.customer_id === f.customer && row.is_default).site_id,
      created.id,
    );
    await f.run("CUSTOMER_SITES_SAVE", {
      id: other,
      site_ids: ["site-1", created.id],
      default_site_id: "site-1",
    });
    await f.run("SALE_SAVE", salePayload(f.customer, { site_id: created.id }));
    await f.run("CUSTOMER_SITES_SAVE", { id: f.customer, site_ids: ["site-1"], default_site_id: "site-1" });
    state = await f.state();
    assert.equal(state.sites.find((row) => row.id === created.id).is_active, true);
    assert.equal(state.sales[0].site_id, created.id);
    assert.equal(
      state.customerSites.find((row) => row.customer_id === other && row.site_id === created.id).is_active,
      true,
    );
    assert.equal(
      state.customerSites.find((row) => row.customer_id === f.customer && row.site_id === created.id)
        .is_active,
      false,
    );
    assert.equal(
      state.customerSites.find((row) => row.customer_id === other && row.is_default).site_id,
      "site-1",
    );
  },
);

persistenceTest(
  "sedes: rollback de creación y vínculo ante duplicado, sede ausente o principal inválida",
  async (t) => {
    const f = await regressionFixture(t);
    const existing = (await f.state()).sites[0];
    for (const payload of [
      { site_ids: ["missing"], new_sites: ["No debe persistir"] },
      { site_ids: [], new_sites: ["Primera transitoria", "  " + existing.name.toUpperCase() + "  "] },
      { site_ids: [], new_sites: ["Árbol sintético", " arbol   sintetico "] },
      { site_ids: [], new_sites: ["No debe persistir"], default_site_id: "missing" },
      { site_ids: ["site-1", "site-1"] },
    ]) {
      await rejectsWithoutChange(
        f,
        () => f.run("CUSTOMER_SITES_SAVE", { id: f.customer, ...payload }),
        /sede|Sede|Registro/,
      );
    }
    await rejectsWithoutChange(
      f,
      () =>
        f.run("CUSTOMER_SAVE", {
          name: "Cliente fallido",
          site_ids: [],
          new_sites: ["Sede transitoria"],
          default_site_id: "missing",
        }),
      /principal/,
    );
  },
);

persistenceTest(
  "sedes: VIEWER rechazado y OPERATOR autorizado con transacción única e idempotencia",
  async (t) => {
    const f = await regressionFixture(t);
    for (const role of ["VIEWER", "OPERATOR"]) {
      await f.run("USER_SAVE", { id: role, name: role, role });
    }
    const payload = { id: f.customer, site_ids: [], new_sites: ["Sede operador sintética"] };
    await rejectsWithoutChange(
      f,
      () =>
        f.store.runCommand(
          { type: "CUSTOMER_SITES_SAVE", payload, request_id: "denied" },
          { userId: "VIEWER" },
        ),
      /consultar/,
    );
    const command = { type: "CUSTOMER_SITES_SAVE", payload, request_id: "site-once" };
    await f.store.runCommand(command, { userId: "OPERATOR" });
    const saved = await f.state();
    await f.store.runCommand(command, { userId: "OPERATOR" });
    assert.deepEqual(await f.state(), saved);
    assert.equal(saved.sites.filter((row) => row.name === payload.new_sites[0]).length, 1);
  },
);

test("perfil: distingue ventas, cobros, aplicaciones y saldos con devolución, reversión y borradores", async (t) => {
  const f = await regressionFixture(t);
  const scenario = await cashCreditScenario(f);
  let state = await f.state();
  assert.deepEqual(customerProfile(state, scenario.customer), {
    sold: 30205,
    applied: 30005,
    debt: 200,
    credit: 0,
    net: 200,
    count: 2,
    received: 30005,
  });
  await f.run("SALE_SAVE", salePayload(scenario.customer, { confirm: false }));
  await f.run("PAYMENT_REVERSE", { id: scenario.payment, date: "2026-10-16", reason: "Reversión sintética" });
  state = await f.state();
  await f.run("RETURN_CREATE", {
    sale_id: scenario.firstSale,
    return_date: "2026-10-17",
    reason: "Retorno sintético",
    items: [
      { sale_item_id: state.saleItems.find((row) => row.sale_id === scenario.firstSale).id, quantity: 1 },
    ],
    economic_amount: "73.01",
  });
  state = await f.state();
  const profile = customerProfile(state, scenario.customer);
  assert.equal(profile.count, 2);
  assert.equal(profile.received, 0);
  assert.equal(profile.applied, 0);
  assert.equal(profile.credit, 0);
  assert.equal(profile.sold, 22904);
  assert.equal(profile.debt, 22904);
  await f.run("SALE_CANCEL", { id: scenario.secondSale, reason: "Anulación sintética" });
  assert.equal(customerProfile(await f.state(), scenario.customer).sold, 21903);
  assert.equal(customerProfile(await f.state(), scenario.customer).count, 1);
  assert.deepEqual(customerProfile(state, f.customer), {
    sold: 0,
    applied: 0,
    debt: 0,
    credit: 0,
    net: 0,
    count: 0,
    received: 0,
  });
});

test("sedes: fallo SQLite al insertar vínculo revierte sede, auditoría y revisión", async (t) => {
  const database = diskFixture(t);
  const store = createStore(() => database.binding);
  const identity = { userId: "site-rollback-admin", displayName: "Administrador sintético" };
  await store.ensureState(identity);
  const customer = await store.runCommand(
    { type: "CUSTOMER_SAVE", payload: { name: "Rollback sintético" }, request_id: "customer" },
    identity,
  );
  const before = await store.loadState();
  database.database.exec(
    "CREATE TRIGGER reject_site_link BEFORE INSERT ON customer_sites BEGIN SELECT RAISE(ABORT, 'synthetic link failure'); END",
  );
  await assert.rejects(
    () =>
      store.runCommand(
        {
          type: "CUSTOMER_SITES_SAVE",
          payload: { id: customer.result, site_ids: [], new_sites: ["Sede que no debe persistir"] },
          request_id: "failure",
        },
        identity,
      ),
    /synthetic link failure/,
  );
  assert.deepEqual(await store.loadState(), before);
});
