import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedState, executeCommand, TABLES } from "../lib/domain.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
const actor = { id: "micro-admin", name: "Admin sintético", role: "ADMIN", is_active: true };
const identity = { userId: actor.id, displayName: actor.name };
const catalog = (id, name = `Micro sintético ${id}`) => ({ operational_id: id, name, is_active: true });
const opening = (id) => ({
  micro_ingredient_id: id,
  quantity_kg: "0.05",
  cutoff_date: "2026-10-30",
  measurement: "ESTIMATED",
  source: "Pesaje sintético",
  notes: "Envase variable",
});

test("micros: 17 identidades y altas adicionales; ID 14 excluido y macro/historia intactos", () => {
  let state = seedState();
  state.sales.push({ id: "legacy-sale", financial_status: "LEGACY_UNCHANGED" });
  const before = structuredClone(state);
  for (const id of [...Array.from({ length: 13 }, (_, i) => i + 1), 15, 16, 17, 18, 19, 20]) {
    state = executeCommand(state, { type: "MICRO_SAVE", payload: catalog(id) }, actor).state;
  }
  assert.equal(state.microIngredients.length, 19);
  assert.throws(() => executeCommand(state, { type: "MICRO_SAVE", payload: catalog(14) }, actor));
  assert.throws(() => executeCommand(state, { type: "MICRO_SAVE", payload: catalog(1) }, actor));
  for (const id of [true, [1], "1e0", 0, -1, 1.5])
    assert.throws(() => executeCommand(state, { type: "MICRO_SAVE", payload: catalog(id) }, actor));
  for (const table of TABLES.filter((t) => !["microIngredients", "microOpenings", "audit"].includes(t)))
    assert.deepEqual(state[table], before[table]);
  const micro = state.microIngredients[0];
  state = executeCommand(
    state,
    { type: "MICRO_SAVE", payload: { ...catalog(1, "Nombre comercial literal Á"), id: micro.id } },
    actor,
  ).state;
  assert.equal(state.microIngredients[0].id, micro.id);
  assert.equal(state.microIngredients[0].name, "Nombre comercial literal Á");
  assert.equal(state.microIngredients[0].known_price_per_kg, null);
});

test("micros: kg exactos, cero, precio opcional, sin tara ni efectos comerciales; corrección versionada", () => {
  let state = seedState();
  for (const [i, q] of ["0", "0.05", "0.10", "1.25", "5", "25"].entries()) {
    const saved = executeCommand(state, { type: "MICRO_SAVE", payload: catalog(i + 1) }, actor);
    state = saved.state;
    const out = executeCommand(
      state,
      { type: "MICRO_OPEN", payload: { ...opening(saved.result), quantity_kg: q, unit_cost: "2.00" } },
      actor,
      "2026-10-30T12:00:00Z",
    );
    state = out.state;
    const row = state.microOpenings.at(-1);
    assert.equal(row.quantity_grams, Number(q) * 1000);
    assert.equal(row.valuation_cents, Number(q) * 200);
    assert.throws(() => executeCommand(state, { type: "MICRO_OPEN", payload: opening(saved.result) }, actor));
  }
  const before = structuredClone(state);
  const row = state.microOpenings[0];
  const corrected = {
    ...opening(row.micro_ingredient_id),
    id: row.id,
    expected_version: 1,
    reason: "Corrección sintética",
    quantity_kg: "1.25",
  };
  state = executeCommand(
    state,
    { type: "MICRO_CORRECT", payload: corrected },
    actor,
    "2026-10-30T12:00:00Z",
  ).state;
  assert.equal(state.microOpenings.length, 6);
  assert.equal(state.microOpenings[0].version, 2);
  assert.throws(() =>
    executeCommand(state, { type: "MICRO_CORRECT", payload: corrected }, actor, "2026-10-30T12:00:00Z"),
  );
  for (const q of ["-1", "0.0001", "1,25", true, {}, [25], "NaN"])
    assert.throws(() =>
      executeCommand(before, { type: "MICRO_CORRECT", payload: { ...corrected, quantity_kg: q } }, actor),
    );
  for (const type of ["MICRO_SAVE", "MICRO_OPEN", "MICRO_CORRECT"])
    for (const role of ["VIEWER", "OPERATOR"])
      assert.throws(() => executeCommand(state, { type, payload: {} }, { ...actor, role }));
  for (const table of [
    "ingredients",
    "formulas",
    "formulaIngredients",
    "productions",
    "expenses",
    "inventoryMovements",
    "sales",
    "payments",
  ])
    assert.deepEqual(state[table], before[table]);
});

test("micros: SQLite dos sesiones, replay, concurrencia, rollback, reinicio y backup/restore", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp26-20-synthetic-")), "private"));
  const filename = join(root, "business.sqlite");
  initializeDatabase(filename);
  const a = openSqliteDatabase(filename),
    b = openSqliteDatabase(filename);
  t.after(() => {
    a.close();
    b.close();
  });
  const store = createStore(() => a),
    other = createStore(() => b);
  await store.ensureState(identity);
  const run = (type, payload, request_id = randomUUID()) =>
    store.runCommand({ type, payload, request_id }, identity);
  const m = await run("MICRO_SAVE", catalog(1, "Colina sintética"));
  const n = await run("MICRO_SAVE", catalog(2, "Biocolina sintética"));
  const request_id = randomUUID();
  const command = { type: "MICRO_OPEN", payload: opening(m.result), request_id };
  await store.runCommand(command, identity);
  const before = await store.loadState();
  await other.runCommand(command, identity);
  assert.deepEqual(await other.loadState(), before);
  await assert.rejects(
    other.runCommand({ ...command, payload: { ...command.payload, quantity_kg: "8" } }, identity),
  );
  const concurrent = await Promise.allSettled([
    run("MICRO_OPEN", opening(n.result)),
    other.runCommand({ type: "MICRO_OPEN", payload: opening(n.result), request_id: randomUUID() }, identity),
  ]);
  assert.equal(concurrent.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await store.loadState()).microOpenings.length, 2);
  const old = await store.loadState();
  const bad = structuredClone(old);
  bad.microOpenings.push({ ...bad.microOpenings[0], id: "invalid", micro_ingredient_id: "missing" });
  bad.revision++;
  await assert.rejects(store.persistState(old, bad));
  assert.deepEqual(await store.loadState(), old);
  const backup = join(root, "backup.sqlite"),
    restored = join(root, "restored.sqlite");
  await backupDatabase(filename, backup);
  await restoreDatabase(backup, restored);
  const c = openSqliteDatabase(restored);
  try {
    assert.deepEqual(await createStore(() => c).loadState(), old);
  } finally {
    c.close();
  }
});

test("micros HTTP: 401/403/422 sin escritura, concurrencia dos sesiones y lectura por rol", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp26-20-http-")), "private"));
  const database = join(root, "business.sqlite"),
    auth_database = join(root, "auth.sqlite");
  initializeDatabase(database);
  const c = openSqliteDatabase(database);
  await createStore(() => c).ensureState(identity);
  c.close();
  const password = randomUUID() + "Aa!";
  await provisionAuthentication(database, auth_database, "link", {
    user_id: actor.id,
    login: "micro.admin",
    password,
  });
  const app = await createLocalServer({ database, auth_database, port: 0 });
  t.after(() => app.close());
  const url = await app.start();
  const login = async () => {
    const r = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "micro.admin", password }),
    });
    assert.equal(r.status, 200);
    return { cookie: r.headers.get("set-cookie").split(";")[0], csrf: (await r.json()).csrf_token };
  };
  const a = await login(),
    b = await login();
  const send = (session, type, payload) =>
    fetch(url + "/api/command", {
      method: "POST",
      headers: {
        origin: url,
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      body: JSON.stringify({ type, payload, request_id: randomUUID() }),
    });
  assert.equal((await fetch(url + "/api/state")).status, 401);
  const response = await send(a, "MICRO_SAVE", catalog(1));
  assert.equal(response.status, 200);
  const id = (await response.json()).result;
  const competing = await Promise.all([
    send(a, "MICRO_OPEN", opening(id)),
    send(b, "MICRO_OPEN", opening(id)),
  ]);
  assert.deepEqual(competing.map((x) => x.status).sort(), [200, 422]);
  assert.equal((await send(a, "MICRO_SAVE", catalog(14))).status, 422);
  for (const role of ["VIEWER", "OPERATOR"]) {
    const userId = actor.id + role;
    assert.equal(
      (await send(a, "USER_SAVE", { id: userId, name: "Rol sintético", role, is_active: true })).status,
      200,
    );
    // Update current credential user's role only after all administrative setup.
  }
  assert.equal(
    (
      await send(a, "USER_SAVE", {
        id: "second-admin",
        name: "Segundo admin",
        role: "ADMIN",
        is_active: true,
      })
    ).status,
    200,
  );
  // Retain an authenticated administrator before reducing current privileges.
  const r = await fetch(url + "/api/auth/credentials", {
    method: "POST",
    headers: { origin: url, "content-type": "application/json", cookie: a.cookie, "x-csrf-token": a.csrf },
    body: JSON.stringify({ user_id: "second-admin", login: "second.admin", password: randomUUID() + "Aa!" }),
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await send(a, "USER_SAVE", { id: actor.id, name: actor.name, role: "VIEWER", is_active: true })).status,
    200,
  );
  const viewer = await login();
  assert.equal((await fetch(url + "/api/state", { headers: { cookie: viewer.cookie } })).status, 200);
  assert.equal((await send(viewer, "MICRO_SAVE", catalog(3))).status, 403);
});
