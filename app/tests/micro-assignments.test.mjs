import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { executeCommand, TABLES } from "../lib/domain.mjs";
import { preparationFixture, plan, command } from "./helpers/preparation-fixture.mjs";
import { actor, identity, payload as receipt } from "./helpers/receipt-fixture.mjs";
import { evaluatePreparation } from "../features/microinsumos/domain/preparations.mjs";
import { initializeDatabase, migrateDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";
const apply = (s, c, options, user = actor) => executeCommand(s, c, user, undefined, options);
const assign = (s, id = s.microPreparations.at(-1).id) =>
  command("MICRO_ASSIGN", {
    preparation_id: id,
    reason: "Selección manual sintética",
    expected_revision: s.revision,
  });
const reverse = (s, id = s.microAssignments.at(-1).id) =>
  command("MICRO_ASSIGNMENT_REVERSE", {
    assignment_id: id,
    reason: "Liberación sintética",
    expected_revision: s.revision,
  });
function orders(nuclei = "10") {
  const f = preparationFixture();
  let s = apply(f.s, plan(f.s, { nuclei }), f.options).state;
  s = apply(s, plan(s, { nuclei }), f.options).state;
  return { ...f, s };
}
const evalOrder = (s, i = 0) => evaluatePreparation(s, s.microPreparations[i], "now");
test("asignación: operador elige B, A rechaza, físico/historia intactos y compensación completa", () => {
  const { s, options } = orders();
  let next = apply(s, assign(s), options, { ...actor, role: "OPERATOR" }).state;
  assert.deepEqual(
    evalOrder(next, 1).items.map((i) => [
      i.physical_hundredths,
      i.assigned_hundredths,
      i.available_hundredths,
    ]),
    [
      [500000, 300000, 200000],
      [500000, 1000, 499000],
    ],
  );
  assert.equal(evalOrder(next, 1).assignment_status, "ASSIGNED");
  assert.equal(evalOrder(next).sufficiency, "MISSING");
  assert.throws(
    () => apply(next, assign(next, s.microPreparations[0].id), options),
    /Saldo libre insuficiente/,
  );
  assert.throws(() => apply(next, assign(next), options), /ya tiene/);
  for (const table of TABLES.filter(
    (t) => !["microAssignments", "microAssignmentLines", "audit"].includes(t),
  ))
    assert.deepEqual(next[table], s[table], table);
  const history = structuredClone(next.microAssignments);
  next = apply(next, reverse(next), options).state;
  assert.deepEqual(next.microAssignments, history);
  assert.equal(evalOrder(next, 1).assignment_status, "UNASSIGNED");
  assert.equal(evalOrder(next).items[0].available_hundredths, 500000);
  assert.throws(() => apply(next, reverse(next), options), /ya fue/);
  next = apply(next, assign(next, s.microPreparations[0].id), options).state;
  assert.equal(next.microAssignments.length, 2);
  assert.equal(next.microAssignmentReversals.length, 1);
});
test("asignación: fail-closed, inactivos, payload, revisión, permisos y mínimo0.01g", () => {
  const { s, options } = orders("0.01");
  const snapshot = structuredClone(s);
  for (const payload of [
    { ...assign(s).payload, reason: "" },
    { ...assign(s).payload, quantity: 1 },
    { ...assign(s).payload, expected_revision: s.revision - 1 },
    { ...assign(s).payload, preparation_id: "missing" },
  ])
    assert.throws(() => apply(s, command("MICRO_ASSIGN", payload), options));
  assert.throws(() => apply(s, assign(s), {}), /política/);
  assert.throws(() => apply(s, assign(s), options, { ...actor, role: "VIEWER" }));
  const inactive = structuredClone(s);
  inactive.microIngredients[1].is_active = false;
  assert.throws(() => apply(inactive, assign(inactive), options), /inactivo/);
  const next = apply(s, assign(s), options).state;
  assert.deepEqual(
    next.microAssignmentLines.map((l) => l.quantity_hundredths),
    [300, 1],
  );
  assert.equal(evalOrder(next, 1).items[1].own_assigned_hundredths, 1);
  assert.deepEqual(s, snapshot);
});
test("asignación: último ingrediente insuficiente, frontera0.01g y compras sin automatismo", () => {
  const { s, options } = orders("0.01");
  s.microOpenings[1].quantity_grams = 0;
  assert.throws(() => apply(s, assign(s), options), /faltan 1 centésimas/);
  assert.equal(s.microAssignments.length, 0);
  assert.equal(s.microAssignmentLines.length, 0);
  const next = apply(s, command("MICRO_RECEIPT_SAVE", receipt()), options).state;
  assert.equal(next.microAssignments.length, 0);
  assert.equal(evalOrder(next).items[0].physical_hundredths, 1000000);
  assert.equal(apply(next, assign(next), options).state.microAssignments.length, 1);
});
async function dbFixture(t, old = false) {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp27-")), "private"));
  const file = join(root, "synthetic.sqlite"),
    catalog = migrationCatalog();
  const prior = {
    ...catalog,
    migrations: catalog.migrations.slice(0, 6),
    schemas: catalog.schemas.slice(0, 7),
  };
  initializeDatabase(file, old ? { catalog: prior } : {});
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const { s, options } = orders();
  const draft = structuredClone(s);
  draft.microPreparations = [];
  draft.microFormulaHeads = [];
  for (const f of draft.microFormulas) {
    f.published_at = null;
    f.published_by = null;
  }
  const store = createStore(() => db, options);
  await store.persistState(null, draft);
  const published = { ...s, microPreparations: [] };
  await store.persistState(draft, published);
  await store.persistState(published, s);
  return { root, file, db, store, s, options, prior };
}
test("asignación SQLite: upgrade0005, replay, rollback última línea, triggers y restauración", async (t) => {
  const f = await dbFixture(t, true);
  const before = inspectDatabase(f.file, { catalog: f.prior });
  const oldBackup = join(f.root, "before.sqlite");
  await backupDatabase(f.file, oldBackup, { catalog: f.prior });
  migrateDatabase(f.file);
  const after = inspectDatabase(f.file);
  for (const row of before.tables.filter((r) => r.name !== "nutrequine_migrations"))
    assert.deepEqual(
      after.tables.find((r) => r.name === row.name),
      row,
    );
  const c = assign(f.s);
  const first = await f.store.runCommand(c, identity);
  assert.deepEqual((await f.store.runCommand(c, identity)).state, first.state);
  await assert.rejects(f.store.runCommand({ ...c, payload: { ...c.payload, reason: "changed" } }, identity));
  await assert.rejects(f.store.runCommand(assign(first.state), identity));
  for (const table of ["micro_assignments", "micro_assignment_lines"])
    for (const action of ["DELETE FROM", "UPDATE"])
      await assert.rejects(
        f.db.batch([
          f.db.prepare(action === "UPDATE" ? `UPDATE ${table} SET data='{}'` : `DELETE FROM ${table}`),
        ]),
      );
  const freed = await f.store.runCommand(reverse(first.state), identity);
  const broken = apply(freed.state, assign(freed.state), f.options).state;
  broken.microAssignmentLines.at(-1).formula_line_id = "bad-last-fk";
  await assert.rejects(f.store.persistState(freed.state, broken));
  assert.deepEqual(await f.store.loadState(), freed.state);
  await assert.rejects(f.db.batch([f.db.prepare("DELETE FROM micro_assignment_reversals")]));
  const backup = join(f.root, "backup.sqlite"),
    restored = join(f.root, "restored.sqlite");
  await backupDatabase(f.file, backup);
  await restoreDatabase(backup, restored);
  const r = openSqliteDatabase(restored);
  try {
    assert.deepEqual(await createStore(() => r).loadState(), freed.state);
  } finally {
    r.close();
  }
  const oldRestored = join(f.root, "rollback.sqlite");
  await restoreDatabase(oldBackup, oldRestored, { catalog: f.prior });
  assert.equal(inspectDatabase(oldRestored, { catalog: f.prior }).version, 6);
  console.log("NQP27 synthetic backup/restore", f.root);
});
test("asignación SQLite: dos procesos sobre un snapshot, un ganador sin doble compromiso", async (t) => {
  const f = await dbFixture(t);
  const worker = String.raw`import {openSqliteDatabase} from './lib/adapters/node-sqlite.mjs';import {createStore} from './lib/application-store.mjs';const db=openSqliteDatabase(process.argv[1]);const store=createStore(()=>db,JSON.parse(process.argv[2]));try{const before=await store.loadState();process.stdout.write('READY\n');process.stdin.once('data',async()=>{try{await store.runCommand(JSON.parse(process.argv[3]),JSON.parse(process.argv[4]));process.stdout.write('WIN\n');}catch{process.stdout.write('REJECT\n');}finally{db.close();}});}catch(e){console.error(e);process.exit(1);}`;
  const start = (c) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          worker,
          f.file,
          JSON.stringify(f.options),
          JSON.stringify(c),
          JSON.stringify(identity),
        ],
        { cwd: process.cwd(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
      );
      let log = "",
        err = "";
      child.stdout.on("data", (b) => {
        log += b;
        if (log.includes("READY"))
          resolve({
            child,
            result: new Promise((done) => child.on("close", (code) => done({ code, log, err }))),
          });
      });
      child.stderr.on("data", (b) => (err += b));
      child.on("error", reject);
      child.on("close", (code) => {
        if (!log.includes("READY")) reject(new Error(`Worker exited ${code}: ${err}`));
      });
      t.after(() => {
        if (child.exitCode === null) child.kill();
      });
    });
  const a = await start(assign(f.s, f.s.microPreparations[0].id)),
    b = await start(assign(f.s, f.s.microPreparations[1].id));
  a.child.stdin.end("GO");
  b.child.stdin.end("GO");
  const results = await Promise.all([a.result, b.result]);
  assert.equal(results.filter((r) => r.log.includes("WIN")).length, 1, JSON.stringify(results));
  assert.equal(results.filter((r) => r.log.includes("REJECT")).length, 1);
  const s = await f.store.loadState();
  assert.equal(s.microAssignments.length, 1);
  assert.equal(s.microAssignmentLines.length, 2);
  assert.equal(evalOrder(s).items[0].available_hundredths, 200000);
});
test("asignación HTTP: 401/403/422, ADMIN/OPERATOR, VIEWER, replay409 y auditoría", async (t) => {
  const f = await dbFixture(t);
  const auth_database = join(f.root, "auth.sqlite");
  const password = crypto.randomUUID() + "Aa!";
  await provisionAuthentication(f.file, auth_database, "link", {
    user_id: actor.id,
    login: "assign.admin",
    password,
  });
  const app = await createLocalServer({
    database: f.file,
    auth_database,
    port: 0,
    micro_preparation_policies: f.options.microPreparationPolicies,
  });
  t.after(() => app.close());
  const url = await app.start();
  let cookie, csrf;
  const login = async () => {
    const r = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "assign.admin", password }),
    });
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
  const c = assign(f.s);
  assert.equal((await send(c, csrf, false)).status, 401);
  assert.equal((await send(c, "bad")).status, 403);
  assert.equal((await send({ ...c, payload: { ...c.payload, reason: "" } })).status, 422);
  assert.deepEqual(await f.store.loadState(), f.s);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send({ ...c, payload: { ...c.payload, reason: "different" } })).status, 409);
  let s = await f.store.loadState();
  assert.equal(s.audit.at(-1).created_by, actor.id);
  for (const role of ["OPERATOR", "VIEWER"]) {
    const n = structuredClone(s);
    n.users[0].role = role;
    n.revision++;
    await f.store.persistState(s, n);
    await login();
    const overview = await (await fetch(url + "/api/micro-preparations", { headers: { cookie } })).json();
    assert.equal(overview.can_create, role === "OPERATOR");
    const before = await f.store.loadState();
    assert.equal((await send(reverse(before))).status, role === "OPERATOR" ? 200 : 403);
    s = await f.store.loadState();
    if (role === "VIEWER") assert.deepEqual(s, before);
  }
});
