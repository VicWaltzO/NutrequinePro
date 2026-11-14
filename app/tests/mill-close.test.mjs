import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { ready, apply, closeCommand, actor } from "./helpers/mill-fixture.mjs";
import { link, substitute } from "./helpers/journey-fixture.mjs";
import { stock } from "../features/inventario/domain/stock.mjs";
import { journeySummary } from "../features/produccion/domain/journey-view.mjs";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { initializeDatabase, inspectDatabase, migrateDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { provisionAuthentication } from "../server/provision.mts";
import { createLocalServer } from "../server/application.mts";
const identity = { userId: actor.id, displayName: actor.name };
async function database(t, f = ready(), prior = false) {
  const dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp30-")), "private"));
  const file = join(dir, "synthetic.sqlite");
  const catalog = migrationCatalog();
  const old = {
    ...catalog,
    migrations: catalog.migrations.slice(0, 10),
    schemas: catalog.schemas.slice(0, 11),
  };
  initializeDatabase(file, prior ? { catalog: old } : {});
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db, f.options);
  await store.persistState(null, f.s);
  return { ...f, dir, file, db, store, old };
}
test("NQP30 40→40/39/38, productos separados, macro una vez y micro/costos/historia íntegros", () => {
  const f = ready();
  let s = f.s;
  const history = JSON.stringify([
    s.microIssues,
    s.microConfirmations,
    s.microLedgers,
    s.productions,
    s.productionProducts,
    s.productionIngredients,
    s.productionCosts,
    s.expenses,
    s.sales,
    s.saleItems,
    s.productionJourneyLines,
  ]);
  for (const [i, bags] of [40, 39, 38].entries()) {
    s = apply(s, closeCommand(s, bags, i), f.options).state;
    assert.equal(stock(s, `prod-${i + 1}`).quantity - stock(f.s, `prod-${i + 1}`).quantity, bags);
    assert.equal(s.millClosures[i].waste_grams, (40 - bags) * 25000);
    assert.equal(
      s.inventoryMovements.filter((m) => m.source_id === s.millClosures[i].id && m.item_type === "PRODUCT")
        .length,
      1,
    );
    const macros = s.inventoryMovements.filter(
      (m) => m.source_id === s.millClosures[i].id && m.item_type === "INGREDIENT",
    );
    assert.deepEqual(
      macros.map((m) => [m.item_id, m.weight_kg]),
      s.productionJourneyLines[i].macro_estimate
        .filter((m) => m.grams > 0)
        .map((m) => [m.ingredient_id, -m.grams]),
    );
  }
  assert.equal(
    JSON.stringify([
      s.microIssues,
      s.microConfirmations,
      s.microLedgers,
      s.productions,
      s.productionProducts,
      s.productionIngredients,
      s.productionCosts,
      s.expenses,
      s.sales,
      s.saleItems,
      s.productionJourneyLines,
    ]),
    history,
  );
  assert.equal(journeySummary(s, s.productionJourneys[0]).status, "CLOSED");
  assert.throws(() => apply(s, closeCommand(s), f.options), /cerrado/);
  assert.throws(
    () => apply(s, link(s, s.productionJourneyLines[0].id, s.microPreparations[0].id, "1"), f.options),
    /cerrado/,
  );
});
test("NQP30 fracción0.01: cero completos,10kg merma sin entrada comercial; uno/dos productos", () => {
  for (const q of [["0.01"], ["1", "1"]]) {
    const f = ready(q);
    const out = apply(f.s, closeCommand(f.s, q.length === 1 ? 0 : 39), f.options).state;
    assert.equal(out.productionJourneyLines.length, q.length);
    if (q.length === 1) {
      assert.equal(out.millClosures[0].waste_grams, 10000);
      assert.equal(out.millClosures[0].movement_id, null);
      assert.equal(stock(out, "prod-1").quantity, stock(f.s, "prod-1").quantity);
    } else assert.equal(journeySummary(out, out.productionJourneys[0]).lines[1].actual_bags, null);
  }
});
test("NQP30 límites, fecha, lote completo, revisión, roles, falta de vínculos y unidades", () => {
  const f = ready(["1"]);
  for (const patch of [
    { actual_bags: -1 },
    { actual_bags: 39.5 },
    { actual_bags: "39" },
    { actual_bags: NaN },
    { actual_bags: Infinity },
    { actual_bags: 0 },
    { actual_bags: 41 },
    { date: "2026-02-30" },
    { date: "2026-11-11" },
    { lot_complete: false },
    { formula_consent: null },
    { expected_revision: -1 },
    { cost: 1 },
  ])
    assert.throws(() =>
      apply(f.s, { ...closeCommand(f.s), payload: { ...closeCommand(f.s).payload, ...patch } }, f.options),
    );
  assert.throws(() => apply(f.s, closeCommand(f.s), f.options, { ...actor, role: "VIEWER" }));
  assert.equal(
    apply(f.s, closeCommand(f.s), f.options, { ...actor, role: "OPERATOR" }).state.millClosures.length,
    1,
  );
  const missing = structuredClone(f.s);
  missing.productionJourneyLinks = [];
  assert.throws(() => apply(missing, closeCommand(missing), f.options), /Vincule/);
  const wrong = structuredClone(f.s);
  wrong.products[0].presentation_unit = "BOTTLE";
  assert.throws(() => apply(wrong, closeCommand(wrong), f.options), /25 kg/);
  const partial = structuredClone(f.s);
  partial.productionJourneyLinks[0].nuclei_hundredths = 50;
  assert.throws(() => apply(partial, closeCommand(partial), f.options), /Vincule/);
  const reserved = structuredClone(f.s);
  reserved.sales.push({ coverage_version: 1 });
  assert.throws(() => apply(reserved, closeCommand(reserved), f.options), /prototipo/);
});
test("NQP30 micro prevista distinta: consentimiento explícito, conservación de ISSUE y referencias", () => {
  const f = ready(["1"]);
  let s = apply(f.s, substitute(f.s), f.options).state;
  // Explicit new plan snapshot against a previously confirmed formula in the same family.
  const original = s.productionJourneyLines[0].micro_formula_id;
  s = structuredClone(s);
  s.productionJourneyLines[0].micro_formula_id = s.microFormulaHeads.find(
    (h) => h.family === "ROSADO",
  ).active_formula_id;
  assert.notEqual(original, s.productionJourneyLines[0].micro_formula_id);
  assert.throws(() => apply(s, closeCommand(s), f.options), /microfórmula/);
  const c = closeCommand(s);
  c.payload.formula_consent = true;
  const after = apply(s, c, f.options).state;
  assert.equal(after.millClosures[0].formula_mismatch, true);
  assert.deepEqual(after.microIssues, s.microIssues);
  assert.equal(journeySummary(after, after.productionJourneys[0]).lines[0].links[0].formula_id, original);
});
test("NQP30 SQLite replay canónico, actor/payload409, cierre único, CAS y rollback final/auditoría", async (t) => {
  const f = await database(t);
  const c = closeCommand(f.s);
  const out = await f.store.runCommand(c, identity);
  assert.deepEqual(await f.store.runCommand(c, identity), out);
  assert.deepEqual(
    await f.store.runCommand(
      { ...c, payload: Object.fromEntries(Object.entries(c.payload).reverse()) },
      identity,
    ),
    out,
  );
  await assert.rejects(
    f.store.runCommand({ ...c, payload: { ...c.payload, actual_bags: 38 } }, identity),
    /identificador/,
  );
  await assert.rejects(f.store.runCommand(c, { userId: "mill-op", displayName: "Operador" }), /global/);
  await assert.rejects(f.store.runCommand(closeCommand(out.state), identity), /cerrado/);
  const before = await f.store.loadState();
  const next = apply(before, closeCommand(before, 38, 1), f.options).state;
  next.audit.at(-1).request_id = "audit-test";
  await assert.rejects(f.store.persistState(before, next), /audit|auditoría/);
  assert.deepEqual(await f.store.loadState(), before);
  const cmd = closeCommand(before, 38, 1);
  const valid = apply(before, cmd, f.options).state;
  valid.audit.at(-1).request_id = cmd.request_id;
  const plan = writePlan(before, valid);
  plan.push({ sql: "INSERT INTO absent_table VALUES (?)", args: ["late"] });
  await assert.rejects(f.db.batch(plan.map((q) => f.db.prepare(q.sql).bind(...q.args))));
  assert.deepEqual(await f.store.loadState(), before);
  const raw = new DatabaseSync(f.file);
  t.after(() => raw.close());
  for (const sql of [
    "UPDATE mill_closures SET data=data",
    "DELETE FROM mill_closures",
    "DELETE FROM inventory_movements WHERE json_extract(data,'$.source_type')='MILL_CLOSURE'",
  ])
    assert.throws(() => raw.exec(sql), /Immutable/);
  assert.deepEqual(raw.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(raw.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
});
test("NQP30 SQLite dos conexiones: único ganador y cero entradas duplicadas", async (t) => {
  const f = await database(t);
  const db2 = openSqliteDatabase(f.file);
  t.after(() => db2.close());
  const results = await Promise.allSettled([
    f.store.runCommand(closeCommand(f.s), identity),
    createStore(() => db2, f.options).runCommand(closeCommand(f.s, 38), identity),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const s = await f.store.loadState();
  assert.equal(s.millClosures.length, 1);
  assert.equal(
    s.inventoryMovements.filter((m) => m.item_type === "PRODUCT" && m.source_type === "MILL_CLOSURE").length,
    1,
  );
});
test("NQP30 SQLite dos procesos simultáneos: CAS, un cierre y un ingreso", async (t) => {
  const f = await database(t);
  const children = [0, 1].map(() =>
    fork(new URL("./helpers/mill-race-worker.mjs", import.meta.url), [f.file], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    }),
  );
  t.after(() => children.forEach((c) => c.kill()));
  const prepared = children.map((c) => once(c, "message"));
  children.forEach((c) => c.send({ type: "prepare", command: closeCommand(f.s) }));
  await Promise.all(prepared);
  const outcomes = children.map((c) => once(c, "message"));
  children.forEach((c) => c.send({ type: "commit" }));
  const results = await Promise.all(outcomes);
  assert.equal(results.filter(([r]) => r.won).length, 1);
  const s = await f.store.loadState();
  assert.equal(s.millClosures.length, 1);
  assert.equal(stock(s, "prod-1").quantity - stock(f.s, "prod-1").quantity, 39);
});
test("NQP30 SQLite upgrade0009, hashes históricos y backup/restore sintéticos", async (t) => {
  const f = await database(t, ready(), true);
  const before = inspectDatabase(f.file, { catalog: f.old });
  await backupDatabase(f.file, join(f.dir, "before.sqlite"), { catalog: f.old });
  migrateDatabase(f.file);
  const after = inspectDatabase(f.file);
  for (const row of before.tables.filter((r) => r.name !== "nutrequine_migrations"))
    assert.deepEqual(
      after.tables.find((r) => r.name === row.name),
      row,
    );
  await f.store.runCommand(closeCommand(f.s), identity);
  await backupDatabase(f.file, join(f.dir, "after.sqlite"));
  await restoreDatabase(join(f.dir, "after.sqlite"), join(f.dir, "restored.sqlite"));
  assert.deepEqual(inspectDatabase(join(f.dir, "restored.sqlite")).tables, inspectDatabase(f.file).tables);
  await restoreDatabase(join(f.dir, "before.sqlite"), join(f.dir, "rollback.sqlite"), { catalog: f.old });
  assert.equal(inspectDatabase(join(f.dir, "rollback.sqlite"), { catalog: f.old }).version, 10);
});
test("NQP30 HTTP401/403/422/409,CSRF,OPERATOR,VIEWER y GET sin escrituras", async (t) => {
  const f = await database(t);
  const auth = join(f.dir, "auth.sqlite"),
    password = crypto.randomUUID() + "Aa!";
  await provisionAuthentication(f.file, auth, "link", { login: "mill.admin", user_id: actor.id, password });
  const app = await createLocalServer({
    database: f.file,
    auth_database: auth,
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
      body: JSON.stringify({ login: "mill.admin", password }),
    });
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
  const c = closeCommand(f.s);
  assert.equal((await send(c, csrf, false)).status, 401);
  assert.equal((await send(c, "bad")).status, 403);
  assert.equal((await send({ ...c, payload: { ...c.payload, actual_bags: 39.5 } })).status, 422);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send({ ...c, payload: { ...c.payload, actual_bags: 38 } })).status, 409);
  let before = await f.store.loadState();
  for (let i = 0; i < 2; i++)
    assert.equal((await fetch(url + "/api/state", { headers: { cookie } })).status, 200);
  assert.deepEqual(await f.store.loadState(), before);
  for (const [role, expected, index] of [
    ["OPERATOR", 200, 1],
    ["VIEWER", 403, 2],
  ]) {
    const s = structuredClone(before);
    s.users[0].role = role;
    await f.store.persistState(before, s);
    await login();
    assert.equal((await send(closeCommand(s, 38, index))).status, expected);
    before = await f.store.loadState();
  }
});
