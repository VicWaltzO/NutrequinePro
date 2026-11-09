import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCommand, TABLES, balanceSummary } from "../lib/domain.mjs";
import { fixture, actor, identity, payload } from "./helpers/receipt-fixture.mjs";
import { initializeDatabase, migrateDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";

const command = (p = payload()) => ({ type: "MICRO_RECEIPT_SAVE", payload: p, request_id: randomUUID() });
const apply = (s, p = payload()) => executeCommand(s, command(p), actor).state;
test("operativa: multirrenglón conserva patrimonio, promedio independiente, gasto y período exactos", () => {
  const before = fixture(),
    after = apply(before);
  for (const table of TABLES.filter(
    (t) =>
      ![
        "microReceipts",
        "microReceiptLines",
        "microLedgers",
        "microValuationEvents",
        "expenses",
        "audit",
      ].includes(t),
  ))
    assert.deepEqual(after[table], before[table], table);
  assert.equal(after.expenses.length, 1);
  assert.equal(after.expenses[0].amount, 2800);
  assert.equal(after.microReceiptLines.length, 2);
  assert.equal(after.microValuationEvents.length, 2);
  const a = after.microLedgers[0].ledger,
    b = after.microLedgers[1].ledger;
  assert.equal(a.quantity_grams, 10000);
  assert.deepEqual(a.value_cents, { n: "3000", d: "1" });
  assert.equal(b.quantity_grams, 7000);
  assert.deepEqual(b.value_cents, { n: "1800", d: "1" });
  assert.equal(
    balanceSummary(after, "2026-11-01", "2026-11-30").other -
      balanceSummary(before, "2026-11-01", "2026-11-30").other,
    2800,
  );
  assert.deepEqual(
    balanceSummary(after, "2026-10-01", "2026-10-31"),
    balanceSummary(before, "2026-10-01", "2026-10-31"),
  );
  const later = apply(after, payload({ reference: "OP-002", document_date: "2026-11-02" }));
  assert.deepEqual(later.microLedgers[0].ledger.events[0], a.events[0]);
  assert.throws(
    () => executeCommand(after, { type: "MICRO_CORRECT", payload: { id: "o0", expected_version: 1 } }, actor),
    /bloqueada/,
  );
  assert.throws(
    () =>
      executeCommand(
        after,
        { type: "EXPENSE_CANCEL", payload: { id: after.expenses[0].id, reason: "Ensayo" } },
        actor,
      ),
    /protegido/,
  );
  assert.throws(
    () => apply(after, payload({ id: after.microReceipts[0].id, expected_version: 1 })),
    /inmutable/,
  );
});
test("operativa: último renglón inválido y cortes cruzados rechazan toda la factura sin mutación", () => {
  const s = fixture(),
    snapshot = structuredClone(s);
  for (const extra of [
    { document_date: "2026-10-25" },
    { document_date: "2026-10-30" },
    { currency: "USD" },
    { payment_method: "CREDIT" },
    { receive_confirmed: false },
    { reviewed_expenses: false },
    { discount: "1" },
    { total: "27" },
    { supplier: {} },
    { freight: "1" },
  ])
    assert.throws(() => apply(s, payload(extra)));
  for (const field of [
    { quantity_kg: "0" },
    { quantity_kg: "0.0001" },
    { quantity_kg: "-1" },
    { quantity_kg: "1000000001" },
    { unit_price: null },
    { amount: "7.99" },
    { discount: "9" },
    { micro_ingredient_id: "ing-1" },
  ])
    assert.throws(() =>
      apply(s, payload({ lines: [payload().lines[0], { ...payload().lines[1], ...field }] })),
    );
  const unknown = fixture();
  unknown.microOpenings[1].unit_cost_cents = null;
  assert.throws(() => apply(unknown), /sin costo/);
  assert.equal(unknown.microLedgers.length, 0);
  assert.deepEqual(s, snapshot);
  const after = apply(s);
  assert.throws(
    () => apply(after, payload({ reference: "OTHER", document_date: "2026-10-31" })),
    /último movimiento/,
  );
});
test("operativa: descuentos explícitos por línea, cero probado y flete independiente", () => {
  const p = payload({
    total: "25",
    discount: "3",
    lines: payload().lines.map((l, i) => ({ ...l, discount: String(i + 1) })),
  });
  let s = apply(fixture(), p);
  assert.equal(s.expenses[0].amount, 2500);
  assert.deepEqual(s.microLedgers[0].ledger.value_cents, { n: "2900", d: "1" });
  assert.deepEqual(s.microLedgers[1].ledger.value_cents, { n: "1600", d: "1" });
  const ledgers = structuredClone(s.microLedgers);
  s = executeCommand(
    s,
    {
      type: "EXPENSE_CREATE",
      payload: { date: "2026-11-01", category: "LOGISTICS", description: "Flete de ensayo", amount: "5" },
    },
    actor,
  ).state;
  assert.deepEqual(s.microLedgers, ledgers);
  assert.equal(balanceSummary(s).logistics, 500);
  const zero = fixture();
  zero.microOpenings[0].unit_cost_cents = 0;
  const z = apply(
    zero,
    payload({ total: "0", lines: payload().lines.map((l) => ({ ...l, unit_price: "0", amount: "0" })) }),
  );
  assert.equal(z.expenses[0].amount, 0);
  assert.deepEqual(z.microLedgers[0].ledger.value_cents, { n: "0", d: "1" });
});
test("operativa: borrador sin efectos, confirmación versionada y permisos", () => {
  let s = apply(fixture(), payload({ status: "DRAFT" }));
  assert.equal(s.expenses.length, 0);
  assert.equal(s.microLedgers.length, 0);
  const id = s.microReceipts[0].id;
  assert.throws(() => apply(s, payload({ id, expected_version: 0 })), /obsoleta/);
  s = apply(s, payload({ id, expected_version: 1 }));
  assert.equal(s.microReceipts.length, 1);
  assert.equal(s.microReceiptLines.filter((l) => l.is_current).length, 2);
  assert.equal(s.expenses.length, 1);
  for (const role of ["OPERATOR", "VIEWER"])
    assert.throws(() => executeCommand(fixture(), command(), { ...actor, role }));
});
test("operativa: 17 y más de 17 artículos independientes sin ID14", () => {
  for (const count of [17, 25, 100]) {
    const s = fixture();
    s.microIngredients = [];
    s.microOpenings = [];
    for (let i = 0; i < count; i++) {
      s.microIngredients.push({
        id: `s${i}`,
        name: `Sintético ${i}`,
        operational_id: i < 13 ? i + 1 : i + 2,
        is_active: true,
      });
      s.microOpenings.push({
        id: `o${i}`,
        micro_ingredient_id: `s${i}`,
        version: 1,
        quantity_grams: 0,
        unit_cost_cents: null,
        cutoff_date: "2026-10-30",
      });
    }
    const lines = s.microIngredients.map((m) => ({
      micro_ingredient_id: m.id,
      quantity_kg: "0.001",
      unit_price: "10",
      amount: "0.01",
      discount: "0",
    }));
    const after = apply(s, payload({ total: (count / 100).toFixed(2), lines }));
    assert.equal(after.microLedgers.length, count);
    assert.equal(after.expenses.length, 1);
  }
});

test("operativa SQLite: migración0002, CAS dos conexiones, rollback tardío, replay, backup y restore", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp22-db-")), "private"));
  const file = join(root, "synthetic.sqlite"),
    catalog = migrationCatalog();
  const old = {
    ...catalog,
    migrations: catalog.migrations.slice(0, 3),
    schemas: catalog.schemas.slice(0, 4),
  };
  initializeDatabase(file, { catalog: old });
  let c = openSqliteDatabase(file);
  const initial = fixture();
  await c.batch(
    writePlan(null, initial)
      .filter((r) => !/micro_receipt|micro_ledger|micro_valuation/.test(r.sql))
      .map((r) => c.prepare(r.sql).bind(...r.args)),
  );
  c.close();
  const prior = inspectDatabase(file, { catalog: old });
  const prebackup = join(root, "before.sqlite");
  await backupDatabase(file, prebackup, { catalog: old });
  migrateDatabase(file);
  const migrated = inspectDatabase(file);
  for (const table of prior.tables.filter((r) => r.name !== "nutrequine_migrations"))
    assert.deepEqual(
      migrated.tables.find((r) => r.name === table.name),
      table,
    );
  c = openSqliteDatabase(file);
  const c2 = openSqliteDatabase(file);
  t.after(() => {
    c.close();
    c2.close();
  });
  const a = createStore(() => c),
    b = createStore(() => c2),
    cmd = command();
  await a.runCommand(cmd, identity);
  const after = await a.loadState();
  await b.runCommand(cmd, identity);
  assert.deepEqual(await b.loadState(), after);
  await assert.rejects(b.runCommand({ ...cmd, payload: payload({ total: "29" }) }, identity));
  const race = await Promise.allSettled(
    [a, b].map((st) =>
      st.runCommand(command(payload({ reference: "RACE", document_date: "2026-11-02" })), identity),
    ),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const before = await a.loadState(),
    next = apply(before, payload({ reference: "ROLLBACK", document_date: "2026-11-03" }));
  next.microValuationEvents.at(-1).receipt_line_id = "invalid-fk";
  await assert.rejects(a.persistState(before, next));
  assert.deepEqual(await a.loadState(), before);
  const backup = join(root, "after.sqlite"),
    restored = join(root, "restored.sqlite");
  await backupDatabase(file, backup);
  await restoreDatabase(backup, restored);
  const restoredConnection = openSqliteDatabase(restored);
  try {
    assert.deepEqual(await createStore(() => restoredConnection).loadState(), before);
  } finally {
    restoredConnection.close();
  }
  const oldRestore = join(root, "old.sqlite");
  await restoreDatabase(prebackup, oldRestore, { catalog: old });
  assert.deepEqual(inspectDatabase(oldRestore, { catalog: old }).tables, prior.tables);
  console.log("NQP26-22 SQLite evidence", root, "integrity/FK/recovery PASS");
});

test("operativa HTTP real: autenticación, CSRF, roles, 422 sin mutación y único gasto", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp26-21-http-")), "private"));
  const database = join(root, "synthetic.sqlite"),
    auth_database = join(root, "auth.sqlite");
  initializeDatabase(database);
  const c = openSqliteDatabase(database);
  await createStore(() => c).persistState(null, fixture());
  c.close();
  const password = randomUUID() + "Aa!";
  await provisionAuthentication(database, auth_database, "link", {
    user_id: actor.id,
    login: "receipt.admin",
    password,
  });
  const app = await createLocalServer({ database, auth_database, port: 0 });
  t.after(() => app.close());
  const url = await app.start();
  const login = async () => {
    const response = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "receipt.admin", password }),
    });
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get("set-cookie").split(";")[0],
      csrf: (await response.json()).csrf_token,
    };
  };
  let session = await login();
  const send = (type, data, csrf = session.csrf) =>
    fetch(url + "/api/command", {
      method: "POST",
      headers: {
        origin: url,
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": csrf,
      },
      body: JSON.stringify({ type, payload: data, request_id: randomUUID() }),
    });
  const state = async () =>
    await (await fetch(url + "/api/state", { headers: { cookie: session.cookie } })).json();
  assert.equal(
    (
      await fetch(url + "/api/command", {
        method: "POST",
        headers: { origin: url, "content-type": "application/json" },
        body: JSON.stringify({ type: "MICRO_RECEIPT_SAVE", payload: payload(), request_id: randomUUID() }),
      })
    ).status,
    401,
  );
  const before = await state();
  assert.equal((await send("MICRO_RECEIPT_SAVE", payload(), "wrong-token")).status, 403);
  assert.equal((await send("MICRO_RECEIPT_SAVE", payload({ document_date: "2026-10-30" }))).status, 422);
  assert.deepEqual(await state(), before);
  assert.equal((await send("MICRO_RECEIPT_SAVE", payload())).status, 200);
  const after = await state();
  assert.equal((await send("MICRO_RECEIPT_SAVE", payload())).status, 422);
  assert.deepEqual(await state(), after);
  assert.equal(
    (await send("USER_SAVE", { id: "other-admin", name: "Admin ensayo", role: "ADMIN", is_active: true }))
      .status,
    200,
  );
  for (const role of ["OPERATOR", "VIEWER"]) {
    // Administrative fixture changes model a role granted outside this request; HTTP enforces it at use time.
    const conn = openSqliteDatabase(database);
    const st = createStore(() => conn);
    const old = await st.loadState();
    const next = structuredClone(old);
    next.users.find((u) => u.id === actor.id).role = role;
    next.revision++;
    await st.persistState(old, next);
    conn.close();
    session = await login();
    assert.equal((await fetch(url + "/api/state", { headers: { cookie: session.cookie } })).status, 200);
    const deniedBefore = await state();
    for (const type of ["MICRO_RECEIPT_SAVE", "MICRO_RECEIPT_SAVE"])
      assert.equal((await send(type, payload())).status, 403);
    assert.deepEqual(await state(), deniedBefore);
  }
});

test("operativa: identidad documental global en ambos sentidos sin convertir histórico en recepción", () => {
  const historical = {
    status: "CONFIRMED",
    document_kind: "DOCUMENT",
    supplier: "Proveedor ficticio",
    reference: "OP-001",
    source: "Documento de ensayo",
    document_date: "2026-10-10",
    total: "50",
    payment_method: "CASH",
    reviewed_expenses: true,
    lines: [{ micro_ingredient_id: "m1", quantity_kg: "25", unit_price: "2" }],
  };
  const old = executeCommand(fixture(), { type: "MICRO_PURCHASE_SAVE", payload: historical }, actor).state;
  assert.throws(() => apply(old), /Comprobante ya/);
  assert.equal(old.microLedgers.length, 0);
  assert.equal(old.microOpenings[0].quantity_grams, 5000);
  const current = apply(fixture());
  assert.throws(
    () =>
      executeCommand(
        current,
        {
          type: "MICRO_PURCHASE_SAVE",
          payload: { ...historical, supplier: " PROVEEDOR FICTICIO ", reference: "op-001" },
        },
        actor,
      ),
    /operativa/,
  );
  assert.throws(() =>
    executeCommand(
      current,
      {
        type: "MICRO_PURCHASE_SAVE",
        payload: {
          ...historical,
          reference: "OTHER",
          document_date: "2026-11-01",
          total: "28",
          existing_expense_id: current.expenses[0].id,
        },
      },
      actor,
    ),
  );
});

test("operativa SQLite: dos procesos desde misma revisión aceptan una sola factura", async (t) => {
  const { fork } = await import("node:child_process"),
    { once } = await import("node:events");
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp22-process-")), "private")),
    file = join(root, "synthetic.sqlite");
  initializeDatabase(file);
  const c = openSqliteDatabase(file),
    store = createStore(() => c);
  t.after(() => c.close());
  await store.persistState(null, fixture());
  const children = [0, 1].map(() =>
    fork(new URL("./helpers/receipt-process.mjs", import.meta.url), [file], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    }),
  );
  t.after(() =>
    children.forEach((child) => {
      if (child.exitCode === null) child.kill();
    }),
  );
  await Promise.all(children.map((child) => once(child, "message", { signal: AbortSignal.timeout(60000) })));
  const responses = children.map((child) => once(child, "message", { signal: AbortSignal.timeout(60000) }));
  children.forEach((child, i) => child.send(command(payload({ reference: `PROC-${i}` }))));
  const results = (await Promise.all(responses)).map(([r]) => r);
  assert.equal(results.filter((r) => r.saved).length, 1);
  const s = await store.loadState();
  assert.equal(s.microReceipts.length, 1);
  assert.equal(s.expenses.length, 1);
  assert.equal(s.microValuationEvents.length, 2);
  assert.equal(s.microLedgers[0].ledger.quantity_grams, 10000);
  console.log("NQP26-22 multiprocess CAS", root, results);
});
