import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCommand, TABLES } from "../lib/domain.mjs";
import { actor, identity, payload as receipt } from "./helpers/receipt-fixture.mjs";
import { preparationFixture, plan, command } from "./helpers/preparation-fixture.mjs";
import {
  evaluatePreparation,
  validatePreparationPolicies,
} from "../features/microinsumos/domain/preparations.mjs";
import { initializeDatabase, migrateDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";
const evaluate = (s) => evaluatePreparation(s, s.microPreparations.at(-1), "2026-11-09T16:00:00Z");
const apply = (s, cmd, options, user = actor) => executeCommand(s, cmd, user, undefined, options);

test("planes: dos familias/20 núcleos, faltantes exactos y todos los históricos intactos", () => {
  const { s, options } = preparationFixture();
  let next = apply(s, plan(s), options).state;
  assert.equal(next.microPreparations[0].status, "PENDING");
  assert.equal(next.microPreparations[0].nuclei_hundredths, 2000);
  assert.deepEqual(
    evaluate(next).items.map((i) => [i.required_hundredths, i.available_hundredths, i.missing_hundredths]),
    [
      [600000, 500000, 100000],
      [2000, 500000, 0],
    ],
  );
  assert.equal(evaluate(next).sufficiency, "MISSING");
  next = apply(
    next,
    plan(next, { family: "VERDE_AMARILLO", formula_id: next.microFormulaHeads[1].active_formula_id }),
    options,
  ).state;
  assert.equal(evaluate(next).sufficiency, "POTENTIALLY_RESUMABLE");
  for (const table of TABLES.filter((t) => !["microPreparations", "audit"].includes(t)))
    assert.deepEqual(next[table], s[table], table);
});
test("planes: sin saldo, dosis mínima, decimales y oráculo entero de centésimas de gramo", () => {
  const { s, options } = preparationFixture();
  s.microOpenings = [];
  for (const nuclei of ["0.01", "0,05", "1.25", "20"]) {
    const next = apply(s, plan(s, { nuclei }), options).state;
    const result = evaluate(next);
    const count = BigInt(Math.round(Number(nuclei.replace(",", ".")) * 100));
    assert.deepEqual(
      result.items.map((i) => i.required_hundredths),
      [Number(300n * count), Number(count)],
    );
    assert.equal(result.items[1].missing_hundredths, Number(count));
    assert.equal(result.items[0].stock_source, "UNRECORDED");
  }
});
test("planes: validación cerrada, receta parcial/no autorizada, roles y 422 sin mutar", () => {
  const { s, policies, options } = preparationFixture();
  const snapshot = structuredClone(s);
  for (const extra of [
    { nuclei: "0" },
    { nuclei: "0.001" },
    { nuclei: "1e2" },
    { nuclei: 20 },
    { date: "2026-02-30" },
    { date: {} },
    { family: "OTHER" },
    { formula_id: "missing" },
    { formula_id: policies[1].formula_id },
    { expected_revision: s.revision - 1 },
    { status: "COMPLETED" },
    { id: "old" },
  ])
    assert.throws(() => apply(s, plan(s, extra), options));
  assert.throws(() => apply(s, plan(s), {}), /política/);
  const partial = structuredClone(options);
  partial.microPreparationPolicies[0].lines.pop();
  assert.throws(() => apply(s, plan(s), partial), /incompleta/);
  assert.throws(() => apply(s, plan(s), options, { ...actor, role: "VIEWER" }));
  assert.equal(apply(s, plan(s), options, { ...actor, role: "OPERATOR" }).state.microPreparations.length, 1);
  assert.throws(() => validatePreparationPolicies([{ ...policies[0], lines: [] }]));
  const inactive = structuredClone(s);
  inactive.microIngredients[0].is_active = false;
  assert.throws(() => apply(inactive, plan(inactive), options), /inactivos/);
  const draft = apply(
    s,
    command("MICRO_FORMULA_SAVE", { family: "ROSADO", expected_version: 2, lines: [] }),
    options,
  );
  assert.throws(
    () => apply(draft.state, plan(draft.state, { formula_id: draft.result }), options),
    /publicada/,
  );
  assert.deepEqual(s, snapshot);
});
test("planes: fórmula histórica aplicada permanece y nueva versión exige aprobación propia", () => {
  const { s, options } = preparationFixture();
  let next = apply(s, plan(s), options).state;
  const original = structuredClone(next.microPreparations[0]);
  const requirements = evaluate(next).items;
  const draft = apply(
    next,
    command("MICRO_FORMULA_SAVE", {
      family: "ROSADO",
      expected_version: 2,
      lines: [{ micro_ingredient_id: "m1", dose_kg: "0.007" }],
    }),
    options,
  );
  next = apply(
    draft.state,
    command("MICRO_FORMULA_ACTIVATE", { family: "ROSADO", formula_id: draft.result, expected_version: 3 }),
    options,
  ).state;
  assert.deepEqual(next.microPreparations[0], original);
  assert.deepEqual(evaluate(next).items, requirements);
  assert.throws(() => apply(next, plan(next, { formula_id: original.formula_id }), options), /activa/);
  assert.throws(() => apply(next, plan(next), options), /política/);
});
test("planes: compras NQP22 reevaluadas; libro prevalece, históricos no suman, competencia sin reservas", () => {
  const { s, options } = preparationFixture();
  s.microPurchases.push({ id: "history25", status: "CONFIRMED" });
  s.microPurchaseLines.push({
    id: "history-line",
    purchase_id: "history25",
    micro_ingredient_id: "m1",
    quantity_grams: 25000,
  });
  let next = apply(s, plan(s), options).state;
  assert.equal(evaluate(next).items[0].available_hundredths, 500000);
  next = apply(next, plan(next), options).state;
  const orders = structuredClone(next.microPreparations);
  next = apply(next, command("MICRO_RECEIPT_SAVE", receipt()), options).state;
  assert.deepEqual(next.microPreparations, orders);
  assert.equal(evaluate(next).items[0].available_hundredths, 1000000);
  for (const order of next.microPreparations)
    assert.equal(evaluatePreparation(next, order, "now").sufficiency, "POTENTIALLY_RESUMABLE");
  const protectedSnapshot = structuredClone(next);
  evaluate(next);
  assert.deepEqual(next, protectedSnapshot);
  assert.equal(next.microValuationEvents.length, 2);
  assert.equal(next.microLedgers[0].ledger.events.length, 1);
  assert.deepEqual(next.inventoryMovements, s.inventoryMovements);
});
test("planes SQLite: upgrade0004, dos conexiones CAS, replay, FK tardía, inmutabilidad y backup/restore", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp26-db-")), "private"));
  const file = join(root, "synthetic.sqlite"),
    catalog = migrationCatalog();
  const old = {
    ...catalog,
    migrations: catalog.migrations.slice(0, 5),
    schemas: catalog.schemas.slice(0, 6),
  };
  initializeDatabase(file, { catalog: old });
  let c = openSqliteDatabase(file);
  const { s, options } = preparationFixture();
  // Published recipes must go through draft -> lines -> publication even in fixtures.
  const draftState = structuredClone(s);
  for (const f of draftState.microFormulas) {
    f.published_at = null;
    f.published_by = null;
  }
  draftState.microFormulaHeads = [];
  const oldState = { ...draftState };
  delete oldState.microPreparations;
  const oldPlan = writePlan(null, { ...oldState, microPreparations: [] });
  await c.batch(oldPlan.map((r) => c.prepare(r.sql).bind(...r.args)));
  await c.batch(writePlan(draftState, s).map((r) => c.prepare(r.sql).bind(...r.args)));
  c.close();
  const prior = inspectDatabase(file, { catalog: old });
  const backupOld = join(root, "before.sqlite");
  await backupDatabase(file, backupOld, { catalog: old });
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
  const a = createStore(() => c, options),
    b = createStore(() => c2, options);
  const p = plan(await a.loadState());
  const race = await Promise.allSettled([
    a.runCommand(p, identity),
    b.runCommand({ ...p, request_id: randomUUID() }, identity),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const first = await a.loadState();
  const accepted = first.audit.at(-1);
  const replay = { type: accepted.action, payload: accepted.payload, request_id: accepted.request_id };
  assert.deepEqual((await b.runCommand(replay, identity)).state, first);
  await assert.rejects(b.runCommand({ ...replay, payload: { ...replay.payload, nuclei: "1" } }, identity));
  const other = structuredClone(first);
  other.users.push({ ...actor, id: "other" });
  other.revision++;
  await a.persistState(first, other);
  await assert.rejects(b.runCommand(replay, { userId: "other", displayName: "otro" }), /global/);
  const before = await a.loadState();
  const next = apply(before, plan(before), options).state;
  next.microPreparations.at(-1).formula_id = "bad-fk";
  await assert.rejects(a.persistState(before, next));
  assert.deepEqual(await a.loadState(), before);
  for (const sql of [
    "DELETE FROM micro_preparations",
    "UPDATE micro_preparations SET nuclei_hundredths=1",
    "UPDATE micro_preparations SET data='{}'",
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
  const rollback = join(root, "rollback0004.sqlite");
  await restoreDatabase(backupOld, rollback, { catalog: old });
  assert.equal(inspectDatabase(rollback, { catalog: old }).version, 5);
  console.log("NQP26-26 synthetic recovery", root);
});
test("planes HTTP: sesión, CSRF, ADMIN/OPERATOR escriben, VIEWER consulta, replay y actor real", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp26-http-")), "private"));
  const database = join(root, "synthetic.sqlite"),
    auth_database = join(root, "auth.sqlite");
  initializeDatabase(database);
  const db = openSqliteDatabase(database);
  const { s, policies } = preparationFixture();
  const draft = structuredClone(s);
  for (const f of draft.microFormulas) {
    f.published_at = null;
    f.published_by = null;
  }
  draft.microFormulaHeads = [];
  const store = createStore(() => db);
  await store.persistState(null, draft);
  await store.persistState(draft, s);
  const password = randomUUID() + "Aa!";
  await provisionAuthentication(database, auth_database, "link", {
    user_id: actor.id,
    login: "plan.admin",
    password,
  });
  const app = await createLocalServer({
    database,
    auth_database,
    port: 0,
    micro_preparation_policies: policies,
  });
  t.after(async () => {
    await app.close();
    db.close();
  });
  const url = await app.start();
  let cookie, csrf;
  const login = async () => {
    const r = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "plan.admin", password }),
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
  assert.equal((await fetch(url + "/api/micro-preparations")).status, 401);
  assert.equal((await send(plan(s), csrf, false)).status, 401);
  assert.equal((await send(plan(s), "bad")).status, 403);
  const before = await store.loadState();
  assert.equal((await send(plan(before, { nuclei: "0.001" }))).status, 422);
  assert.deepEqual(await store.loadState(), before);
  const c = plan(before);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send({ ...c, payload: { ...c.payload, nuclei: "1" } })).status, 409);
  let next = await store.loadState();
  assert.equal(next.microPreparations.length, 1);
  assert.equal(next.audit.at(-1).created_by, actor.id);
  assert.equal(next.audit.at(-1).request_id, c.request_id);
  for (const role of ["OPERATOR", "VIEWER"]) {
    const changed = structuredClone(next);
    changed.users[0].role = role;
    changed.revision++;
    await store.persistState(next, changed);
    await login();
    const overview = await (await fetch(url + "/api/micro-preparations", { headers: { cookie } })).json();
    assert.equal(overview.can_create, role === "OPERATOR");
    const response = await send(plan(changed));
    assert.equal(response.status, role === "OPERATOR" ? 200 : 403);
    next = await store.loadState();
  }
});
