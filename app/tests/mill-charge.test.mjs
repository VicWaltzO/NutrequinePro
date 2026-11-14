import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { ready, apply, closeCommand, actor } from "./helpers/mill-fixture.mjs";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import {
  millChargeSnapshot,
  millChargeHistory,
  chargedMacro,
} from "../features/produccion/domain/mill-charge.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { provisionAuthentication } from "../server/provision.mts";
import { createLocalServer } from "../server/application.mts";

const identity = { userId: actor.id, displayName: actor.name };
const command = (s, changes = [], mode = "ACTUAL", index = 0) => ({
  type: "MILL_RECONCILE",
  request_id: crypto.randomUUID(),
  payload: {
    line_id: s.productionJourneyLines[index].id,
    mode,
    changes,
    reason: "Comprobante sintético del molino",
    expected_revision: s.revision,
  },
});
function closed(bags = 39) {
  const f = ready(["1"]);
  f.s = apply(f.s, closeCommand(f.s, bags), f.options).state;
  return f;
}
async function database(t) {
  const f = closed();
  const dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp32-")), "private"));
  const file = join(dir, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db, f.options);
  await store.persistState(null, f.s);
  return { ...f, dir, file, db, store };
}

test("NQP32 servicio por tonelada encargada estable con 40/39/38 y fracción", () => {
  for (const bags of [40, 39, 38]) {
    const f = closed(bags),
      line = f.s.productionJourneyLines[0];
    const value = millChargeSnapshot(line);
    assert.equal(value.service_cents, 25000);
    assert.equal(value.base_weight_grams, 1000000);
    assert.equal(value.actual_cents, value.theoretical_cents);
  }
  const line = closed().s.productionJourneyLines[0];
  assert.equal(millChargeSnapshot({ ...line, planned_weight_grams: 333333 }).service_cents, 8333);
});

test("NQP32 cantidad, precio, ambos, cero y referencia congelada", () => {
  const line = closed().s.productionJourneyLines[0],
    m = line.macro_estimate[0];
  const frozen = structuredClone(line);
  for (const change of [
    { quantity_kg: "2.125" },
    { price_per_kg: "3.25" },
    { quantity_kg: "2.125", price_per_kg: "3.25" },
    { quantity_kg: "0", price_per_kg: "0" },
  ]) {
    const value = millChargeSnapshot(line, "ACTUAL", [{ ingredient_id: m.ingredient_id, ...change }]);
    const row = value.rows[0];
    assert.equal(
      row.actual_charge,
      Math.round(
        Number(change.quantity_kg ?? m.grams / 1000) *
          Number(change.price_per_kg ?? m.price_cents_per_kg / 100) *
          100,
      ),
    );
    assert.equal(row.theoretical_charge, m.estimated_cents);
    assert.equal(value.difference_cents, value.actual_cents - value.theoretical_cents);
    assert.deepEqual(
      value.rows.slice(1).map((r) => r.actual_charge),
      line.macro_estimate.slice(1).map((r) => r.estimated_cents),
    );
  }
  assert.deepEqual(line, frozen);
  assert.equal(chargedMacro(1, 500).actual_charge, 1); // half cent rounds once
});

test("NQP32 validación estricta y modalidades, sin null a cero", () => {
  const line = closed().s.productionJourneyLines[0],
    ingredient_id = line.macro_estimate[0].ingredient_id;
  for (const value of [null, "", NaN, Infinity, -1, "1e4", "1,5", "10000000000000", "0.0001"])
    assert.throws(() => millChargeSnapshot(line, "ACTUAL", [{ ingredient_id, quantity_kg: value }]));
  for (const value of [null, "", NaN, Infinity, -1, "0.001"])
    assert.throws(() => millChargeSnapshot(line, "ACTUAL", [{ ingredient_id, price_per_kg: value }]));
  assert.throws(() => millChargeSnapshot(line, "ROBERTO"));
  assert.throws(() => millChargeSnapshot(line, "THEORETICAL", [{ ingredient_id, quantity_kg: "1" }]));
  assert.throws(() => millChargeSnapshot(line, "ACTUAL", [{ ingredient_id: "otro" }]));
  assert.throws(() => millChargeSnapshot(line, "ACTUAL", [{ ingredient_id }, { ingredient_id }]));
});

test("NQP32 versiones auditadas, permisos, CAS, cierre previo e historia intacta", () => {
  const f = closed(),
    before = structuredClone(f.s);
  const ingredient_id = f.s.productionJourneyLines[0].macro_estimate[0].ingredient_id;
  const out = apply(
    f.s,
    command(f.s, [{ ingredient_id, quantity_kg: "2", price_per_kg: "4" }]),
    f.options,
    f.s.users.find((u) => u.id === "mill-op"),
  );
  const next = apply(out.state, command(out.state, [], "THEORETICAL"), f.options).state;
  const history = millChargeHistory(next, f.s.productionJourneyLines[0].id);
  assert.equal(history.length, 2);
  assert.deepEqual(next.corrections.at(-1).old_snapshot, history[0].new_snapshot);
  for (const table of [
    "productionJourneyLines",
    "millClosures",
    "inventoryMovements",
    "microIssues",
    "microConfirmations",
    "expenses",
    "payments",
    "productions",
    "productionCosts",
    "sales",
  ])
    assert.deepEqual(next[table], before[table], table);
  assert.equal(next.productionJourneyLines[0].final_cost_cents, null);
  assert.throws(() => apply(f.s, command(before), f.options, { ...actor, role: "VIEWER" }), /consultar/);
  assert.throws(() => apply(next, command(before), f.options), /cambiaron/);
  const open = ready(["1"]);
  assert.throws(() => apply(open.s, command(open.s), open.options), /Cierre/);
});

test("NQP32 SQLite replay actor/payload, rollback tardío y auditoría, importación inmutable", async (t) => {
  const f = await database(t),
    c = command(f.s);
  const out = await f.store.runCommand(c, identity);
  assert.deepEqual(await f.store.runCommand(c, identity), out);
  await assert.rejects(
    f.store.runCommand({ ...c, payload: { ...c.payload, reason: "Otro" } }, identity),
    /identificador/,
  );
  await assert.rejects(f.store.runCommand(c, { userId: "mill-op" }), /global/);
  const before = await f.store.loadState();
  const next = apply(before, command(before, [], "THEORETICAL"), f.options).state;
  const plan = writePlan(before, next);
  plan.push({ sql: "INSERT INTO absent_table VALUES (?)", args: ["late"] });
  await assert.rejects(f.db.batch(plan.map((q) => f.db.prepare(q.sql).bind(...q.args))));
  assert.deepEqual(await f.store.loadState(), before);
  const noAudit = structuredClone(next);
  noAudit.audit.pop();
  await assert.rejects(f.store.persistState(before, noAudit), /auditoría/);
  const tampered = structuredClone(before);
  tampered.corrections.at(-1).new_snapshot.service_cents = 1;
  await assert.rejects(f.store.persistState(before, tampered), /inmutable/);
  await assert.rejects(f.store.persistState(null, tampered), /inválido/);
  assert.deepEqual(await f.store.loadState(), before);
});

test("NQP32 SQLite dos operadores/conexiones un ganador, sin doble hecho económico", async (t) => {
  const f = await database(t),
    db2 = openSqliteDatabase(f.file);
  t.after(() => db2.close());
  const results = await Promise.allSettled([
    f.store.runCommand(command(f.s), identity),
    createStore(() => db2, f.options).runCommand(command(f.s), { userId: "mill-op" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const after = await f.store.loadState();
  assert.equal(millChargeHistory(after, f.s.productionJourneyLines[0].id).length, 1);
  assert.deepEqual(after.expenses, f.s.expenses);
  assert.deepEqual(after.inventoryMovements, f.s.inventoryMovements);
});

test("NQP32 tres productos independientes y fallo SQL tardío de auditoría", async (t) => {
  const f = ready();
  let s = f.s;
  for (let i = 0; i < 3; i++) s = apply(s, closeCommand(s, [39, 38, 40][i], i), f.options).state;
  const physical = structuredClone(s.inventoryMovements);
  for (let i = 0; i < 3; i++) {
    s = apply(
      s,
      command(
        s,
        [
          {
            ingredient_id: s.productionJourneyLines[i].macro_estimate[0].ingredient_id,
            price_per_kg: String(i + 1),
          },
        ],
        "ACTUAL",
        i,
      ),
      f.options,
    ).state;
    assert.equal(millChargeHistory(s, s.productionJourneyLines[i].id).length, 1);
    assert.equal(
      millChargeHistory(s, s.productionJourneyLines[i].id)[0].new_snapshot.rows[0].actual_price_cents_per_kg,
      (i + 1) * 100,
    );
  }
  assert.deepEqual(s.inventoryMovements, physical);
  const dbf = await database(t),
    raw = new DatabaseSync(dbf.file);
  t.after(() => raw.close());
  raw.exec(
    "CREATE TRIGGER fail_mill_charge_audit BEFORE INSERT ON audit WHEN json_extract(NEW.data,'$.action')='MILL_RECONCILE' BEGIN SELECT RAISE(ABORT,'late audit failure'); END",
  );
  const before = await dbf.store.loadState();
  await assert.rejects(dbf.store.runCommand(command(before), identity), /late audit failure/);
  assert.deepEqual(await dbf.store.loadState(), before);
  assert.deepEqual(raw.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(raw.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
});

test("NQP32 dos procesos CAS y backup/restore en esquema existente", async (t) => {
  const f = await database(t);
  const children = [0, 1].map(() =>
    fork(new URL("./helpers/mill-race-worker.mjs", import.meta.url), [f.file], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    }),
  );
  t.after(() => children.forEach((c) => c.kill()));
  const prepared = children.map((c) => once(c, "message"));
  children.forEach((c) => c.send({ type: "prepare", command: command(f.s) }));
  await Promise.all(prepared);
  const outcomes = children.map((c) => once(c, "message"));
  children.forEach((c) => c.send({ type: "commit" }));
  assert.equal((await Promise.all(outcomes)).filter(([r]) => r.won).length, 1);
  const saved = await f.store.loadState();
  const backup = join(f.dir, "backup.sqlite");
  await backupDatabase(f.file, backup);
  const restored = join(f.dir, "restored.sqlite");
  await restoreDatabase(backup, restored);
  const db = openSqliteDatabase(restored);
  t.after(() => db.close());
  assert.deepEqual(await createStore(() => db, f.options).loadState(), saved);
});

test("NQP32 HTTP sesión, CSRF, OPERATOR/VIEWER, colisión409 y replay", async (t) => {
  const f = await database(t),
    auth = join(f.dir, "auth.sqlite"),
    password = crypto.randomUUID() + "Aa!";
  await provisionAuthentication(f.file, auth, "link", { login: "mill.admin", user_id: actor.id, password });
  const app = await createLocalServer({
    database: f.file,
    auth_database: auth,
    port: 0,
    micro_preparation_policies: f.options.microPreparationPolicies,
    micro_substitution_policies: f.options.microSubstitutionPolicies,
  });
  t.after(() => app.close());
  const url = await app.start();
  let cookie, csrf;
  const login = async () => {
    const r = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "mill.admin", password }),
    });
    assert.equal(r.status, 200);
    cookie = r.headers.get("set-cookie").split(";")[0];
    csrf = (await r.json()).csrf_token;
  };
  await login();
  const send = (c, token = csrf, authenticated = true) =>
    fetch(url + "/api/command", {
      method: "POST",
      headers: {
        origin: url,
        "content-type": "application/json",
        ...(authenticated ? { cookie, "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(c),
    });
  const c = command(f.s);
  assert.equal((await send(c, csrf, false)).status, 401);
  assert.equal((await send(c, "invalid")).status, 403);
  assert.equal((await send({ ...c, payload: { ...c.payload, mode: "ROBERTO" } })).status, 422);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send({ ...c, payload: { ...c.payload, reason: "Colisión" } })).status, 409);
  let s = await f.store.loadState(),
    updated = structuredClone(s);
  updated.users.find((u) => u.id === actor.id).role = "OPERATOR";
  await f.store.persistState(s, updated);
  await login();
  assert.equal((await send(command(updated, [], "THEORETICAL"))).status, 200);
  s = await f.store.loadState();
  updated = structuredClone(s);
  updated.users.find((u) => u.id === actor.id).role = "VIEWER";
  await f.store.persistState(s, updated);
  await login();
  assert.equal((await send(command(updated))).status, 403);
  assert.equal((await fetch(url + "/api/state", { headers: { cookie } })).status, 200);
  assert.equal(millChargeHistory(await f.store.loadState(), f.s.productionJourneyLines[0].id).length, 2);
});
