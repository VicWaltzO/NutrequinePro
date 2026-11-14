import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  journeyFixture,
  create,
  link,
  confirmed,
  actor,
  command,
  substitute,
} from "./helpers/journey-fixture.mjs";
import { TABLES, executeCommand } from "../lib/domain.mjs";
import { journeySummary } from "../features/produccion/domain/journeys.mjs";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { initializeDatabase, inspectDatabase, migrateDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { provisionAuthentication } from "../server/provision.mts";
import { createLocalServer } from "../server/application.mts";
const apply = (s, c, o, u = actor) => executeCommand(s, c, u, "2026-11-13T20:00:00.000Z", o);
async function database(t, f = journeyFixture()) {
  const dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp29-")), "private"));
  const file = join(dir, "business.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db, f.options);
  await store.persistState(null, f.s);
  return { ...f, dir, file, db, store };
}
const identity = { userId: actor.id, displayName: actor.name };
test("NQP29 tres productos desiguales, snapshots propios, sin efectos y dos jornadas por fecha", () => {
  const { s, options } = journeyFixture();
  const out = apply(s, create(s), options);
  const j = journeySummary(out.state, out.state.productionJourneys[0]);
  assert.equal(j.lines.length, 3);
  assert.equal(j.status, "PENDING");
  assert.deepEqual(
    j.lines.map((l) => l.nuclei_hundredths),
    [2000, 400, 600],
  );
  assert.equal(new Set(j.lines.map((l) => l.formula_id)).size, 3);
  assert.ok(
    j.lines.every((l) => l.waste_grams === null && l.actual_bags === null && l.final_cost_cents === null),
  );
  for (const table of TABLES.filter(
    (t) => !["productionJourneys", "productionJourneyLines", "audit"].includes(t),
  ))
    assert.deepEqual(out.state[table], s[table], table);
  assert.equal(apply(out.state, create(out.state), options).state.productionJourneys.length, 2);
});
test("NQP29 validación estricta, familias, permisos, revisión y ausencia de autorización", () => {
  const { s, options } = journeyFixture();
  assert.throws(() => apply(s, create(s), options, { ...actor, role: "VIEWER" }));
  assert.equal(
    apply(s, create(s), options, { ...actor, role: "OPERATOR" }).state.productionJourneys.length,
    1,
  );
  assert.throws(() => apply(s, create(s), {}), /autorización/);
  for (const change of [
    (p) => (p.lines = []),
    (p) => p.lines.push(p.lines[0]),
    (p) => (p.lines[0].nuclei = "0"),
    (p) => (p.lines[0].nuclei = "0.001"),
    (p) => (p.lines[0].micro_formula_id = p.lines[1].micro_formula_id),
    (p) => (p.lines[0].formula_id = p.lines[1].formula_id),
    (p) => (p.date = "2026-02-30"),
    (p) => p.expected_revision--,
    (p) => (p.confirm = true),
    (p) => (p.lines[0].product_id = "prod-4"),
  ]) {
    const c = create(s);
    change(c.payload);
    assert.throws(() => apply(s, c, options));
  }
  const c = create(s, ["1"]);
  assert.equal(apply(s, c, options).state.productionJourneyLines.length, 1);
});
test("NQP29 10+10 NQP25, costos/ISSUE históricos, fórmula futura y parcial sin cierre", () => {
  const f = journeyFixture();
  let { s, id: a } = confirmed(f.s, f.options);
  s = apply(
    s,
    command("MICRO_GROUP_LINK", {
      preparation_id: a,
      group_reference: "MIXTA29",
      reason: "Ensayo",
      expected_revision: s.revision,
    }),
    f.options,
  ).state;
  s = apply(s, substitute(s), f.options).state;
  let next = confirmed(s, f.options);
  s = next.s;
  const b = next.id;
  s = apply(
    s,
    command("MICRO_GROUP_LINK", {
      preparation_id: b,
      group_reference: "MIXTA29",
      reason: "Ensayo",
      expected_revision: s.revision,
    }),
    f.options,
  ).state;
  const hist = JSON.stringify([s.microConfirmations, s.microIssues, s.microLedgers]);
  s = apply(s, create(s), f.options).state;
  const line = s.productionJourneyLines[0];
  const snapshot = JSON.stringify(line);
  s = apply(s, link(s, line.id, a, "10"), f.options).state;
  assert.equal(journeySummary(s, s.productionJourneys[0]).status, "PARTIAL");
  s = apply(s, link(s, line.id, b, "10"), f.options).state;
  const summary = journeySummary(s, s.productionJourneys[0]);
  assert.equal(summary.lines[0].status, "READY");
  assert.equal(summary.status, "PARTIAL");
  assert.equal(new Set(summary.lines[0].links.map((l) => l.formula_id)).size, 2);
  assert.ok(summary.lines[0].links.every((l) => l.group_reference === "MIXTA29"));
  assert.equal(JSON.stringify([s.microConfirmations, s.microIssues, s.microLedgers]), hist);
  assert.equal(JSON.stringify(s.productionJourneyLines[0]), snapshot);
  assert.throws(() => apply(s, link(s, line.id, a, "1"), f.options));
});
test("NQP29 preparación compartida 4+6, costo racional sin duplicar, rechazo de excesos", () => {
  const f = journeyFixture();
  let { s, id } = confirmed(f.s, f.options, "VERDE_AMARILLO");
  s = apply(s, create(s), f.options).state;
  const [rose, green, yellow] = s.productionJourneyLines;
  assert.throws(() => apply(s, link(s, rose.id, id, "1"), f.options), /Familia/);
  s = apply(s, link(s, green.id, id, "4"), f.options).state;
  assert.throws(() => apply(s, link(s, yellow.id, id, "6.01"), f.options));
  s = apply(s, link(s, yellow.id, id, "6"), f.options).state;
  const lines = journeySummary(s, s.productionJourneys[0]).lines;
  const a = lines[1].links[0].cost_cents,
    b = lines[2].links[0].cost_cents,
    total = s.microConfirmations[0].total_cost_cents;
  assert.equal(
    (BigInt(a.n) * BigInt(b.d) + BigInt(b.n) * BigInt(a.d)) * BigInt(total.d),
    BigInt(total.n) * BigInt(a.d) * BigInt(b.d),
  );
  s = apply(s, create(s), f.options).state;
  assert.throws(
    () => apply(s, link(s, s.productionJourneyLines.at(-1).id, id, "1"), f.options),
    /disponibles/,
  );
});
test("NQP29 SQLite replay, colisión actor/payload, rollback tardío y concurrencia dos conexiones", async (t) => {
  const f = await database(t);
  const c = create(f.s);
  const out = await f.store.runCommand(c, identity);
  assert.equal((await f.store.runCommand(c, identity)).result, out.result);
  await assert.rejects(f.store.runCommand({ ...c, payload: { ...c.payload, notes: "otro" } }, identity));
  const other = openSqliteDatabase(f.file);
  t.after(() => other.close());
  const stale = await f.store.loadState();
  const first = apply(stale, create(stale), f.options).state,
    second = apply(stale, create(stale), f.options).state;
  await f.store.persistState(stale, first);
  await assert.rejects(createStore(() => other, f.options).persistState(stale, second));
  const before = await f.store.loadState();
  const next = apply(before, create(before), f.options).state;
  const statements = writePlan(before, next);
  statements.splice(statements.length - 1, 0, { sql: "INSERT INTO absent_table VALUES (?)", args: ["fail"] });
  await assert.rejects(f.db.batch(statements.map((q) => f.db.prepare(q.sql).bind(...q.args))));
  assert.deepEqual(await f.store.loadState(), before);
  const sql = new DatabaseSync(f.file);
  t.after(() => sql.close());
  assert.throws(() => sql.prepare("DELETE FROM production_journeys WHERE id=?").run(out.result), /Immutable/);
  assert.throws(() => sql.prepare("UPDATE production_journey_lines SET data=data").run(), /Immutable/);
  assert.equal(inspectDatabase(f.file).version, 10);
});
test("NQP29 SQL adversarial: atribución excesiva, identidad falsa y FK", async (t) => {
  const f = journeyFixture();
  const finished = confirmed(f.s, f.options, "VERDE_AMARILLO");
  f.s = finished.s;
  f.s = apply(f.s, create(f.s), f.options).state;
  const dbf = await database(t, f);
  const line = f.s.productionJourneyLines[1];
  await dbf.store.runCommand(link(f.s, line.id, finished.id, "4"), identity);
  const sql = new DatabaseSync(dbf.file);
  t.after(() => sql.close());
  sql.exec("PRAGMA foreign_keys=ON");
  const current = await dbf.store.loadState();
  const old = current.productionJourneyLinks[0];
  const insert = sql.prepare(
    "INSERT INTO production_journey_links(id,data,line_id,preparation_id,confirmation_id,nuclei_hundredths,request_id) VALUES (?,?,?,?,?,?,?)",
  );
  for (const modify of [
    (v) => {
      v.line_id = current.productionJourneyLines[2].id;
      v.nuclei_hundredths = 601;
    },
    (v) => (v.confirmation_id = "missing"),
    (v) => (v.preparation_id = "missing"),
  ]) {
    const v = { ...old, id: crypto.randomUUID(), request_id: crypto.randomUUID() };
    modify(v);
    assert.throws(() =>
      insert.run(
        v.id,
        JSON.stringify(v),
        v.line_id,
        v.preparation_id,
        v.confirmation_id,
        v.nuclei_hundredths,
        v.request_id,
      ),
    );
  }
  assert.throws(() =>
    insert.run("fake", JSON.stringify(old), old.line_id, old.preparation_id, old.confirmation_id, 1, "fake"),
  );
  assert.equal(sql.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(), []);
});
test("NQP29 upgrade0008, backup/restore y hashes históricos", async (t) => {
  const dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp29-upgrade-")), "private"));
  const file = join(dir, "prior.sqlite"),
    catalog = migrationCatalog();
  const prior = {
    ...catalog,
    migrations: catalog.migrations.slice(0, 9),
    schemas: catalog.schemas.slice(0, 10),
  };
  initializeDatabase(file, { catalog: prior });
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const f = journeyFixture();
  await createStore(() => db, f.options).persistState(null, f.s);
  const before = inspectDatabase(file, { catalog: prior });
  await backupDatabase(file, join(dir, "before.sqlite"), { catalog: prior });
  migrateDatabase(file);
  const after = inspectDatabase(file);
  for (const table of before.tables.filter((r) => r.name !== "nutrequine_migrations"))
    assert.deepEqual(
      after.tables.find((r) => r.name === table.name),
      table,
    );
  await createStore(() => db, f.options).runCommand(create(f.s), identity);
  await backupDatabase(file, join(dir, "after.sqlite"));
  await restoreDatabase(join(dir, "after.sqlite"), join(dir, "restored.sqlite"));
  assert.deepEqual(inspectDatabase(join(dir, "restored.sqlite")).tables, inspectDatabase(file).tables);
});
test("NQP29 HTTP real: sesión, CSRF,422, replay tras respuesta perdida,409,OPERATOR/VIEWER", async (t) => {
  const f = await database(t);
  const auth = join(f.dir, "auth.sqlite"),
    password = crypto.randomUUID() + "Aa!";
  await provisionAuthentication(f.file, auth, "link", {
    login: "journey.admin",
    user_id: actor.id,
    password,
  });
  const app = await createLocalServer({
    database: f.file,
    auth_database: auth,
    port: 0,
    micro_preparation_policies: f.options.microPreparationPolicies,
  });
  t.after(() => app.close());
  const url = await app.start();
  const r = await fetch(url + "/api/auth/login", {
    method: "POST",
    headers: { origin: url, "content-type": "application/json" },
    body: JSON.stringify({ login: "journey.admin", password }),
  });
  let cookie = r.headers.get("set-cookie").split(";")[0],
    csrf = (await r.json()).csrf_token;
  const loginAgain = async () => {
    const r = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "journey.admin", password }),
    });
    cookie = r.headers.get("set-cookie").split(";")[0];
    csrf = (await r.json()).csrf_token;
  };
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
  const c = create(f.s);
  assert.equal((await send(c, csrf, false)).status, 401);
  assert.equal((await send(c, "bad")).status, 403);
  assert.equal((await send({ ...c, payload: { ...c.payload, lines: [] } })).status, 422);
  assert.equal((await send(c)).status, 200); // deliberately discard first response
  const replay = await send(c);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).state.productionJourneys.length, 1);
  assert.equal((await send({ ...c, payload: { ...c.payload, notes: "collision" } })).status, 409);
  const state = await f.store.loadState();
  const operator = structuredClone(state);
  operator.users[0].role = "OPERATOR";
  await f.store.persistState(state, operator);
  await loginAgain();
  assert.equal((await send(create(operator))).status, 200);
  const latest = await f.store.loadState(),
    viewer = structuredClone(latest);
  viewer.users[0].role = "VIEWER";
  await f.store.persistState(latest, viewer);
  await loginAgain();
  assert.equal((await send(create(viewer))).status, 403);
  assert.equal((await fetch(url + "/api/state", { headers: { cookie } })).status, 200);
});

test("NQP29 regresiones: decimal, null y top-up append-only de la misma preparación", () => {
  const f = journeyFixture();
  const decimal = apply(f.s, create(f.s, ["0.01"]), f.options).state;
  assert.equal(decimal.productionJourneyLines[0].planned_weight_grams, 10000);
  const invalid = create(f.s);
  invalid.payload.lines = [null];
  assert.throws(() => apply(f.s, invalid, f.options), /Campo/);
  let { s, id } = confirmed(f.s, f.options, "VERDE_AMARILLO");
  s = apply(s, create(s, ["1", "10"]), f.options).state;
  const line = s.productionJourneyLines[1].id;
  s = apply(s, link(s, line, id, "4"), f.options).state;
  s = apply(s, link(s, line, id, "6"), f.options).state;
  assert.equal(journeySummary(s, s.productionJourneys[0]).lines[1].status, "READY");
  assert.equal(s.productionJourneyLinks.length, 2);
});
