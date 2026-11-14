import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import {
  fixture,
  actor,
  identity,
  command,
  start,
  entry,
  apply,
  sell,
} from "./helpers/commercial-cost-fixture.mjs";
import {
  commercialCosts,
  costMoney,
  costHistory,
  saleCommercialCost,
} from "../features/inventario/domain/commercial-cost.mjs";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { provisionAuthentication } from "../server/provision.mts";
import { createLocalServer } from "../server/application.mts";
async function database(t, s = entry(start(fixture()), 10)) {
  const dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp33-")), "private")),
    file = join(dir, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db);
  await store.persistState(null, s);
  return { dir, file, db, store, s };
}
const valueCommand = (s) =>
  command(s, "COST_RECOGNIZE", {
    target_id: commercialCosts(s).flows[0].id,
    amount: "1000",
    reference: "DOC",
  });
test("NQP33 SQLite integración entrega pendiente, reconocimiento, liquidación, relectura y conservación", async (t) => {
  let s = entry(start(fixture()), 10),
    out = sell(s, 5);
  const f = await database(t, out.state),
    before = await f.store.loadState();
  await f.store.runCommand(valueCommand(before), identity);
  s = await f.store.loadState();
  assert.equal(saleCommercialCost(s, out.result).status, "PENDING");
  await f.store.runCommand(
    command(s, "COST_SETTLE", { period_open: true, reference: "DOC abierto" }),
    identity,
  );
  s = await f.store.loadState();
  assert.equal(costMoney(saleCommercialCost(s, out.result).cost), 50000);
  for (const table of ["sales", "saleItems", "inventoryMovements", "millClosures", "payments", "expenses"])
    assert.deepEqual(s[table], before[table]);
  const db2 = openSqliteDatabase(f.file);
  t.after(() => db2.close());
  assert.deepEqual(await createStore(() => db2).loadState(), s);
});
test("NQP33 SQLite replay estricto actor/payload, importación auditada e inmutable", async (t) => {
  const f = await database(t),
    c = valueCommand(f.s),
    out = await f.store.runCommand(c, identity);
  assert.deepEqual(await f.store.runCommand(c, identity), out);
  await assert.rejects(
    f.store.runCommand({ ...c, payload: { ...c.payload, amount: "999" } }, identity),
    /identificador/,
  );
  await assert.rejects(f.store.runCommand(c, { userId: "cost-admin2" }), /global/);
  const before = await f.store.loadState(),
    tampered = structuredClone(before);
  tampered.corrections.at(-1).new_snapshot.amount = { n: "1", d: "1" };
  await assert.rejects(f.store.persistState(before, tampered), /inmutable/);
  await assert.rejects(f.store.persistState(null, tampered), /Importe/);
  const missing = structuredClone(before);
  missing.audit.pop();
  await assert.rejects(f.store.persistState(null, missing), /auditoría/);
  assert.deepEqual(await f.store.loadState(), before);
});
test("NQP33 SQLite rollback tardío, hashes de backup, integridad y restauración", async (t) => {
  const f = await database(t),
    raw = new DatabaseSync(f.file);
  t.after(() => raw.close());
  const before = await f.store.loadState();
  raw.exec(
    "CREATE TRIGGER fail_cost33 BEFORE INSERT ON audit WHEN json_extract(NEW.data,'$.action')='COST_RECOGNIZE' BEGIN SELECT RAISE(ABORT,'late cost33 failure'); END",
  );
  await assert.rejects(f.store.runCommand(valueCommand(before), identity), /late cost33/);
  assert.deepEqual(await f.store.loadState(), before);
  raw.exec("DROP TRIGGER fail_cost33");
  const next = apply(before, valueCommand(before)).state,
    plan = writePlan(before, next);
  plan.push({ sql: "INSERT INTO missing_cost33 VALUES (?)", args: ["late"] });
  await assert.rejects(f.db.batch(plan.map((q) => f.db.prepare(q.sql).bind(...q.args))));
  assert.deepEqual(await f.store.loadState(), before);
  await f.store.runCommand(valueCommand(before), identity);
  const saved = await f.store.loadState();
  const backup = join(f.dir, "backup.sqlite"),
    restored = join(f.dir, "restored.sqlite");
  await backupDatabase(f.file, backup);
  await restoreDatabase(backup, restored);
  const db = openSqliteDatabase(restored);
  t.after(() => db.close());
  assert.deepEqual(await createStore(() => db).loadState(), saved);
  assert.equal(raw.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(raw.prepare("PRAGMA foreign_key_check").all(), []);
});
test("NQP33 SQLite dos conexiones y dos procesos, un ganador por revisión", async (t) => {
  const f = await database(t),
    db2 = openSqliteDatabase(f.file);
  t.after(() => db2.close());
  const outcomes = await Promise.allSettled([
    f.store.runCommand(valueCommand(f.s), identity),
    createStore(() => db2).runCommand(valueCommand(f.s), { userId: "cost-admin2" }),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const s = await f.store.loadState(),
    children = [0, 1].map(() =>
      fork(new URL("./helpers/mill-race-worker.mjs", import.meta.url), [f.file], {
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      }),
    );
  t.after(() => children.forEach((c) => c.kill()));
  const prepared = children.map((c) => once(c, "message"));
  children.forEach((c) =>
    c.send({
      type: "prepare",
      command: command(s, "COST_ADJUST", {
        key: commercialCosts(s).groups[0].key,
        amount: "1",
        direction: "INCREASE",
        reference: "DOC",
      }),
    }),
  );
  await Promise.all(prepared);
  const results = children.map((c) => once(c, "message"));
  children.forEach((c) => c.send({ type: "commit" }));
  assert.equal((await Promise.all(results)).filter(([r]) => r.won).length, 1);
  assert.equal(costMoney(commercialCosts(await f.store.loadState()).groups[0].value), 100100);
});
test("NQP33 HTTP 401/403/422/409, tres roles, CSRF y GET sin escrituras", async (t) => {
  const f = await database(t),
    auth = join(f.dir, "auth.sqlite"),
    password = crypto.randomUUID() + "Aa!";
  await provisionAuthentication(f.file, auth, "link", { login: "cost.admin", user_id: actor.id, password });
  const app = await createLocalServer({ database: f.file, auth_database: auth, port: 0 });
  t.after(() => app.close());
  const url = await app.start();
  let cookie, csrf;
  const login = async () => {
    const r = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "cost.admin", password }),
    });
    assert.equal(r.status, 200);
    cookie = r.headers.get("set-cookie").split(";")[0];
    csrf = (await r.json()).csrf_token;
  };
  await login();
  const send = (c, token = csrf, auth = true) =>
    fetch(url + "/api/command", {
      method: "POST",
      headers: {
        origin: url,
        "content-type": "application/json",
        ...(auth ? { cookie, "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(c),
    });
  const c = valueCommand(f.s);
  assert.equal((await send(c, csrf, false)).status, 401);
  assert.equal((await send(c, "invalid")).status, 403);
  assert.equal((await send({ ...c, payload: { ...c.payload, amount: null } })).status, 422);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send({ ...c, payload: { ...c.payload, amount: "2" } })).status, 409);
  for (const role of ["OPERATOR", "VIEWER"]) {
    const s = await f.store.loadState(),
      updated = structuredClone(s);
    updated.users.find((u) => u.id === actor.id).role = role;
    await f.store.persistState(s, updated);
    await login();
    assert.equal(
      (
        await send(
          command(updated, "COST_ADJUST", {
            key: commercialCosts(updated).groups[0].key,
            amount: "1",
            direction: "INCREASE",
            reference: "DOC",
          }),
        )
      ).status,
      403,
    );
  }
  const before = await f.store.loadState();
  assert.equal((await fetch(url + "/api/state", { headers: { cookie } })).status, 200);
  assert.deepEqual(await f.store.loadState(), before);
  assert.equal(costHistory(before).filter((r) => r.new_snapshot.kind === "RECOGNIZE").length, 1);
});
