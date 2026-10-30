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
import { customerDuplicateReview } from "../features/clientes/domain/name-matches.mjs";

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

test("D09-08/09/16/17/18: autoridad HTTP, dos actores, reintento, roles y replay T03", async (t) => {
  const f = await fixture(t);
  await f.valid("USER_SAVE", { id: "operator09", name: "Operador sintético", role: "OPERATOR" });
  assert.equal(
    (
      await f.admin("/api/auth/credentials", {
        user_id: "operator09",
        login: "operator09",
        password: f.secret,
      })
    ).status,
    200,
  );
  const operator = await f.login("operator09", f.secret, 1);
  const name = "Federico Salazar";
  const outcomes = await Promise.all([
    f.send(f.admin, "CUSTOMER_SAVE", { name }),
    f.send(operator, "CUSTOMER_SAVE", { name: name.toUpperCase() }),
  ]);
  assert.equal(outcomes.filter((x) => x.status === 200).length, 1);
  assert.equal(outcomes.filter((x) => x.status === 422).length, 1);
  const state = await f.store.loadState();
  for (const confirm_duplicate of [undefined, false, "true", 1, null]) {
    const rejected = await f.send(operator, "CUSTOMER_SAVE", { name, confirm_duplicate });
    assert.equal(rejected.status, 422, JSON.stringify(rejected.body));
    assert.deepEqual(await f.store.loadState(), state);
  }
  const review = customerDuplicateReview(state.customers, name);
  const payload = { name, confirm_duplicate: true, duplicate_review: review };
  const requestId = randomUUID();
  const saved = await f.valid("CUSTOMER_SAVE", payload, operator, requestId);
  const after = await f.store.loadState();
  const replay = await f.valid("CUSTOMER_SAVE", payload, operator, requestId);
  assert.equal(replay.result, saved.result);
  assert.deepEqual(await f.store.loadState(), after);
  assert.equal(
    (await f.send(operator, "CUSTOMER_SAVE", { ...payload, name: "Nombre cambiado" }, requestId)).status,
    409,
  );
  assert.deepEqual(await f.store.loadState(), after);
  assert.equal(
    (await f.send(operator, "CUSTOMER_SAVE", payload)).status,
    422,
    "El review previo no conoce al nuevo candidato",
  );
  assert.deepEqual(await f.store.loadState(), after);
  await f.valid(
    "CUSTOMER_SAVE",
    { ...payload, duplicate_review: customerDuplicateReview(after.customers, name) },
    operator,
  );
  await f.valid("USER_SAVE", { id: "operator09", name: "Operador sintético", role: "VIEWER" });
  const viewer = await f.login("operator09", f.secret, 1);
  const beforeForbidden = await f.store.loadState();
  assert.equal(
    (await f.send(viewer, "CUSTOMER_SAVE", payload, requestId)).status,
    403,
    "Permiso vigente antes del replay",
  );
  assert.deepEqual(await f.store.loadState(), beforeForbidden);
});
