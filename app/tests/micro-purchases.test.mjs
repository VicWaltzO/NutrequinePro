import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedState, executeCommand, TABLES, balanceSummary, stock } from "../lib/domain.mjs";
import { initializeDatabase, migrateDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";

const actor = { id: "history-admin", name: "Administrador sintético", role: "ADMIN", is_active: true };
const identity = { userId: actor.id, displayName: actor.name };
function fixture() {
  const s = seedState();
  s.users = [actor];
  s.microIngredients = [1, 2].map((id) => ({
    id: `m${id}`,
    name: `Micro ficticio ${id}`,
    operational_id: id,
    is_active: true,
    unit: "KG",
    known_price_per_kg: null,
  }));
  s.microOpenings = s.microIngredients.map((m, i) => ({
    id: `o${i}`,
    micro_ingredient_id: m.id,
    quantity_grams: 5000,
    cutoff_date: i ? "2026-10-20" : "2026-10-30",
    unit_cost_cents: 200,
    valuation_cents: 1000,
    version: 1,
  }));
  s.inventoryMovements.push({
    id: "finished-stock",
    item_type: "PRODUCT",
    item_id: "prod-1",
    quantity: 3,
    weight_kg: 75000,
  });
  return s;
}
const payload = (extra = {}) => ({
  status: "CONFIRMED",
  document_kind: "DOCUMENT",
  supplier: "Proveedor ficticio",
  reference: "F-001",
  source: "Comprobante de ensayo",
  document_date: "2026-10-10",
  total: "50.00",
  payment_method: "CASH",
  reviewed_expenses: true,
  lines: [{ micro_ingredient_id: "m1", quantity_kg: "25", unit_price: "2.00" }],
  ...extra,
});
const apply = (s, p, type = "MICRO_PURCHASE_SAVE") =>
  executeCommand(s, { type, payload: p, request_id: randomUUID() }, actor).state;
const unchangedTables = TABLES.filter(
  (t) =>
    ![
      "microPurchases",
      "microPurchaseLines",
      "expenses",
      "audit",
      "corrections",
      "correctionFields",
    ].includes(t),
);

test("histórico: 25kg documentales conservan 5kg y todo histórico; gasto exacto en su período", () => {
  const before = fixture();
  const after = apply(before, payload());
  for (const table of unchangedTables) assert.deepEqual(after[table], before[table], table);
  assert.equal(after.microOpenings[0].quantity_grams, 5000);
  assert.deepEqual(stock(after, "prod-1"), stock(before, "prod-1"));
  assert.equal(after.expenses.length, 1);
  assert.equal(after.expenses[0].production_cost_id, null);
  assert.equal(
    balanceSummary(after, "2026-10-01", "2026-10-31").other -
      balanceSummary(before, "2026-10-01", "2026-10-31").other,
    5000,
  );
  assert.deepEqual(
    balanceSummary(after, "2026-11-01", "2026-11-30"),
    balanceSummary(before, "2026-11-01", "2026-11-30"),
  );
});

test("histórico: dos renglones, descuentos y total sin desglose crean un solo gasto", () => {
  const s = fixture();
  const after = apply(
    s,
    payload({
      total: "59.99",
      discount: "0.01",
      lines: [
        { micro_ingredient_id: "m1", quantity_kg: "25", unit_price: "2" },
        { micro_ingredient_id: "m2", quantity_kg: "1", amount: "10" },
      ],
    }),
  );
  assert.equal(after.expenses.length, 1);
  assert.equal(after.expenses[0].amount, 5999);
  assert.equal(after.microPurchaseLines.length, 2);
  assert.equal(
    apply(s, payload({ lines: [{ micro_ingredient_id: "m1", quantity_kg: "25" }] })).expenses[0].amount,
    5000,
  );
  assert.throws(() =>
    apply(
      s,
      payload({
        lines: [
          { micro_ingredient_id: "m1", quantity_kg: "25", amount: "60" },
          { micro_ingredient_id: "m2", quantity_kg: "1" },
        ],
      }),
    ),
  );
});

test("histórico: gasto preexistente se vincula sin recontar ni mutar; candidatos y doble vínculo bloqueados", () => {
  let s = fixture();
  s.expenses.push({
    id: "old",
    date: "2026-10-10",
    amount: 5000,
    category: "OTHER",
    description: "Factura sintética comprobada",
    status: "CONFIRMED",
  });
  const original = structuredClone(s.expenses);
  assert.throws(() => apply(s, payload()));
  s = apply(s, payload({ existing_expense_id: "old" }));
  assert.deepEqual(s.expenses, original);
  assert.equal(s.microPurchases[0].owns_expense, false);
  assert.throws(() => apply(s, payload({ reference: "F-002", existing_expense_id: "old" })));
  assert.throws(() => apply(s, { id: "old", reason: "Ensayo" }, "EXPENSE_CANCEL"));
  const row = s.microPurchases[0];
  s = apply(
    s,
    { id: row.id, expected_version: 1, reason: "Anular vínculo documental" },
    "MICRO_PURCHASE_CANCEL",
  );
  assert.deepEqual(s.expenses, original);
});

test("histórico: borrador sin valores inventados, confirmación, corrección y anulación versionadas", () => {
  const before = fixture();
  let s = apply(
    before,
    payload({ status: "DRAFT", supplier: "", source: "", document_date: "", total: "", lines: [] }),
  );
  assert.equal(s.expenses.length, 0);
  assert.equal(s.microPurchases[0].total_cents, null);
  assert.equal(s.microPurchases[0].supplier, null);
  const id = s.microPurchases[0].id;
  s = apply(s, payload({ id, expected_version: 1, reason: "Completado con comprobante" }));
  const expenseId = s.microPurchases[0].expense_id;
  s = apply(
    s,
    payload({
      id,
      expected_version: 2,
      reason: "Descuento comprobado",
      existing_expense_id: expenseId,
      total: "49",
      discount: "1",
    }),
  );
  assert.equal(s.expenses[0].amount, 4900);
  assert.equal(s.microPurchases[0].version, 3);
  assert.throws(() => apply(s, payload({ id, expected_version: 2, reason: "Obsoleta" })));
  s = apply(s, { id, expected_version: 3, reason: "Anulación sintética" }, "MICRO_PURCHASE_CANCEL");
  assert.equal(s.expenses[0].status, "CANCELLED");
  assert.equal(balanceSummary(s).other, 0);
  assert.throws(() => apply(s, payload()));
  for (const table of unchangedTables) assert.deepEqual(s[table], before[table], table);
});

test("histórico: validación estricta de fechas/cortes, identidades, datos, roles y duplicados", () => {
  const s = fixture();
  for (const extra of [
    { document_date: "2026-10-31" },
    { document_date: "2026-02-30" },
    { document_date: [] },
    {
      document_date: "2026-10-25",
      lines: [
        { micro_ingredient_id: "m1", quantity_kg: "1" },
        { micro_ingredient_id: "m2", quantity_kg: "1" },
      ],
    },
    { payment_method: "CREDIT" },
    { total: 50 },
    { total: "0" },
    { reviewed_expenses: false },
    { supplier: {} },
    { lines: [{ micro_ingredient_id: "ing-1", quantity_kg: "25" }] },
    { lines: [{ micro_ingredient_id: "m1", quantity_kg: "0.0001" }] },
    { lines: [{ micro_ingredient_id: "m1", quantity_kg: "25", unit_price: "2", amount: "49" }] },
    { lines: [{ micro_ingredient_id: "m1", quantity_kg: [] }] },
    { inventory: true },
  ])
    assert.throws(() => apply(s, payload(extra)), JSON.stringify(extra));
  assert.equal(apply(s, payload({ document_date: "2026-10-30" })).expenses.length, 1);
  const confirmed = apply(s, payload());
  assert.throws(() => apply(confirmed, payload({ supplier: " PROVEEDOR FICTICIO ", reference: "f-001" })));
  for (const role of ["OPERATOR", "VIEWER"])
    for (const type of ["MICRO_PURCHASE_SAVE", "MICRO_PURCHASE_CANCEL"])
      assert.throws(() => executeCommand(s, { type, payload: payload() }, { ...actor, role }));
  assert.throws(() =>
    apply(
      confirmed,
      {
        id: "o0",
        expected_version: 1,
        quantity_kg: "5",
        cutoff_date: "2026-10-01",
        measurement: "REAL",
        source: "Recuento",
        reason: "Ensayo",
      },
      "MICRO_CORRECT",
    ),
  );
});

test("histórico SQLite: upgrade 0001, atomicidad de gasto/cabecera/líneas, replay, carreras, respaldo y restauración", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp26-21-sqlite-")), "private"));
  const filename = join(root, "synthetic.sqlite");
  const catalog = migrationCatalog();
  const oldCatalog = {
    ...catalog,
    migrations: catalog.migrations.slice(0, 2),
    schemas: catalog.schemas.slice(0, 3),
  };
  initializeDatabase(filename, { catalog: oldCatalog });
  let connection = openSqliteDatabase(filename);
  const initial = fixture();
  const legacy = structuredClone(initial);
  delete legacy.microPurchases;
  delete legacy.microPurchaseLines;
  // An old writer does not query the two future tables.
  const { writePlan } = await import("../lib/persistence.mjs");
  const statements = writePlan(null, initial).filter((row) => !/micro_purchase/.test(row.sql));
  await connection.batch(statements.map((row) => connection.prepare(row.sql).bind(...row.args)));
  connection.close();
  const prior = inspectDatabase(filename, { catalog: oldCatalog });
  const backup = join(root, "before.sqlite");
  await backupDatabase(filename, backup, { catalog: oldCatalog });
  migrateDatabase(filename);
  const upgraded = inspectDatabase(filename);
  for (const table of prior.tables.filter((x) => x.name !== "nutrequine_migrations"))
    assert.deepEqual(
      upgraded.tables.find((x) => x.name === table.name),
      table,
    );
  connection = openSqliteDatabase(filename);
  const second = openSqliteDatabase(filename);
  t.after(() => {
    connection.close();
    second.close();
  });
  const store = createStore(() => connection),
    other = createStore(() => second);
  const command = { type: "MICRO_PURCHASE_SAVE", payload: payload(), request_id: randomUUID() };
  await store.runCommand(command, identity);
  const after = await store.loadState();
  assert.equal(after.microOpenings[0].quantity_grams, 5000);
  await other.runCommand(command, identity);
  assert.deepEqual(await other.loadState(), after);
  await assert.rejects(other.runCommand({ ...command, payload: payload({ total: "51" }) }, identity));
  await assert.rejects(other.runCommand({ ...command, request_id: randomUUID() }, identity));
  const racePayload = payload({ reference: "F-RACE", document_date: "2026-10-11" });
  const race = await Promise.allSettled(
    [store, other].map((st) =>
      st.runCommand({ type: command.type, payload: racePayload, request_id: randomUUID() }, identity),
    ),
  );
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  const beforeFailure = await store.loadState();
  const bad = executeCommand(
    beforeFailure,
    { type: command.type, payload: payload({ reference: "F-ROLLBACK", document_date: "2026-10-12" }) },
    actor,
  ).state;
  bad.microPurchaseLines.at(-1).micro_ingredient_id = "invalid-fk";
  await assert.rejects(store.persistState(beforeFailure, bad));
  assert.deepEqual(await store.loadState(), beforeFailure);
  const finalBackup = join(root, "after.sqlite"),
    restored = join(root, "restored.sqlite");
  await backupDatabase(filename, finalBackup);
  await restoreDatabase(finalBackup, restored);
  const c = openSqliteDatabase(restored);
  try {
    assert.deepEqual(await createStore(() => c).loadState(), beforeFailure);
  } finally {
    c.close();
  }
  const restoredOld = join(root, "restored-0001.sqlite");
  await restoreDatabase(backup, restoredOld, { catalog: oldCatalog });
  assert.deepEqual(inspectDatabase(restoredOld, { catalog: oldCatalog }).tables, prior.tables);
});

test("histórico HTTP real: autenticación, CSRF, roles, 422 sin mutación y único gasto", async (t) => {
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
    login: "history.admin",
    password,
  });
  const app = await createLocalServer({ database, auth_database, port: 0 });
  t.after(() => app.close());
  const url = await app.start();
  const login = async () => {
    const response = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "history.admin", password }),
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
        body: JSON.stringify({ type: "MICRO_PURCHASE_SAVE", payload: payload(), request_id: randomUUID() }),
      })
    ).status,
    401,
  );
  const before = await state();
  assert.equal((await send("MICRO_PURCHASE_SAVE", payload(), "wrong-token")).status, 403);
  assert.equal((await send("MICRO_PURCHASE_SAVE", payload({ document_date: "2026-10-31" }))).status, 422);
  assert.deepEqual(await state(), before);
  assert.equal((await send("MICRO_PURCHASE_SAVE", payload())).status, 200);
  const after = await state();
  assert.equal((await send("MICRO_PURCHASE_SAVE", payload())).status, 422);
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
    for (const type of ["MICRO_PURCHASE_SAVE", "MICRO_PURCHASE_CANCEL"])
      assert.equal((await send(type, payload())).status, 403);
    assert.deepEqual(await state(), deniedBefore);
  }
});
