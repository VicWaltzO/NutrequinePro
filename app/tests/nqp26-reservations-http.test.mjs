import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { temporaryDataDirectory } from "./helpers/persistence-fixtures.mjs";
import { salePayload } from "./helpers/regression-scenarios.mjs";
import { stock } from "../lib/domain.mjs";

async function fixture(t) {
  const applications = [];
  let connection;
  const root = temporaryDataDirectory(t, async () => {
    for (const app of applications) await app.close();
    connection?.close();
  });
  const privateDirectory = createPrivateDirectory(join(root, "private"));
  const database = join(privateDirectory, "business.sqlite");
  const auth_database = join(privateDirectory, "auth.sqlite");
  initializeDatabase(database);
  connection = openSqliteDatabase(database);
  const store = createStore(() => connection, { partialReservations: true });
  await store.ensureState({ userId: "http-admin04", displayName: "Admin sintético 04" });
  const secret = randomBytes(24).toString("base64url");
  await provisionAuthentication(database, auth_database, "link", {
    user_id: "http-admin04",
    name: "Admin sintético 04",
    login: "admin04",
    password: secret,
  });
  for (let i = 0; i < 2; i++) {
    const app = await createLocalServer({ database, auth_database, port: 0 }, { partialReservations: true });
    applications.push(app);
    await app.start();
  }
  async function login(login, password, instance = 0) {
    const port = applications[instance].server.server.address().port;
    const url = "http://127.0.0.1:" + port;
    const response = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login, password }),
    });
    assert.equal(response.status, 200);
    const session = await response.json();
    const cookie = response.headers.get("set-cookie").split(";")[0];
    return async (path, body) => {
      const result = await fetch(url + path, {
        method: "POST",
        headers: {
          origin: url,
          "content-type": "application/json",
          cookie,
          "x-csrf-token": session.csrf_token,
        },
        body: JSON.stringify(body),
      });
      return { status: result.status, body: await result.json() };
    };
  }
  const admin = await login("admin04", secret);
  const send = (sender, type, payload, request_id = randomUUID()) =>
    sender("/api/command", { type, payload, request_id });
  async function valid(type, payload, sender = admin, request_id) {
    const r = await send(sender, type, payload, request_id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  }
  return { store, admin, send, valid, login, secret, configuration: { database, auth_database, port: 0 } };
}

test("F06-07/08/12/13/14: HTTP de fecha preserva K/N, permisos actuales y replay 409", async (t) => {
  const f = await fixture(t);
  const customer = (await f.valid("CUSTOMER_SAVE", { name: "Cliente sintético fecha 06" })).result;
  await f.valid("INVENTORY_ADJUST", {
    product_id: "prod-1",
    quantity: 1,
    weight_kg: 25,
    direction: "IN",
    date: "2026-10-28",
    reason: "Sintético",
  });
  const id = (
    await f.valid(
      "SALE_SAVE",
      salePayload(customer, {
        items: [{ product_id: "prod-1", quantity: 2, unit_weight_kg: 25, unit_price: 73 }],
        payment_condition: "CASH",
        payment_method: "TRANSFER",
        paid_amount: 10,
      }),
    )
  ).result;
  const before = await f.store.loadState();
  await assert.rejects(createLocalServer(f.configuration), /no admite arranque operativo/);
  const payload = { id, delivery_date: "2026-11-04", reason: "Pedido reprogramado" };
  const request = randomUUID();
  await f.valid("SALE_DELIVERY_DATE_UPDATE", payload, f.admin, request);
  const after = await f.store.loadState();
  assert.deepEqual(after.saleItems, before.saleItems);
  assert.equal(after.saleItems[0].coverage.quantity, 1);
  for (const key of ["inventoryMovements", "payments", "paymentApplications", "productionCosts"]) {
    assert.deepEqual(after[key], before[key], key);
  }
  await f.valid("SALE_DELIVERY_DATE_UPDATE", { ...payload }, f.admin, request);
  assert.deepEqual(await f.store.loadState(), after);
  assert.equal(
    (
      await f.send(
        f.admin,
        "SALE_DELIVERY_DATE_UPDATE",
        {
          ...payload,
          delivery_date: "2026-11-05",
        },
        request,
      )
    ).status,
    409,
  );
  for (const value of ["2026-02-29", "2026-10-28T00:00:00-05:00", null, {}]) {
    assert.equal(
      (await f.send(f.admin, "SALE_DELIVERY_DATE_UPDATE", { ...payload, delivery_date: value })).status,
      422,
    );
  }
  assert.equal((await f.send(f.admin, "SALE_DELIVERY_DATE_UPDATE", { ...payload, items: [] })).status, 422);
  assert.deepEqual(await f.store.loadState(), after);
  for (const role of ["OPERATOR", "VIEWER"]) {
    const user = "date-" + role.toLowerCase();
    await f.valid("USER_SAVE", { id: user, name: user, role });
    assert.equal(
      (await f.admin("/api/auth/credentials", { user_id: user, login: user, password: f.secret })).status,
      200,
    );
    const actor = await f.login(user, f.secret);
    const snapshot = await f.store.loadState();
    assert.equal((await f.send(actor, "SALE_DELIVERY_DATE_UPDATE", payload, request)).status, 403);
    assert.deepEqual(await f.store.loadState(), snapshot);
  }
  await f.valid("USER_SAVE", { id: "date-other-admin", name: "Segundo admin sintético", role: "ADMIN" });
  assert.equal(
    (
      await f.admin("/api/auth/credentials", {
        user_id: "date-other-admin",
        login: "date-other-admin",
        password: f.secret,
      })
    ).status,
    200,
  );
  await f.valid("USER_SAVE", { id: "http-admin04", name: "Admin degradado", role: "OPERATOR" });
  const degraded = await f.login("admin04", f.secret);
  const snapshot = await f.store.loadState();
  assert.equal((await f.send(degraded, "SALE_DELIVERY_DATE_UPDATE", payload, request)).status, 403);
  assert.deepEqual(await f.store.loadState(), snapshot);
});

test("R05-03/08/09/17/18/19/23/29: HTTP reposición, fecha, liberación y reducción reales", async (t) => {
  const f = await fixture(t);
  const customer = (await f.valid("CUSTOMER_SAVE", { name: "Cliente cola HTTP" })).result;
  const adjustment = (quantity) => ({
    product_id: "prod-1",
    quantity,
    weight_kg: quantity * 25,
    direction: "IN",
    date: "2026-10-29",
    reason: "Ingreso sintético cola",
  });
  await f.valid("INVENTORY_ADJUST", adjustment(35));
  const sell = (quantity, delivery_date, extra = {}) =>
    f.valid(
      "SALE_SAVE",
      salePayload(customer, {
        delivery_date,
        items: [{ product_id: "prod-1", quantity, unit_weight_kg: 25, unit_price: 73 }],
        ...extra,
      }),
    );
  const a = (await sell(40, "2026-11-01")).result;
  const b = (
    await sell(35, "2026-11-02", { payment_condition: "CASH", payment_method: "TRANSFER", paid_amount: 10 })
  ).result;
  const rows = (s, id) => s.saleItems.filter((r) => r.sale_id === id && r.is_current !== false);
  const request = randomUUID();
  await f.valid("INVENTORY_ADJUST", adjustment(10), f.admin, request);
  let state = await f.store.loadState();
  assert.deepEqual(
    [a, b].map((id) => rows(state, id)[0].coverage.quantity),
    [40, 5],
  );
  await f.valid("INVENTORY_ADJUST", adjustment(10), f.admin, request);
  assert.deepEqual(await f.store.loadState(), state);
  assert.equal((await f.send(f.admin, "INVENTORY_ADJUST", adjustment(11), request)).status, 409);
  assert.deepEqual(await f.store.loadState(), state);
  await f.valid("SALE_DELIVERY_DATE_UPDATE", {
    id: b,
    delivery_date: "2026-10-30",
    reason: "Prioridad HTTP",
  });
  assert.deepEqual((await f.store.loadState()).saleItems, state.saleItems);
  const c = (await sell(1, "2026-10-29")).result;
  assert.equal(rows(await f.store.loadState(), c)[0].coverage.quantity, 0);
  await f.valid("SALE_CANCEL", { id: a, reason: "Libera cuarenta HTTP" });
  state = await f.store.loadState();
  assert.equal(rows(state, a)[0].coverage.quantity, 0);
  assert.equal(rows(state, b)[0].coverage.quantity, 35);
  assert.equal(rows(state, c)[0].coverage.quantity, 1);
  assert.equal(stock(state, "prod-1").quantity, 9);
  assert.equal((await f.send(f.admin, "SALE_CANCEL", { id: b, reason: "Pago aplicado" })).status, 422);
  assert.deepEqual(await f.store.loadState(), state);
  const row = rows(state, b)[0];
  await f.valid("SALE_CORRECT", {
    id: b,
    reason: "Reducir HTTP",
    items: [
      { original_item_id: row.id, product_id: "prod-1", quantity: 20, unit_weight_kg: 25, unit_price: 73 },
    ],
  });
  state = await f.store.loadState();
  assert.equal(rows(state, b)[0].coverage.quantity, 20);
  assert.equal(stock(state, "prod-1").quantity, 24);
  assert.ok(state.sales.filter((s) => s.id !== a).every((s) => s.fulfillment_status === "PENDING"));
  const product_id = (
    await f.valid("PRODUCT_SAVE", {
      name: "CascoPlus+ HTTP sintético",
      presentation_unit: "BOTTLE",
      unit_weight_grams: 2200,
      weight_policy: "FIXED",
      stock_entry_mode: "DIRECT_STOCK",
      default_sale_price: 10,
      is_sellable: true,
    })
  ).result;
  const bottle = (
    await f.valid(
      "SALE_SAVE",
      salePayload(customer, { items: [{ product_id, quantity: 2, unit_weight_kg: 2.2 }] }),
    )
  ).result;
  await f.valid("INVENTORY_ADJUST", {
    product_id,
    quantity: 2,
    weight_kg: 4.4,
    direction: "IN",
    date: "2026-10-29",
    reason: "Frascos directos",
  });
  state = await f.store.loadState();
  assert.equal(rows(state, bottle)[0].coverage.quantity, 2);
  assert.equal(rows(state, bottle)[0].coverage.weight_grams, 4400);
  assert.equal(state.productions.length, 0);
});

test("R05-24: dos administradores HTTP reponen último faltante sin doble cargo", async (t) => {
  const f = await fixture(t);
  const customer = (await f.valid("CUSTOMER_SAVE", { name: "Cliente concurrencia cola" })).result;
  const sale = (
    await f.valid(
      "SALE_SAVE",
      salePayload(customer, { items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 25 }] }),
    )
  ).result;
  await f.valid("USER_SAVE", { id: "queue-admin-b", name: "Segundo administrador cola", role: "ADMIN" });
  assert.equal(
    (
      await f.admin("/api/auth/credentials", {
        user_id: "queue-admin-b",
        login: "queue-admin-b",
        password: f.secret,
      })
    ).status,
    200,
  );
  const b = await f.login("queue-admin-b", f.secret, 1);
  const actors = [f.admin, b];
  const requests = [randomUUID(), randomUUID()];
  const payload = {
    product_id: "prod-1",
    quantity: 1,
    weight_kg: 25,
    direction: "IN",
    date: "2026-10-29",
    reason: "Concurrencia sintética",
  };
  const results = await Promise.all(
    actors.map((actor, i) => f.send(actor, "INVENTORY_ADJUST", payload, requests[i])),
  );
  for (let i = 0; i < results.length; i++) {
    if (results[i].status !== 200) {
      assert.match(results[i].body.error, /Otra operación/);
      await f.valid("INVENTORY_ADJUST", payload, actors[i], requests[i]);
    }
  }
  const state = await f.store.loadState();
  assert.equal(state.saleItems.find((r) => r.sale_id === sale).coverage.quantity, 1);
  assert.equal(state.inventoryMovements.filter((m) => m.coverage_action === "ASSIGN").length, 1);
  assert.equal(stock(state, "prod-1").quantity, 1);
  for (let i = 0; i < actors.length; i++) await f.valid("INVENTORY_ADJUST", payload, actors[i], requests[i]);
  assert.deepEqual(await f.store.loadState(), state);
});

test("R05-27: adopción HTTP administrativa, replay y permiso degradado", async (t) => {
  let connection;
  t.after(() => connection?.close());
  const f = await fixture(t);
  const customer = (await f.valid("CUSTOMER_SAVE", { name: "Cliente legacy cola HTTP" })).result;
  connection = openSqliteDatabase(f.configuration.database);
  const legacy = createStore(() => connection);
  const id = (
    await legacy.runCommand(
      {
        type: "SALE_SAVE",
        request_id: "legacy-http",
        payload: salePayload(customer, {
          items: [{ product_id: "prod-1", quantity: 2, unit_weight_kg: 25 }],
        }),
      },
      { userId: "http-admin04", displayName: "Admin sintético" },
    )
  ).result;
  await f.valid("INVENTORY_ADJUST", {
    product_id: "prod-1",
    quantity: 1,
    weight_kg: 25,
    direction: "IN",
    date: "2026-10-29",
    reason: "Saldo conciliado",
  });
  const payload = { id, delivery_date: "2026-11-01", reason: "Adopción sin cargos previos" };
  const request = randomUUID();
  await f.valid("SALE_COVERAGE_ADOPT", payload, f.admin, request);
  const adopted = await f.store.loadState();
  assert.equal(adopted.saleItems.find((r) => r.sale_id === id).coverage.quantity, 1);
  await f.valid("SALE_COVERAGE_ADOPT", payload, f.admin, request);
  assert.deepEqual(await f.store.loadState(), adopted);
  assert.equal(
    (await f.send(f.admin, "SALE_COVERAGE_ADOPT", { ...payload, reason: "Otro" }, request)).status,
    409,
  );
  assert.deepEqual(await f.store.loadState(), adopted);
  await f.valid("USER_SAVE", { id: "adopt-other-admin", name: "Admin restante", role: "ADMIN" });
  assert.equal(
    (
      await f.admin("/api/auth/credentials", {
        user_id: "adopt-other-admin",
        login: "adopt-other-admin",
        password: f.secret,
      })
    ).status,
    200,
  );
  await f.valid("USER_SAVE", { id: "http-admin04", name: "Degradado", role: "OPERATOR" });
  const operator = await f.login("admin04", f.secret);
  const before = await f.store.loadState();
  assert.equal((await f.send(operator, "SALE_COVERAGE_ADOPT", payload, request)).status, 403);
  assert.deepEqual(await f.store.loadState(), before);
});

test("NQP26 I07 / R04-07: dos operadores, dos servidores HTTP y último saco sin sobreventa", async (t) => {
  const f = await fixture(t);
  const customer = (await f.valid("CUSTOMER_SAVE", { name: "Cliente HTTP sintético" })).result;
  for (const id of ["op04a", "op04b"]) {
    await f.valid("USER_SAVE", { id, name: id, role: "OPERATOR" });
    assert.equal(
      (await f.admin("/api/auth/credentials", { user_id: id, login: id, password: f.secret })).status,
      200,
    );
  }
  const a = await f.login("op04a", f.secret, 0);
  const b = await f.login("op04b", f.secret, 1);
  await f.valid("INVENTORY_ADJUST", {
    product_id: "prod-1",
    quantity: 1,
    weight_kg: 25,
    direction: "IN",
    date: "2026-10-28",
    reason: "Sintético",
  });
  const payload = salePayload(customer, {
    items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 25, unit_price: 73 }],
  });
  const actors = [a, b];
  const requests = [randomUUID(), randomUUID()];
  const results = await Promise.all(
    actors.map((actor, i) => f.send(actor, "SALE_SAVE", payload, requests[i])),
  );
  for (let i = 0; i < results.length; i++) {
    if (results[i].status !== 200) {
      assert.match(results[i].body.error, /Otra operación/);
      await f.valid("SALE_SAVE", payload, actors[i], requests[i]);
    }
  }
  let state = await f.store.loadState();
  assert.deepEqual(state.saleItems.map((x) => x.coverage.quantity).sort(), [0, 1]);
  assert.equal(state.inventoryMovements.filter((x) => x.movement_type === "SALE_OUT").length, 1);
  assert.equal(
    state.inventoryMovements.reduce((n, x) => n + x.quantity, 0),
    0,
  );
  assert.equal(
    state.inventoryMovements.reduce((n, x) => n + x.weight_kg, 0),
    0,
  );
  const before = structuredClone(state);
  const retry = await f.send(a, "SALE_SAVE", structuredClone(payload), requests[0]);
  assert.equal(retry.status, 200);
  assert.deepEqual(await f.store.loadState(), before);
  const conflict = await f.send(a, "SALE_SAVE", { ...payload, notes: "cuerpo diferente" }, requests[0]);
  assert.equal(conflict.status, 409);
  assert.deepEqual(await f.store.loadState(), before);
  const wrongType = await f.send(a, "CUSTOMER_SAVE", { name: "Otro" }, requests[0]);
  assert.equal(wrongType.status, 409);
  assert.deepEqual(await f.store.loadState(), before);
  // Otro actor con mismo ID crea su propia operación; no recibe la venta privada anterior.
  const independent = await f.valid("CUSTOMER_SAVE", { name: "Identidad B" }, b, requests[0]);
  assert.notEqual(independent.result, retry.body.result);
  await f.valid("USER_SAVE", { id: "op04a", name: "Operador degradado", role: "VIEWER" });
  assert.ok([401, 403].includes((await f.send(a, "SALE_SAVE", payload, requests[0])).status));
  const viewer = await f.login("op04a", f.secret, 0);
  state = await f.store.loadState();
  assert.equal((await f.send(viewer, "SALE_SAVE", payload, requests[0])).status, 403);
  assert.deepEqual(await f.store.loadState(), state);
});

test("NQP26 R04-03/04/05/14/15: HTTP parcial, cero, suficiente, pago y entrega separada", async (t) => {
  const f = await fixture(t);
  const customer = (await f.valid("CUSTOMER_SAVE", { name: "Cliente HTTP cobertura" })).result;
  const adjustment = (product_id, quantity) =>
    f.valid("INVENTORY_ADJUST", {
      product_id,
      quantity,
      weight_kg: quantity * 25,
      direction: "IN",
      date: "2026-10-28",
      reason: "Sintético",
    });
  await adjustment("prod-1", 35);
  await adjustment("prod-2", 2);
  const sell = (product_id, quantity, extra = {}) =>
    f.valid(
      "SALE_SAVE",
      salePayload(customer, {
        items: [{ product_id, quantity, unit_weight_kg: 25, unit_price: 73 }],
        ...extra,
      }),
    );
  const a = await sell("prod-1", 40);
  const b = await sell("prod-1", 35, {
    payment_condition: "CASH",
    payment_method: "TRANSFER",
    paid_amount: 10,
  });
  let state = await f.store.loadState();
  assert.equal(state.saleItems.find((x) => x.sale_id === a.result).coverage.quantity, 35);
  assert.equal(state.saleItems.find((x) => x.sale_id === b.result).coverage.quantity, 0);
  assert.equal(state.payments.length, 1);
  const c = await sell("prod-2", 2, { deliver: true });
  assert.equal(c.state.sales.find((x) => x.id === c.result).fulfillment_status, "PENDING");
  const before = await f.store.loadState();
  const pending = await f.send(f.admin, "SALE_DELIVER", { id: a.result });
  assert.equal(pending.status, 422);
  assert.deepEqual(await f.store.loadState(), before);
  await f.valid("SALE_DELIVER", { id: c.result });
  state = await f.store.loadState();
  assert.deepEqual(state.inventoryMovements, before.inventoryMovements);
  assert.deepEqual(state.payments, before.payments);
  const beforeRead = await f.store.loadState();
  assert.deepEqual(await f.store.loadState(), beforeRead);
  await assert.rejects(createLocalServer(f.configuration), /no admite arranque operativo/);
});
