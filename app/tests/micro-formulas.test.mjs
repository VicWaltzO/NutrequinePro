import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCommand, TABLES } from "../lib/domain.mjs";
import { fixture, actor, identity } from "./helpers/receipt-fixture.mjs";
import { MICRO_FAMILIES, microFormulaRequirement } from "../features/microinsumos/domain/formulas.mjs";
import { initializeDatabase, migrateDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";
const cmd = (type, payload) => ({ type, payload, request_id: randomUUID() });
const payload = (extra = {}) => ({
  family: "ROSADO",
  expected_version: 0,
  lines: [
    { micro_ingredient_id: "m1", dose_kg: "0.05" },
    { micro_ingredient_id: "m2", dose_kg: "0.15" },
  ],
  ...extra,
});
const save = (s, extra) => executeCommand(s, cmd("MICRO_FORMULA_SAVE", payload(extra)), actor);
const activate = (s, id, family = "ROSADO") =>
  executeCommand(
    s,
    cmd("MICRO_FORMULA_ACTIVATE", {
      family,
      formula_id: id,
      expected_version: s.microFormulaHeads.find((h) => h.family === family)?.version ?? 0,
    }),
    actor,
  );
test("microfórmulas: dos familias, historial separado, identidad estable y cero efectos colaterales", () => {
  const before = fixture();
  assert.deepEqual(Object.keys(MICRO_FAMILIES), ["ROSADO", "VERDE_AMARILLO"]);
  let { state: s, result: id } = save(before);
  assert.equal(s.microFormulaHeads[0].active_formula_id, null);
  s = activate(s, id).state;
  const old = structuredClone(s.microFormulas[0]),
    oldLines = structuredClone(s.microFormulaLines);
  let next = save(s, { expected_version: 2, lines: [{ micro_ingredient_id: "m1", dose_kg: "0.017" }] });
  s = activate(next.state, next.result).state;
  assert.deepEqual(s.microFormulas[0], old);
  assert.deepEqual(s.microFormulaLines.slice(0, 2), oldLines);
  assert.notEqual(s.microFormulaHeads[0].active_formula_id, id);
  assert.throws(() => activate(s, id), /historial/);
  next = save(s, { family: "VERDE_AMARILLO" });
  s = activate(next.state, next.result, "VERDE_AMARILLO").state;
  assert.equal(s.microFormulaHeads.filter((h) => h.active_formula_id).length, 2);
  for (const table of TABLES.filter(
    (t) => !["microFormulas", "microFormulaLines", "microFormulaHeads", "audit"].includes(t),
  ))
    assert.deepEqual(s[table], before[table], table);
  assert.equal(s.microFormulaLines[0].micro_ingredient_id, "m1");
  assert.equal(s.microFormulaLines[0].dose_grams, 50);
  assert.equal(s.microFormulaLines[1].dose_grams, 150);
  assert.deepEqual(microFormulaRequirement(s.microFormulaLines.slice(0, 2), "20"), [
    { micro_ingredient_id: "m1", grams_hundredths: 100000 },
    { micro_ingredient_id: "m2", grams_hundredths: 300000 },
  ]);
  assert.deepEqual(microFormulaRequirement([{ micro_ingredient_id: "m1", dose_grams: 1 }], "0.01"), [
    { micro_ingredient_id: "m1", grams_hundredths: 1 },
  ]);
});
test("microfórmulas: validación estricta, borrador incompleto, activos y permisos", () => {
  const s = fixture(),
    snapshot = structuredClone(s);
  for (const value of ["0", "-1", "NaN", "0.0001", "Infinity", "1e2", null, {}, 0.05])
    assert.throws(() => save(s, { lines: [{ micro_ingredient_id: "m1", dose_kg: value }] }));
  for (const extra of [
    { family: "VERDE" },
    { expected_version: 1 },
    { id: "old" },
    { lines: null },
    { lines: [{ micro_ingredient_id: "ing-1", dose_kg: "1" }] },
    { lines: [payload().lines[0], payload().lines[0]] },
  ])
    assert.throws(() => save(s, extra));
  for (const role of ["OPERATOR", "VIEWER"])
    assert.throws(() => executeCommand(s, cmd("MICRO_FORMULA_SAVE", payload()), { ...actor, role }));
  assert.deepEqual(s, snapshot);
  const draft = save(s, { lines: [] });
  assert.throws(() => activate(draft.state, draft.result), /vacía/);
  let next = save(s);
  next.state.microIngredients[0].is_active = false;
  assert.throws(() => activate(next.state, next.result), /inactivos/);
  next = save(s);
  next.state = activate(next.state, next.result).state;
  next.state.microIngredients[0].is_active = false;
  assert.equal(next.state.microFormulaLines[0].name_snapshot, "Micro ficticio 1");
  assert.throws(() => save(next.state, { expected_version: 2 }), /inactivo/);
  assert.throws(
    () =>
      executeCommand(
        s,
        cmd("MICRO_SAVE", { operational_id: 14, name: "Micro sintético", is_active: true }),
        actor,
      ),
    /14/,
  );
});
test("microfórmulas SQLite: migración0003, CAS dos conexiones, 17 líneas atómicas, replay y recovery", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp24-db-")), "private"));
  const file = join(root, "synthetic.sqlite"),
    catalog = migrationCatalog();
  const old = {
    ...catalog,
    migrations: catalog.migrations.slice(0, 4),
    schemas: catalog.schemas.slice(0, 5),
  };
  initializeDatabase(file, { catalog: old });
  let c = openSqliteDatabase(file);
  const s = fixture();
  s.microIngredients = Array.from({ length: 18 }, (_, i) => i + 1)
    .filter((id) => id !== 14)
    .map((id) => ({
      id: `synth-${id}`,
      operational_id: id,
      name: `Ingrediente ficticio ${id}`,
      unit: "KG",
      is_active: true,
      known_price_per_kg: null,
    }));
  s.microOpenings = [];
  await c.batch(writePlan(null, s).map((r) => c.prepare(r.sql).bind(...r.args)));
  c.close();
  const prior = inspectDatabase(file, { catalog: old });
  migrateDatabase(file);
  for (const table of prior.tables.filter((r) => r.name !== "nutrequine_migrations"))
    assert.deepEqual(
      inspectDatabase(file).tables.find((r) => r.name === table.name),
      table,
    );
  c = openSqliteDatabase(file);
  const c2 = openSqliteDatabase(file);
  t.after(() => {
    c.close();
    c2.close();
  });
  const a = createStore(() => c),
    b = createStore(() => c2);
  const p = payload({
    lines: s.microIngredients.map((m, i) => ({
      micro_ingredient_id: m.id,
      dose_kg: `0.${String(21 + i).padStart(3, "0")}`,
    })),
  });
  const command = cmd("MICRO_FORMULA_SAVE", p);
  const outcome = await a.runCommand(command, identity);
  assert.equal(outcome.state.microFormulaLines.length, 17);
  assert.deepEqual((await b.runCommand(command, identity)).state, outcome.state);
  await assert.rejects(b.runCommand({ ...command, payload: { ...p, notes: "different" } }, identity));
  const draft = outcome.result;
  await a.runCommand(
    cmd("MICRO_FORMULA_ACTIVATE", { family: "ROSADO", formula_id: draft, expected_version: 1 }),
    identity,
  );
  const race = await Promise.allSettled(
    [a, b].map((st) => st.runCommand(cmd("MICRO_FORMULA_SAVE", { ...p, expected_version: 2 }), identity)),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const before = await a.loadState();
  const next = save(before, { ...p, expected_version: 3 }).state;
  next.microFormulaLines.at(-1).micro_ingredient_id = "invalid-fk";
  await assert.rejects(a.persistState(before, next));
  assert.deepEqual(await a.loadState(), before);
  for (const sql of [
    "DELETE FROM micro_formulas",
    "DELETE FROM micro_formula_lines",
    "UPDATE micro_formula_lines SET dose_grams=2",
    "UPDATE micro_formulas SET version=99",
  ])
    await assert.rejects(c.batch([c.prepare(sql)]));
  const backup = join(root, "backup.sqlite"),
    restored = join(root, "restored.sqlite");
  await backupDatabase(file, backup);
  await restoreDatabase(backup, restored);
  const r = openSqliteDatabase(restored);
  try {
    assert.deepEqual(await createStore(() => r).loadState(), before);
  } finally {
    r.close();
  }
  console.log("NQP26-24 SQLite integrity/FK/CAS/recovery PASS", root);
});
test("microfórmulas HTTP: 401/403/422, CSRF, ADMIN escribe y lectores consultan", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp24-http-")), "private"));
  const database = join(root, "synthetic.sqlite"),
    auth_database = join(root, "auth.sqlite");
  initializeDatabase(database);
  const c = openSqliteDatabase(database);
  await createStore(() => c).persistState(null, fixture());
  c.close();
  const password = randomUUID() + "Aa!";
  await provisionAuthentication(database, auth_database, "link", {
    user_id: actor.id,
    login: "formula.admin",
    password,
  });
  const app = await createLocalServer({ database, auth_database, port: 0 });
  t.after(() => app.close());
  const url = await app.start();
  const login = await fetch(url + "/api/auth/login", {
    method: "POST",
    headers: { origin: url, "content-type": "application/json" },
    body: JSON.stringify({ login: "formula.admin", password }),
  });
  let cookie = login.headers.get("set-cookie").split(";")[0],
    csrf = (await login.json()).csrf_token;
  const send = (command, token = csrf, authenticated = true) =>
    fetch(url + "/api/command", {
      method: "POST",
      headers: {
        origin: url,
        "content-type": "application/json",
        ...(authenticated ? { cookie, "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(command),
    });
  assert.equal((await send(cmd("MICRO_FORMULA_SAVE", payload()), csrf, false)).status, 401);
  assert.equal((await send(cmd("MICRO_FORMULA_SAVE", payload()), "bad")).status, 403);
  assert.equal(
    (await send(cmd("MICRO_FORMULA_SAVE", payload({ lines: [{ micro_ingredient_id: "m1", dose_kg: "0" }] }))))
      .status,
    422,
  );
  assert.equal((await send(cmd("MICRO_FORMULA_SAVE", payload()))).status, 200);
  for (const role of ["OPERATOR", "VIEWER"]) {
    const db = openSqliteDatabase(database);
    const store = createStore(() => db);
    const before = await store.loadState();
    const after = structuredClone(before);
    after.users[0].role = role;
    after.revision++;
    await store.persistState(before, after);
    db.close();
    const relogin = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "formula.admin", password }),
    });
    cookie = relogin.headers.get("set-cookie").split(";")[0];
    csrf = (await relogin.json()).csrf_token;
    assert.equal((await send(cmd("MICRO_FORMULA_SAVE", payload({ expected_version: 1 })))).status, 403);
    assert.equal(
      (
        await send(
          cmd("MICRO_FORMULA_ACTIVATE", { family: "ROSADO", expected_version: 1, formula_id: "bad" }),
        )
      ).status,
      403,
    );
    assert.equal((await fetch(url + "/api/state", { headers: { cookie } })).status, 200);
  }
});
