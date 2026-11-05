import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  createValuation,
  applyValuation,
  inspectValuation,
  assertValuationOpening,
} from "../features/microinsumos/domain/valuation.mjs";
import { seedState, executeCommand, TABLES, balanceSummary, stock } from "../lib/domain.mjs";
import { initializeDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { latestValuation, valuationSnapshot, saveSyntheticValuation } from "./helpers/valuation-sqlite.mjs";

const actor = { id: "valuation-admin", name: "Admin sintético", role: "ADMIN", is_active: true };
const opening = (extra = {}) => ({
  id: "o1",
  micro_ingredient_id: "m1",
  version: 1,
  quantity_grams: 5000,
  unit_cost_cents: 200,
  cutoff_date: "2026-10-30",
  ...extra,
});
const event = (ledger, type, grams, cents = 2000, extra = {}) => ({
  id: `e${ledger.revision}`,
  request_id: `request${ledger.revision}`,
  micro_ingredient_id: "m1",
  type,
  date: "2026-11-01",
  quantity_grams: grams,
  expected_revision: ledger.revision,
  ...(type === "RECEIPT" ? { total_cost_cents: cents } : {}),
  ...extra,
});
const apply = (ledger, type, grams, cents, extra) =>
  applyValuation(ledger, event(ledger, type, grams, cents, extra), actor);
const inspect = (ledger) => inspectValuation(ledger, actor);
const fraction = (n, d = "1") => ({ n, d });

test("valoración: promedio ponderado 5kg@2 + 5kg@4, salida y snapshots históricos", () => {
  let ledger = createValuation(opening(), actor);
  ledger = apply(ledger, "RECEIPT", 5000, 2000);
  assert.deepEqual(inspect(ledger).average_cents_per_kg, fraction("300"));
  ledger = apply(ledger, "ISSUE", 2000);
  assert.equal(ledger.quantity_grams, 8000);
  assert.deepEqual(ledger.value_cents, fraction("2400"));
  assert.equal(ledger.events[1].snapshot.posted_cost_cents, "600");
  const historic = JSON.stringify(ledger.events);
  ledger = apply(ledger, "RECEIPT", 2000, 1000);
  assert.deepEqual(inspect(ledger).average_cents_per_kg, fraction("340"));
  assert.equal(JSON.stringify(ledger.events.slice(0, 2)), historic);
  const unequal = apply(createValuation(opening(), actor), "RECEIPT", 1000, 400);
  assert.deepEqual(inspect(unequal).average_cents_per_kg, fraction("700", "3"));
});

test("valoración: 0.05kg + 0.10kg y salidas de un gramo conservan fracciones y céntimos", () => {
  let ledger = apply(
    createValuation(opening({ quantity_grams: 50, unit_cost_cents: 1 }), actor),
    "RECEIPT",
    100,
    1,
  );
  const snapshots = [];
  for (let i = 0; i < 150; i++) {
    ledger = apply(ledger, "ISSUE", 1);
    snapshots.push(ledger.events.at(-1).snapshot.posted_cost_cents);
    assert.ok(BigInt(ledger.value_cents.n) >= 0);
  }
  assert.equal(ledger.quantity_grams, 0);
  assert.deepEqual(ledger.value_cents, fraction("0"));
  assert.deepEqual(ledger.issued_exact_cents, fraction("21", "20"));
  assert.equal(
    snapshots.reduce((n, s) => n + BigInt(s), BigInt(0)),
    BigInt(1),
  );
  assert.deepEqual(ledger.rounding_carry_cents, fraction("1", "20"));
  assert.ok(snapshots.includes("0"));
  ledger = apply(ledger, "RECEIPT", 1, 1);
  ledger = apply(ledger, "ISSUE", 1);
  assert.equal(ledger.issued_posted_cents, "2");
});

test("valoración: null no es cero ni catálogo; cero físico y cero monetario explícitos", () => {
  const unknown = createValuation(opening({ unit_cost_cents: null, known_price_per_kg: 99999 }), actor);
  assert.equal(unknown.value_cents, null);
  for (const type of ["RECEIPT", "ISSUE"]) assert.throws(() => apply(unknown, type, 1), /sin costo/);
  const free = apply(createValuation(opening({ unit_cost_cents: 0 }), actor), "ISSUE", 5000);
  assert.deepEqual(free.value_cents, fraction("0"));
  assert.equal(free.events[0].snapshot.posted_cost_cents, "0");
  const empty = createValuation(opening({ unit_cost_cents: null, quantity_grams: 0 }), actor);
  assert.deepEqual(empty.value_cents, fraction("0"));
  assert.equal(apply(empty, "RECEIPT", 1, 0).quantity_grams, 1);
  assert.throws(() => createValuation(opening({ unit_cost_cents: undefined }), actor));
  assert.throws(() => apply(empty, "RECEIPT", 1, null));
});

test("valoración: extremos, tipos, negativos, overflow y contratos inválidos sin mutación", () => {
  const ledger = createValuation(opening(), actor);
  const before = JSON.stringify(ledger);
  for (const grams of [-1, 0, 0.1, 1e12 + 1, Number.MAX_SAFE_INTEGER, "1", true, null, NaN])
    assert.throws(() => apply(ledger, "RECEIPT", grams));
  for (const cents of [-1, 0.1, 1e12 + 1, "0", true, null, Infinity])
    assert.throws(() => apply(ledger, "RECEIPT", 1, cents));
  assert.throws(() => apply(ledger, "ISSUE", 5001), /insuficiente/);
  for (const extra of [
    { date: "2026-10-30" },
    { date: "2026-02-30" },
    { micro_ingredient_id: "m2" },
    { type: "CANCEL" },
    { logistics_cents: 10 },
  ])
    assert.throws(() => apply(ledger, "RECEIPT", 1, 1, extra));
  assert.equal(JSON.stringify(ledger), before);
  let huge = createValuation(opening({ quantity_grams: 1e12, unit_cost_cents: 1e12 }), actor);
  assert.deepEqual(huge.value_cents, fraction("1000000000000000000000"));
  assert.throws(() => apply(huge, "RECEIPT", 1, 1));
  huge = apply(huge, "ISSUE", 1e12);
  assert.equal(huge.events[0].snapshot.posted_cost_cents, "1000000000000000000000");
});

test("valoración: replay, reconstrucción JSON, revisión, cronología y apertura no recosteable", () => {
  const start = createValuation(opening(), actor);
  const input = event(start, "ISSUE", 1);
  const once = applyValuation(start, input, actor);
  assert.deepEqual(applyValuation(once, { ...input }, actor), once);
  assert.throws(() => applyValuation(once, { ...input, quantity_grams: 2 }, actor), /Reintento/);
  assert.throws(() => applyValuation(once, input, { ...actor, id: "other-admin" }), /Reintento/);
  assert.throws(() => apply(once, "RECEIPT", 1, 1, { id: input.id }), /ya registrado/);
  assert.throws(() => apply(once, "RECEIPT", 1, 1, { expected_revision: 0 }), /obsoleta/);
  const later = apply(once, "RECEIPT", 1, 1, { date: "2026-11-03" });
  assert.throws(() => apply(later, "RECEIPT", 1, 1, { date: "2026-11-02" }), /anterior/);
  assert.deepEqual(inspect(JSON.parse(JSON.stringify(later))), inspect(later));
  assertValuationOpening(later, opening(), actor);
  for (const extra of [
    { version: 2 },
    { quantity_grams: 3 },
    { unit_cost_cents: 9 },
    { cutoff_date: "2026-10-29" },
  ])
    assert.throws(() => assertValuationOpening(later, opening(extra), actor), /no reconstruir/);
  const corrupt = structuredClone(later);
  corrupt.events[0].snapshot.posted_cost_cents = "100";
  assert.throws(() => inspect(corrupt), /alterado/);
  assert.throws(() => applyValuation(later, { ...event(later, "ISSUE", 1), type: "CANCEL" }, actor));
});

test("valoración: consulta por rol, escritura económica solo ADMIN y motor aislado de comandos", () => {
  const ledger = createValuation(opening(), actor);
  for (const role of ["ADMIN", "OPERATOR", "VIEWER"]) {
    const user = { ...actor, role };
    assert.equal(inspectValuation(ledger, user).quantity_grams, 5000);
    if (role !== "ADMIN") {
      assert.throws(() => createValuation(opening(), user), /administrador/);
      assert.throws(() => applyValuation(ledger, event(ledger, "ISSUE", 1), user), /administrador/);
    }
  }
  assert.throws(() => inspectValuation(ledger, { ...actor, is_active: false }));
  assert.throws(() => inspectValuation(ledger, { ...actor, role: "ROOT" }));
  for (const type of ["MICRO_RECEIPT", "MICRO_ISSUE", "MICRO_VALUATION", "RECEIPT", "ISSUE"])
    assert.throws(() => executeCommand(seedState(), { type, payload: {} }, actor));
});

test("valoración: compras históricas, corrección, cancelación y flete no alteran valoración ni historia", () => {
  let state = seedState();
  state.users = [actor];
  state.microIngredients = [{ id: "m1", operational_id: 1, name: "Micro ficticio", is_active: true }];
  state.microOpenings = [opening()];
  const ledger = createValuation(state.microOpenings[0], actor);
  const original = structuredClone(state);
  const snapshot = JSON.stringify(ledger);
  const payload = {
    status: "CONFIRMED",
    document_kind: "DOCUMENT",
    supplier: "Proveedor ficticio",
    reference: "F-23",
    source: "Ensayo",
    document_date: "2026-10-10",
    total: "50.00",
    payment_method: "CASH",
    reviewed_expenses: true,
    lines: [{ micro_ingredient_id: "m1", quantity_kg: "25", unit_price: "2.00" }],
  };
  const run = (type, p) => {
    state = executeCommand(state, { type, payload: p }, actor).state;
  };
  run("MICRO_PURCHASE_SAVE", payload);
  const purchase = state.microPurchases[0];
  run("MICRO_PURCHASE_SAVE", {
    ...payload,
    id: purchase.id,
    expected_version: 1,
    existing_expense_id: purchase.expense_id,
    reason: "Corrección de ensayo",
    source: "Soporte corregido",
    total: "60.00",
    lines: [{ micro_ingredient_id: "m1", quantity_kg: "25", unit_price: "2.40" }],
  });
  assert.equal(state.expenses[0].amount, 6000);
  assert.equal(JSON.stringify(ledger), snapshot);
  run("MICRO_PURCHASE_CANCEL", { id: purchase.id, expected_version: 2, reason: "Anulación sintética" });
  const beforeLogistics = structuredClone(state);
  run("EXPENSE_CREATE", {
    category: "LOGISTICS",
    description: "Flete ficticio",
    amount: "3.00",
    date: "2026-11-01",
  });
  assert.notDeepEqual(state.expenses, beforeLogistics.expenses);
  for (const table of TABLES.filter(
    (name) =>
      ![
        "microPurchases",
        "microPurchaseLines",
        "expenses",
        "audit",
        "corrections",
        "correctionFields",
      ].includes(name),
  ))
    assert.deepEqual(state[table], original[table], table);
  for (const product of state.products)
    assert.deepEqual(stock(state, product.id), stock(original, product.id));
  assert.equal(JSON.stringify(ledger), snapshot);
  assert.deepEqual(inspect(ledger).value_cents, fraction("1000"));
  assert.notDeepEqual(balanceSummary(state), balanceSummary(original));
});

test("valoración SQLite sintética: dos procesos, CAS, rollback, replay, reinicio y respaldo/restauración", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp26-23-synthetic-")), "private"));
  const filename = join(root, "before.sqlite");
  initializeDatabase(filename);
  const connection = openSqliteDatabase(filename);
  const store = createStore(() => connection);
  const state = seedState();
  state.users = [actor];
  state.microIngredients = [{ id: "m1", operational_id: 1, name: "Micro ficticio", is_active: true }];
  state.microOpenings = [opening()];
  const initial = valuationSnapshot(state, createValuation(opening(), actor), actor);
  await store.persistState(null, initial);
  await backupDatabase(filename, join(root, "before-backup.sqlite"));
  const processes = [0, 1].map(() =>
    fork(
      fileURLToPath(new URL("./helpers/valuation-sqlite.mjs", import.meta.url)),
      ["valuation-race", filename],
      { stdio: ["ignore", "ignore", "pipe", "ipc"] },
    ),
  );
  t.after(() => {
    for (const child of processes) if (child.connected) child.kill();
  });
  await Promise.all(
    processes.map(async (child) => {
      const [message] = await once(child, "message");
      assert.equal(message.ready, true);
    }),
  );
  const input = event(latestValuation(initial), "ISSUE", 1000);
  const results = await Promise.all(
    processes.map(async (child) => {
      const reply = once(child, "message");
      child.send({ event: input });
      return (await reply)[0];
    }),
  );
  assert.equal(results.filter((row) => row.saved).length, 1);
  assert.match(results.find((row) => !row.saved).error, /actualizó|locked/);
  let after = await store.loadState();
  assert.equal(latestValuation(after).quantity_grams, 4000);
  assert.deepEqual(await saveSyntheticValuation(store, input, actor), after);
  await assert.rejects(saveSyntheticValuation(store, { ...input, quantity_grams: 500 }, actor));
  const bad = structuredClone(after);
  bad.revision++;
  bad.microOpenings.push({ ...opening(), id: "bad-opening", micro_ingredient_id: "absent" });
  await assert.rejects(store.persistState(after, bad));
  assert.deepEqual(await store.loadState(), after);
  for (const table of TABLES.filter((name) => name !== "audit"))
    assert.deepEqual(after[table], initial[table], table);
  connection.close();
  const reopened = openSqliteDatabase(filename);
  after = await createStore(() => reopened).loadState();
  assert.equal(inspect(latestValuation(after)).quantity_grams, 4000);
  reopened.close();
  const backup = join(root, "after-backup.sqlite"),
    restored = join(root, "restored.sqlite");
  await backupDatabase(filename, backup);
  await restoreDatabase(backup, restored);
  const restoredConnection = openSqliteDatabase(restored);
  assert.deepEqual(await createStore(() => restoredConnection).loadState(), after);
  restoredConnection.close();
  const db = new DatabaseSync(restored);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
  assert.equal(inspectDatabase(filename).status, "managed");
  if (process.env.NQP23_EVIDENCE_DIR) {
    for (const name of ["before-backup.sqlite", "after-backup.sqlite", "restored.sqlite"])
      copyFileSync(join(root, name), join(process.env.NQP23_EVIDENCE_DIR, name));
    writeFileSync(
      join(process.env.NQP23_EVIDENCE_DIR, "sqlite-result.json"),
      JSON.stringify(
        {
          root,
          results,
          integrity_check: "ok",
          foreign_key_check: [],
          ledger: latestValuation(after),
          protected_tables: TABLES.filter((name) => name !== "audit"),
        },
        null,
        2,
      ),
    );
  }
});
