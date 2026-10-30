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
  const store = createStore(() => connection);
  await store.ensureState({ userId: "http-admin04", displayName: "Admin sintético 04" });
  const secret = randomBytes(24).toString("base64url");
  await provisionAuthentication(database, auth_database, "link", {
    user_id: "http-admin04",
    name: "Admin sintético 04",
    login: "admin04",
    password: secret,
  });
  for (let i = 0; i < 2; i++) {
    const app = await createLocalServer({ database, auth_database, port: 0 });
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

test("D10-06/14/15/16/17/18/19/20: HTTP dos operadores, flags, permisos y replay", async (t) => {
  const f = await fixture(t);
  await f.valid("USER_SAVE", { id: "operator10", name: "Operador sintético", role: "OPERATOR" });
  assert.equal(
    (
      await f.admin("/api/auth/credentials", {
        user_id: "operator10",
        login: "operator10",
        password: f.secret,
      })
    ).status,
    200,
  );
  const operator = await f.login("operator10", f.secret, 1);
  const customer = (await f.valid("CUSTOMER_SAVE", { name: "Cliente HTTP sede" })).result;
  const site_id = (await f.valid("SITE_SAVE", { name: "Destino HTTP" })).result;
  const payload = salePayload(customer, {
    site_id,
    site_link_mode: "LINK",
    confirm_site_link: true,
    confirm: true,
  });
  for (const extra of [
    { confirm: "true" },
    { confirm: false },
    { confirm_site_link: "true" },
    { confirm_site_link: false },
    { site_link_mode: null },
    { site_link_mode: "ONE_TIME" },
    { deliver: 1 },
  ]) {
    const before = await f.store.loadState();
    assert.equal((await f.send(operator, "SALE_SAVE", { ...payload, ...extra })).status, 422);
    assert.deepEqual(await f.store.loadState(), before);
  }
  await f.valid("SALE_SAVE", salePayload(customer, { site_id }), operator);
  assert.equal((await f.store.loadState()).customerSites.filter((x) => x.customer_id === customer).length, 0);
  const ids = [randomUUID(), randomUUID()];
  const results = await Promise.all([
    f.send(f.admin, "SALE_SAVE", payload, ids[0]),
    f.send(operator, "SALE_SAVE", payload, ids[1]),
  ]);
  for (let i = 0; i < results.length; i++) {
    assert.ok([200, 422].includes(results[i].status), JSON.stringify(results[i]));
    if (results[i].status !== 200) await f.valid("SALE_SAVE", payload, i === 0 ? f.admin : operator, ids[i]);
  }
  let state = await f.store.loadState();
  assert.equal(state.sales.length, 3);
  assert.equal(state.customerSites.filter((x) => x.customer_id === customer).length, 1);
  await f.valid("SALE_SAVE", payload, operator, ids[1]);
  assert.deepEqual(await f.store.loadState(), state);
  assert.equal((await f.send(operator, "SALE_SAVE", { ...payload, notes: "changed" }, ids[1])).status, 409);
  assert.deepEqual(await f.store.loadState(), state);
  await f.valid("CUSTOMER_SITES_SAVE", { id: customer, site_ids: [] });
  await f.valid("SALE_SAVE", salePayload(customer, { site_id }), operator);
  assert.equal(
    (await f.store.loadState()).customerSites.find((x) => x.customer_id === customer).is_active,
    false,
  );
  await f.valid("SALE_SAVE", payload, operator);
  await f.valid("SITE_SAVE", { id: site_id, name: "Destino HTTP", is_active: false });
  state = await f.store.loadState();
  assert.equal((await f.send(operator, "SALE_SAVE", payload)).status, 422);
  assert.deepEqual(await f.store.loadState(), state);
  await f.valid("SITE_SAVE", { id: site_id, name: "Destino HTTP", is_active: true });
  await f.valid("CUSTOMER_SAVE", { id: customer, name: "Cliente HTTP sede", is_active: false });
  state = await f.store.loadState();
  assert.equal((await f.send(operator, "SALE_SAVE", payload)).status, 422);
  assert.deepEqual(await f.store.loadState(), state);
  await f.valid("USER_SAVE", { id: "operator10", name: "Operador sintético", role: "VIEWER" });
  const viewer = await f.login("operator10", f.secret, 1);
  state = await f.store.loadState();
  assert.equal((await f.send(viewer, "SALE_SAVE", payload, ids[1])).status, 403);
  assert.deepEqual(await f.store.loadState(), state);
});
