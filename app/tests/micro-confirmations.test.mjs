import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeCommand, TABLES } from "../lib/domain.mjs";
import { fixture, actor, identity, payload } from "./helpers/receipt-fixture.mjs";
import { command } from "./helpers/preparation-fixture.mjs";
import { evaluatePreparation } from "../features/microinsumos/domain/preparations.mjs";
import { initializeDatabase, migrateDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";

const apply = (s, c, options, user = actor) =>
  executeCommand(s, c, user, "2026-11-10T12:00:00.000Z", options);
export function confirmationFixture(count = 2, nuclei = "20") {
  let s = fixture();
  s.microIngredients = Array.from({ length: count }, (_, i) => ({
    ...s.microIngredients[0],
    id: `m${i + 1}`,
    operational_id: i < 13 ? i + 1 : i + 2,
    name: `Ingrediente ficticio ${i + 1}`,
  }));
  s.microOpenings = s.microIngredients.map((m, i) => ({
    ...s.microOpenings[0],
    id: `o${i}`,
    micro_ingredient_id: m.id,
    quantity_grams: 10000,
    cutoff_date: "2026-10-30",
  }));
  const saved = apply(
    s,
    command("MICRO_FORMULA_SAVE", {
      family: "ROSADO",
      expected_version: 0,
      lines: s.microIngredients.map((m, i) => ({
        micro_ingredient_id: m.id,
        dose_kg: i ? "0.001" : "0.300",
      })),
    }),
    {},
  );
  s = apply(
    saved.state,
    command("MICRO_FORMULA_ACTIVATE", { family: "ROSADO", formula_id: saved.result, expected_version: 1 }),
    {},
  ).state;
  const options = {
    microPreparationPolicies: [
      {
        family: "ROSADO",
        formula_id: saved.result,
        reference: "Política sintética NQP28",
        lines: s.microFormulaLines.map((l) => ({
          micro_ingredient_id: l.micro_ingredient_id,
          dose_grams: l.dose_grams,
        })),
      },
    ],
  };
  s = apply(
    s,
    command("MICRO_PREPARATION_CREATE", {
      family: "ROSADO",
      formula_id: saved.result,
      nuclei,
      date: "2026-11-09",
      expected_revision: s.revision,
    }),
    options,
  ).state;
  s = apply(
    s,
    command("MICRO_ASSIGN", {
      preparation_id: s.microPreparations[0].id,
      reason: "Asignación sintética",
      expected_revision: s.revision,
    }),
    options,
  ).state;
  return { s, options };
}
export const confirm = (s, nuclei = "12", extra = {}) =>
  command("MICRO_PREPARATION_CONFIRM", {
    preparation_id: s.microPreparations[0].id,
    nuclei,
    date: "2026-11-10",
    expected_revision: s.revision,
    ...extra,
  });

test("NQP28 17 líneas: 20→12 cierra, libera8, costo racional y tablas comerciales intactas", () => {
  const { s, options } = confirmationFixture(17);
  s.productions.push({ id: "legacy-synthetic-production", status: "CLOSED", production_date: "2026-10-01" });
  s.productionCosts.push({
    id: "legacy-synthetic-cost",
    production_id: "legacy-synthetic-production",
    category: "NUCLEUS",
    quantity: 1,
    unit_cost: 723,
    total_cost: 723,
  });
  const next = apply(s, confirm(s), options, { ...actor, role: "OPERATOR" }).state;
  assert.equal(next.microIssues.length, 17);
  assert.equal(next.microConfirmations.length, 1);
  assert.deepEqual(next.microConfirmations[0].total_cost_cents, { n: "3792", d: "5" });
  assert.deepEqual(next.microConfirmations[0].unit_cost_cents, { n: "316", d: "5" });
  const first = evaluatePreparation(next, next.microPreparations[0], "now").items[0];
  assert.equal(first.physical_hundredths, 640000);
  assert.equal(first.available_hundredths, 640000);
  assert.equal(first.assigned_hundredths, 0);
  assert.equal(next.microIssues[0].released_hundredths, 240000);
  for (const table of TABLES.filter(
    (t) => !["microConfirmations", "microIssues", "microLedgers", "audit"].includes(t),
  ))
    assert.deepEqual(next[table], s[table], table);
  assert.throws(() => apply(next, confirm(next), options), /cerrada/);
  assert.throws(
    () =>
      apply(
        next,
        command("MICRO_ASSIGN", {
          preparation_id: s.microPreparations[0].id,
          reason: "Otra",
          expected_revision: next.revision,
        }),
        options,
      ),
    /cerrada/,
  );
  assert.throws(
    () =>
      apply(
        next,
        command("MICRO_ASSIGNMENT_REVERSE", {
          assignment_id: s.microAssignments[0].id,
          reason: "Otra",
          expected_revision: next.revision,
        }),
        options,
      ),
    /consumida/,
  );
  const newOrder = apply(
    next,
    command("MICRO_PREPARATION_CREATE", {
      family: "ROSADO",
      formula_id: s.microPreparations[0].formula_id,
      nuclei: "8",
      date: "2026-11-10",
      expected_revision: next.revision,
    }),
    options,
  ).state;
  assert.equal(newOrder.microPreparations.length, 2);
  assert.equal(next.microPreparations.length, 1);
});

test("NQP28 exactitud 0.01g/0.5g/1g, receipts posteriores y snapshots duraderos", () => {
  for (const nuclei of ["0.01", "0.50", "1"]) {
    const { s, options } = confirmationFixture(2, nuclei);
    const next = apply(s, confirm(s, nuclei), options).state;
    const units = Math.round(Number(nuclei) * 100);
    assert.equal(next.microIssues[1].quantity_hundredths, units);
    assert.equal(next.microLedgers[1].ledger.quantity_hundredths, 1000000 - units);
    const snapshot = structuredClone(next.microConfirmations);
    const received = apply(
      next,
      command("MICRO_RECEIPT_SAVE", payload({ document_date: "2026-11-10" })),
      options,
    ).state;
    assert.equal(received.microLedgers[1].ledger.quantity_hundredths, 1200000 - units);
    assert.deepEqual(received.microConfirmations, snapshot);
    assert.deepEqual(received.microLedgers[1].ledger.events[0], next.microLedgers[1].ledger.events[0]);
  }
});

test("NQP28 fallos de autorización, cantidad, último costo, cancelación y versión sin cambios", () => {
  const { s, options } = confirmationFixture();
  const before = structuredClone(s);
  for (const nuclei of ["0", "20.01", "-1", "0.001", 12, "100000000000000000"])
    assert.throws(() => apply(s, confirm(s, nuclei), options));
  for (const bad of [
    {},
    { date: "2026-02-30" },
    { date: "2026-11-11" },
    { expected_revision: 0 },
    { manual: [] },
  ]) {
    if (!Object.keys(bad).length) assert.throws(() => apply(s, confirm(s), {}), /política/);
    else assert.throws(() => apply(s, confirm(s, "12", bad), options));
  }
  assert.throws(() => apply(s, confirm(s), options, { ...actor, role: "VIEWER" }));
  const noCost = structuredClone(s);
  noCost.microOpenings[1].unit_cost_cents = null;
  assert.throws(() => apply(noCost, confirm(noCost), options), /sin costo/);
  const reversed = apply(
    s,
    command("MICRO_ASSIGNMENT_REVERSE", {
      assignment_id: s.microAssignments[0].id,
      reason: "Liberar",
      expected_revision: s.revision,
    }),
    options,
  ).state;
  assert.throws(() => apply(reversed, confirm(reversed), options), /vigente/);
  assert.deepEqual(s, before);
});

async function databaseFixture(t, old = false) {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp28-")), "private"));
  const file = join(root, "synthetic.sqlite");
  const catalog = migrationCatalog();
  const prior = {
    ...catalog,
    migrations: catalog.migrations.slice(0, 7),
    schemas: catalog.schemas.slice(0, 8),
  };
  initializeDatabase(file, old ? { catalog: prior } : {});
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const { s, options } = confirmationFixture();
  s.users.push({ id: "confirm-op", name: "Operador sintético", role: "OPERATOR", is_active: true });
  const draft = structuredClone(s);
  draft.microPreparations = [];
  draft.microAssignments = [];
  draft.microAssignmentLines = [];
  draft.microFormulaHeads = [];
  for (const f of draft.microFormulas) {
    f.published_at = null;
    f.published_by = null;
  }
  const store = createStore(() => db, options);
  await store.persistState(null, draft);
  const published = { ...s, microPreparations: [], microAssignments: [], microAssignmentLines: [] };
  await store.persistState(draft, published);
  await store.persistState(published, s);
  return { root, file, db, store, s, options, prior };
}

test("NQP28 SQLite upgrade0006, replay actor/payload, rollback tardío, cierre inmutable y restore", async (t) => {
  const f = await databaseFixture(t, true);
  const before = inspectDatabase(f.file, { catalog: f.prior });
  const backupBefore = join(f.root, "before.sqlite");
  await backupDatabase(f.file, backupBefore, { catalog: f.prior });
  migrateDatabase(f.file);
  const upgraded = inspectDatabase(f.file);
  for (const row of before.tables.filter((r) => r.name !== "nutrequine_migrations"))
    assert.deepEqual(
      upgraded.tables.find((r) => r.name === row.name),
      row,
    );
  const c = confirm(f.s);
  const broken = apply(f.s, c, f.options).state;
  broken.microIssues.at(-1).quantity_hundredths++;
  await assert.rejects(f.store.persistState(f.s, broken));
  assert.deepEqual(await f.store.loadState(), f.s);
  const missingAudit = apply(f.s, c, f.options).state;
  missingAudit.audit.pop();
  await assert.rejects(f.store.persistState(f.s, missingAudit));
  assert.deepEqual(await f.store.loadState(), f.s);
  const first = await f.store.runCommand(c, identity);
  assert.deepEqual(await f.store.runCommand(c, identity), first);
  assert.deepEqual(
    await f.store.runCommand(
      { ...c, payload: Object.fromEntries(Object.entries(c.payload).reverse()) },
      identity,
    ),
    first,
  );
  await assert.rejects(f.store.runCommand(c, { userId: "confirm-op", displayName: "Operador sintético" }));
  await assert.rejects(f.store.runCommand({ ...c, payload: { ...c.payload, nuclei: "11" } }, identity));
  for (const table of ["micro_confirmations", "micro_issues", "micro_ledgers"])
    for (const sql of [`DELETE FROM ${table}`, `UPDATE ${table} SET data='{}'`])
      await assert.rejects(f.db.batch([f.db.prepare(sql)]));
  await assert.rejects(f.store.runCommand(confirm(first.state), identity));
  const second = openSqliteDatabase(f.file);
  try {
    assert.deepEqual(await createStore(() => second, f.options).loadState(), first.state);
  } finally {
    second.close();
  }
  const backup = join(f.root, "after.sqlite"),
    restored = join(f.root, "restored.sqlite");
  await backupDatabase(f.file, backup);
  await restoreDatabase(backup, restored);
  assert.deepEqual(inspectDatabase(restored).tables, inspectDatabase(f.file).tables);
  const oldRestored = join(f.root, "rollback.sqlite");
  await restoreDatabase(backupBefore, oldRestored, { catalog: f.prior });
  assert.equal(inspectDatabase(oldRestored, { catalog: f.prior }).version, 7);
  console.log("NQP28 recovery synthetic", f.root);
});

test("NQP28 SQLite dos conexiones: una confirmación ganadora, sin dobles consumos", async (t) => {
  const f = await databaseFixture(t);
  const second = openSqliteDatabase(f.file);
  t.after(() => second.close());
  const outcomes = await Promise.allSettled([
    f.store.runCommand(confirm(f.s), identity),
    createStore(() => second, f.options).runCommand(confirm(f.s), identity),
  ]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  const state = await f.store.loadState();
  assert.equal(state.microConfirmations.length, 1);
  assert.equal(state.microIssues.length, 2);
});

test("NQP28 HTTP 401/403/422, CSRF, operador, viewer GET y replay409", async (t) => {
  const f = await databaseFixture(t);
  const authFile = join(f.root, "auth.sqlite"),
    password = crypto.randomUUID() + "Aa!";
  await provisionAuthentication(f.file, authFile, "link", {
    login: "confirm.admin",
    user_id: actor.id,
    password,
  });
  const app = await createLocalServer({
    database: f.file,
    auth_database: authFile,
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
      body: JSON.stringify({ login: "confirm.admin", password }),
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
  const c = confirm(f.s);
  assert.equal((await send(c, csrf, false)).status, 401);
  assert.equal((await send(c, "bad")).status, 403);
  assert.equal((await send({ ...c, payload: { ...c.payload, nuclei: "0" } })).status, 422);
  assert.deepEqual(await f.store.loadState(), f.s);
  let state = await f.store.loadState();
  const operator = structuredClone(state);
  operator.users[0].role = "OPERATOR";
  operator.revision++;
  await f.store.persistState(state, operator);
  await login();
  const op = confirm(operator);
  assert.equal((await send(op)).status, 200);
  assert.equal((await send(op)).status, 200);
  assert.equal((await send({ ...op, payload: { ...op.payload, nuclei: "11" } })).status, 409);
  state = await f.store.loadState();
  const viewer = structuredClone(state);
  viewer.users[0].role = "VIEWER";
  viewer.revision++;
  await f.store.persistState(state, viewer);
  await login();
  assert.equal((await send(confirm(viewer))).status, 403);
  assert.equal((await fetch(url + "/api/micro-preparations", { headers: { cookie } })).status, 200);
  assert.deepEqual(await f.store.loadState(), viewer);
});
