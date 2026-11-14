import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rectificationFixture, rectify, apply34, actor, command } from "./helpers/rectification-fixture.mjs";
import { create, link, confirmed, substitute } from "./helpers/journey-fixture.mjs";
import { plan } from "./helpers/preparation-fixture.mjs";
import { payload } from "./helpers/receipt-fixture.mjs";
import { ready, closeCommand } from "./helpers/mill-fixture.mjs";
import { start, recognize, sell } from "./helpers/commercial-cost-fixture.mjs";
import {
  correctedPreparation,
  assertRectificationIntegrity,
} from "../features/microinsumos/domain/rectifications.mjs";
import { inspectValuation, valuationHundredths } from "../features/microinsumos/domain/valuation.mjs";
import { journeySummary } from "../features/produccion/domain/journey-view.mjs";
import { millCostSummary } from "../features/produccion/domain/mill-cost.mjs";
import { saleCommercialCost } from "../features/inventario/domain/commercial-cost.mjs";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { initializeDatabase, inspectDatabase, migrateDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { provisionAuthentication } from "../server/provision.mts";
import { createLocalServer } from "../server/application.mts";
import { memoryPersistence } from "./helpers/memory-persistence.mjs";
import { executeCommand } from "../lib/domain.mjs";
const identity = { userId: actor.id, displayName: actor.name };
const current = (s) => correctedPreparation(s, s.microConfirmations[0]);
const physical = (s, i = 0) => valuationHundredths(s.microLedgers[i].ledger);
test("NQP34 importación rechaza cierre omitido incluso con auditoría reordenada y ISSUE huérfano", async () => {
  const f = ready(["1"]);
  const prep = f.s.productionJourneyLinks[0].preparation_id;
  const cmd = rectify(f.s, "9", { date: "2026-11-15" }, prep);
  const forged = executeCommand(f.s, cmd, actor, "2026-11-15T12:00:00.000Z", f.options).state;
  Object.assign(forged.audit.at(-1), { request_id: cmd.request_id, request_contract_version: 1 });
  const closed = apply34(f.s, closeCommand(f.s), f.options).state;
  forged.millClosures = closed.millClosures;
  forged.inventoryMovements = closed.inventoryMovements;
  forged.audit.push(closed.audit.at(-1));
  const memory = memoryPersistence();
  try {
    await assert.rejects(createStore(() => memory.binding, f.options).persistState(null, forged));
    forged.audit.reverse();
    await assert.rejects(createStore(() => memory.binding, f.options).persistState(null, forged));
  } finally {
    memory.close();
  }
  const g = rectificationFixture();
  let s = apply34(g.s, rectify(g.s), g.options).state;
  s = apply34(s, rectify(s, "20", { recoverable: false }), g.options).state;
  const removed = s.corrections.pop();
  s.correctionFields = s.correctionFields.filter((r) => r.correction_id !== removed.id);
  const other = memoryPersistence();
  try {
    const store = createStore(() => other.binding, g.options);
    await assert.rejects(store.persistState(null, s));
    s.audit = s.audit.filter((a) => a.entity_id !== removed.id);
    await assert.rejects(store.persistState(null, s));
  } finally {
    other.close();
  }
});
function immutable(a, b) {
  for (const table of [
    "microIssues",
    "microConfirmations",
    "microPreparations",
    "productionJourneyLines",
    "productionJourneyLinks",
    "millClosures",
    "inventoryMovements",
    "sales",
    "saleItems",
    "expenses",
    "productionCosts",
  ])
    assert.deepEqual(b[table], a[table], table);
  for (const ledger of a.microLedgers)
    assert.deepEqual(
      b.microLedgers.find((l) => l.id === ledger.id).ledger.events.slice(0, ledger.ledger.events.length),
      ledger.ledger.events,
    );
}
async function database(t, f = rectificationFixture(), old = false) {
  const dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp34-")), "private"));
  const file = join(dir, "synthetic.sqlite"),
    catalog = migrationCatalog();
  const prior = {
    ...catalog,
    migrations: catalog.migrations.slice(0, 11),
    schemas: catalog.schemas.slice(0, 12),
  };
  initializeDatabase(file, old ? { catalog: prior } : {});
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db, f.options);
  await store.persistState(null, f.s);
  return { ...f, dir, file, db, store, prior };
}
test("NQP34 confirmada20→18: devuelve dos dosis al costo exacto original sin alterar ISSUE", () => {
  const f = rectificationFixture();
  const next = apply34(f.s, rectify(f.s), f.options, f.s.users[1]).state;
  immutable(f.s, next);
  assert.equal(physical(next) - physical(f.s), 60000);
  assert.equal(physical(next, 1) - physical(f.s, 1), 200);
  assert.deepEqual(current(next).total_cost_cents, { n: "5418", d: "5" });
  assert.deepEqual(current(next).delta_cost_cents, { n: "-602", d: "5" });
  assertRectificationIntegrity(f.s, next);
  for (const row of next.microLedgers) inspectValuation(row.ledger, actor);
});
test("NQP34 abierta20→18 conserva flujo28: solo consume18, sin retorno ficticio", () => {
  const f = rectificationFixture();
  let s = structuredClone(f.s);
  s.microConfirmations = [];
  s.microIssues = [];
  s.microLedgers = [];
  s = apply34(
    s,
    command("MICRO_PREPARATION_CONFIRM", {
      preparation_id: f.id,
      nuclei: "18",
      date: "2026-11-14",
      expected_revision: s.revision,
    }),
    f.options,
  ).state;
  assert.equal(s.microIssues[0].quantity_hundredths, 540000);
  assert.equal(s.microLedgers[0].ledger.events.length, 1);
});
test("NQP34 retornos repetidos e incremento consumen solo diferencia y conservan compras posteriores", () => {
  const f = rectificationFixture();
  let s = apply34(f.s, rectify(f.s), f.options).state;
  s = apply34(s, command("MICRO_RECEIPT_SAVE", payload({ document_date: "2026-11-14" })), f.options).state;
  const afterReceipt = structuredClone(s);
  s = apply34(s, rectify(s, "20", { recoverable: false }), f.options).state;
  assert.equal(physical(s), physical(afterReceipt) - 60000);
  const increased = structuredClone(s);
  s = apply34(s, rectify(s), f.options).state;
  assert.equal(physical(s), physical(afterReceipt));
  assert.deepEqual(current(s).total_cost_cents, current(afterReceipt).total_cost_cents);
  immutable(increased, s);
  assertRectificationIntegrity(increased, s);
  assert.throws(() => apply34(s, rectify(s), f.options), /distinta/);
});
test("NQP34 0.01g, 0.5g y1g: centésimas exactas sin residuos", () => {
  for (const [n, corrected] of [
    ["0.02", "0.01"],
    ["1", "0.50"],
    ["2", "1"],
  ]) {
    const f = rectificationFixture(n),
      next = apply34(f.s, rectify(f.s, corrected), f.options).state;
    assert.equal(physical(next, 1) - physical(f.s, 1), Math.round((Number(n) - Number(corrected)) * 100));
    assertRectificationIntegrity(f.s, next);
  }
});
test("NQP34 permisos, campos, autorización, fecha y declaración física inválidos no escriben", () => {
  const f = rectificationFixture(),
    before = structuredClone(f.s);
  for (const patch of [
    { nuclei: "0" },
    { nuclei: "20.01" },
    { nuclei: "18.001" },
    { nuclei: 18 },
    { date: "2026-11-15" },
    { date: "2026-11-01" },
    { reason: "" },
    { reference: "" },
    { recoverable: false },
    { expected_revision: 0 },
    { extra: true },
  ])
    assert.throws(() => apply34(f.s, rectify(f.s, "18", patch), f.options));
  assert.throws(() => apply34(f.s, rectify(f.s), f.options, f.s.users[2]));
  assert.throws(() => apply34(f.s, rectify(f.s), {}), /autorización/);
  assert.deepEqual(f.s, before);
});
test("NQP34 incremento con stock comprometido rechaza integralmente", () => {
  const f = rectificationFixture();
  let s = apply34(f.s, rectify(f.s), f.options).state;
  const p = apply34(s, plan(s, { nuclei: "15" }), f.options);
  s = p.state;
  s = apply34(
    s,
    command("MICRO_ASSIGN", {
      preparation_id: p.result,
      reason: "Compromiso",
      expected_revision: s.revision,
    }),
    f.options,
  ).state;
  const before = structuredClone(s);
  assert.throws(() => apply34(s, rectify(s, "20", { recoverable: false }), f.options), /insuficiente/);
  assert.deepEqual(s, before);
});
test("NQP34 jornada abierta, vínculos preservados y consumo4+6 independiente", () => {
  const f = rectificationFixture();
  let s = apply34(f.s, create(f.s, ["18"]), f.options).state;
  s = apply34(s, link(s, s.productionJourneyLines[0].id, f.id, "18"), f.options).state;
  const next = apply34(s, rectify(s), f.options).state;
  immutable(s, next);
  assertRectificationIntegrity(s, next);
  assert.equal(journeySummary(next, next.productionJourneys[0]).lines[0].status, "READY");
  assert.throws(() => apply34(next, rectify(next, "17"), f.options), /comprometidos/);
  const green = confirmed(f.s, f.options, "VERDE_AMARILLO", "10");
  s = apply34(green.s, create(green.s, ["1", "4", "6"]), f.options).state;
  for (const [i, n] of [
    [1, "4"],
    [2, "6"],
  ])
    s = apply34(s, link(s, s.productionJourneyLines[i].id, green.id, n), f.options).state;
  assert.throws(() => apply34(s, rectify(s, "9", {}, green.id), f.options), /comprometidos/);
});
test("NQP34 mezcla10+10: corrección no fusiona colina/biocolina ni modifica fórmulas", () => {
  const f = rectificationFixture("10");
  let s = apply34(f.s, substitute(f.s), f.options).state;
  const other = confirmed(s, f.options, "ROSADO", "10");
  s = other.s;
  const before = structuredClone(s),
    next = apply34(s, rectify(s, "8"), f.options).state;
  assert.deepEqual(next.microFormulas, before.microFormulas);
  assert.deepEqual(next.microIssues, before.microIssues);
  assert.equal(
    next.microLedgers.find((l) => l.micro_ingredient_id === "m3").ledger.quantity_hundredths,
    before.microLedgers.find((l) => l.micro_ingredient_id === "m3").ledger.quantity_hundredths,
  );
  assertRectificationIntegrity(s, next);
});
test("NQP34 cierre con venta NQP33 reconocida conserva histórico, costo desconocido/cero y NQP31", () => {
  for (const amount of [null, "0", "1000"]) {
    const f = ready(["1"]);
    let s = start(f.s);
    s = apply34(s, closeCommand(s), f.options).state;
    if (amount !== null) s = recognize(s, amount);
    s.customers.push({ id: "cost-customer", name: "Cliente sintético", is_active: true });
    const sold = sell(s, 1, {}, actor);
    s = sold.state;
    const before = structuredClone(s),
      cost = saleCommercialCost(s, sold.result),
      mill = millCostSummary(s, s.productionJourneyLines[0].id);
    s = apply34(s, rectify(s, "8", { recoverable: false }), f.options).state;
    immutable(before, s);
    assert.deepEqual(s.microLedgers, before.microLedgers);
    assert.equal(current(s).mode, "AUDIT_ONLY");
    assert.deepEqual(saleCommercialCost(s, sold.result), cost);
    assert.deepEqual(millCostSummary(s, s.productionJourneyLines[0].id), mill);
    assert.deepEqual(
      s.corrections.filter((c) => c.entity_type === "COMMERCIAL_COST"),
      before.corrections.filter((c) => c.entity_type === "COMMERCIAL_COST"),
    );
    assertRectificationIntegrity(before, s);
    assert.throws(() => apply34(s, rectify(s, "9"), f.options), /sin devolución/);
  }
});
test("NQP34 SQLite upgrade0010, replay, CAS, rollback tardío, importación y respaldo/restauración", async (t) => {
  const f = await database(t, rectificationFixture(), true);
  const old = inspectDatabase(f.file, { catalog: f.prior });
  await backupDatabase(f.file, join(f.dir, "prior.sqlite"), { catalog: f.prior });
  migrateDatabase(f.file);
  assert.deepEqual(
    inspectDatabase(f.file).tables.filter((r) => r.name !== "nutrequine_migrations"),
    old.tables.filter((r) => r.name !== "nutrequine_migrations"),
  );
  await f.db.batch([
    f.db.prepare(
      "CREATE TRIGGER fail34 BEFORE INSERT ON audit WHEN json_extract(NEW.data,'$.action')='MICRO_PREPARATION_RECTIFY' BEGIN SELECT RAISE(ABORT,'late failure34'); END",
    ),
  ]);
  await assert.rejects(f.store.runCommand(rectify(f.s), identity), /late failure34/);
  assert.deepEqual(await f.store.loadState(), f.s);
  await f.db.batch([f.db.prepare("DROP TRIGGER fail34")]);
  const c = rectify(f.s),
    out = await f.store.runCommand(c, identity);
  assert.deepEqual(await f.store.runCommand(c, identity), out);
  await assert.rejects(f.store.runCommand({ ...c, payload: { ...c.payload, nuclei: "17" } }, identity));
  await assert.rejects(f.store.runCommand(c, { userId: "rect-op" }));
  const bad = structuredClone(out.state);
  bad.corrections.at(-1).new_snapshot.lines[0].quantity_delta_hundredths--;
  await assert.rejects(f.store.persistState(out.state, bad));
  await assert.rejects(f.store.persistState(null, bad));
  await assert.rejects(f.db.batch([f.db.prepare("DELETE FROM corrections WHERE id=?").bind(out.result)]));
  await backupDatabase(f.file, join(f.dir, "backup.sqlite"));
  await restoreDatabase(join(f.dir, "backup.sqlite"), join(f.dir, "restored.sqlite"));
  assert.deepEqual(inspectDatabase(join(f.dir, "restored.sqlite")).tables, inspectDatabase(f.file).tables);
  const db2 = openSqliteDatabase(f.file);
  t.after(() => db2.close());
  const outcomes = await Promise.allSettled([
    f.store.runCommand(rectify(out.state, "17"), identity),
    createStore(() => db2, f.options).runCommand(rectify(out.state, "16"), { userId: "rect-op" }),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  console.log("NQP34 SQLite sintética", f.dir);
});
test("NQP34 HTTP401/403/409/422, CSRF, ADMIN/OPERATOR/VIEWER y GET sin escritura", async (t) => {
  const f = await database(t),
    auth = join(f.dir, "auth.sqlite"),
    password = crypto.randomUUID() + "Aa!";
  await provisionAuthentication(f.file, auth, "link", { login: "rect.admin", user_id: actor.id, password });
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
      body: JSON.stringify({ login: "rect.admin", password }),
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
  const c = rectify(f.s);
  assert.equal((await send(c, csrf, false)).status, 401);
  assert.equal((await send(c, "bad")).status, 403);
  assert.equal((await send({ ...c, payload: { ...c.payload, nuclei: "0" } })).status, 422);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send({ ...c, payload: { ...c.payload, nuclei: "17" } })).status, 409);
  for (const role of ["OPERATOR", "VIEWER"]) {
    const before = await f.store.loadState(),
      next = structuredClone(before);
    next.users[0].role = role;
    next.revision++;
    await f.store.persistState(before, next);
    await login();
    assert.equal((await send(rectify(next, "17"))).status, role === "OPERATOR" ? 200 : 403);
    const unchanged = await f.store.loadState();
    assert.equal((await fetch(url + "/api/micro-preparations", { headers: { cookie } })).status, 200);
    assert.deepEqual(await f.store.loadState(), unchanged);
  }
});
