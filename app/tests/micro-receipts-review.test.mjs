import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { executeCommand } from "../lib/domain.mjs";
import { fixture, payload, actor } from "./helpers/receipt-fixture.mjs";
import { applyValuation } from "../features/microinsumos/domain/valuation.mjs";
const apply = (s, p) =>
  executeCommand(s, { type: "MICRO_RECEIPT_SAVE", payload: p, request_id: randomUUID() }, actor).state;
test("review atomic invalid second line and cutoff", () => {
  const s = fixture(),
    copy = structuredClone(s);
  for (const p of [
    payload({ document_date: "2026-10-25" }),
    payload({ lines: [payload().lines[0], { ...payload().lines[1], amount: "7.99" }] }),
  ])
    assert.throws(() => apply(s, p));
  assert.deepEqual(s, copy);
});
test("review duplicate expense/receipt and protections", () => {
  const s = apply(fixture(), payload());
  assert.throws(() => apply(s, payload()));
  assert.equal(s.expenses.length, 1);
  assert.equal(s.microValuationEvents.length, 2);
  assert.throws(
    () =>
      executeCommand(
        s,
        { type: "EXPENSE_CANCEL", payload: { id: s.expenses[0].id, reason: "synthetic" } },
        actor,
      ),
    /protegido/,
  );
  assert.throws(
    () => executeCommand(s, { type: "MICRO_CORRECT", payload: { id: "o0", expected_version: 1 } }, actor),
    /bloqueada/,
  );
});
test("review discount and carry preserved", () => {
  let s = apply(
    fixture(),
    payload({
      total: "25",
      discount: "3",
      lines: payload().lines.map((l, i) => ({ ...l, discount: String(i + 1) })),
    }),
  );
  const row = s.microLedgers[0];
  row.ledger = applyValuation(
    row.ledger,
    {
      id: "review-issue",
      request_id: "review-issue",
      micro_ingredient_id: "m1",
      type: "ISSUE",
      date: "2026-11-01",
      quantity_grams: 1,
      expected_revision: 1,
    },
    actor,
  );
  const carry = structuredClone(row.ledger.rounding_carry_cents);
  s = apply(s, payload({ reference: "SECOND", document_date: "2026-11-02" }));
  assert.deepEqual(s.microLedgers[0].ledger.rounding_carry_cents, carry);
  assert.equal(s.expenses[0].amount, 2500);
});
test("review draft without effects", () => {
  const s = apply(fixture(), payload({ status: "DRAFT" }));
  assert.equal(s.expenses.length, 0);
  assert.equal(s.microLedgers.length, 0);
  assert.equal(s.microValuationEvents.length, 0);
});

test("review two admins draft confirmation replay and cross-command theft", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createPrivateDirectory } = await import("../lib/sqlite/files.mjs");
  const { initializeDatabase } = await import("../lib/sqlite/migrations.mjs");
  const { openSqliteDatabase } = await import("../lib/adapters/node-sqlite.mjs");
  const { createStore } = await import("../lib/application-store.mjs");
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp22-review-replay-")), "private"));
  const db = join(root, "synthetic.sqlite");
  initializeDatabase(db);
  const c = openSqliteDatabase(db);
  try {
    const store = createStore(() => c);
    const s = fixture();
    s.users.push({ ...actor, id: "second-admin" });
    await store.persistState(null, s);
    const a = { userId: actor.id, displayName: actor.name },
      b = { userId: "second-admin", displayName: "Synthetic B" };
    const draft = await store.runCommand(
      { type: "MICRO_RECEIPT_SAVE", payload: payload({ status: "DRAFT" }), request_id: "review-draft" },
      a,
    );
    const cmd = {
      type: "MICRO_RECEIPT_SAVE",
      payload: payload({ id: draft.result, expected_version: 1 }),
      request_id: "review-confirm",
    };
    await store.runCommand(cmd, b);
    const before = await store.loadState();
    await store.runCommand(cmd, b);
    assert.deepEqual(await store.loadState(), before);
    await assert.rejects(store.runCommand(cmd, a));
    const expense = {
      type: "EXPENSE_CREATE",
      payload: { date: "2026-11-01", category: "LOGISTICS", description: "Synthetic", amount: "1" },
      request_id: "review-confirm",
    };
    await assert.rejects(store.runCommand(expense, a));
    await assert.rejects(store.runCommand(expense, b));
    await assert.rejects(store.runCommand({ ...expense, request_id: "review-draft" }, b));
    assert.deepEqual(await store.loadState(), before);
  } finally {
    c.close();
  }
});

test("review SQL cross-table triggers, FK and unique ledger guarantees", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { migrationCatalog } = await import("../lib/sqlite/schema.mjs");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const migration of migrationCatalog().migrations) db.exec(migration.sql);
    const insert = (table, values) => {
      const row = { id: randomUUID(), data: "{}", ...values };
      db.prepare(
        `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row)
          .map(() => "?")
          .join(",")})`,
      ).run(...Object.values(row));
      return row.id;
    };
    const micro = insert("micro_ingredients", { operational_id: 1 });
    const opening = insert("micro_openings", { micro_ingredient_id: micro });
    const expense = insert("expenses", {});
    const receipt = insert("micro_receipts", {
      document_key: "operational",
      expense_id: expense,
      request_id: "sql-request",
    });
    const historical = insert("micro_purchases", { document_key: "historical" });
    for (const [table, values] of [
      ["micro_purchases", { document_key: "operational" }],
      ["micro_purchases", { document_key: "other", expense_id: expense }],
      ["micro_receipts", { document_key: "historical", request_id: "other" }],
    ])
      assert.throws(() => insert(table, values), /Duplicate micro document or expense/);
    assert.throws(
      () => db.prepare("UPDATE micro_purchases SET document_key=? WHERE id=?").run("operational", historical),
      /Duplicate micro document or expense/,
    );
    assert.throws(
      () => db.prepare("UPDATE micro_receipts SET document_key=? WHERE id=?").run("historical", receipt),
      /Duplicate micro document or expense/,
    );
    const historicalExpense = insert("expenses", {});
    db.prepare("UPDATE micro_purchases SET expense_id=? WHERE id=?").run(historicalExpense, historical);
    assert.throws(
      () =>
        insert("micro_receipts", { document_key: "new", expense_id: historicalExpense, request_id: "new" }),
      /Duplicate micro document or expense/,
    );
    assert.throws(
      () => insert("micro_receipts", { document_key: "new", request_id: "sql-request" }),
      /UNIQUE/,
    );
    assert.throws(
      () => insert("micro_receipts", { document_key: "new", expense_id: expense, request_id: "new" }),
      /UNIQUE/,
    );
    assert.throws(
      () => insert("micro_receipts", { document_key: "new", expense_id: "missing", request_id: "new" }),
      /FOREIGN KEY/,
    );
    assert.throws(
      () => insert("micro_receipt_lines", { receipt_id: "missing", micro_ingredient_id: micro }),
      /FOREIGN KEY/,
    );
    const line = insert("micro_receipt_lines", { receipt_id: receipt, micro_ingredient_id: micro });
    const ledger = insert("micro_ledgers", { micro_ingredient_id: micro, opening_id: opening });
    assert.throws(
      () => insert("micro_ledgers", { micro_ingredient_id: micro, opening_id: opening }),
      /UNIQUE/,
    );
    insert("micro_valuation_events", {
      ledger_id: ledger,
      receipt_line_id: line,
      request_id: "event",
      revision: 1,
    });
    const line2 = insert("micro_receipt_lines", { receipt_id: receipt, micro_ingredient_id: micro });
    assert.throws(
      () =>
        insert("micro_valuation_events", {
          ledger_id: ledger,
          receipt_line_id: line2,
          request_id: "event2",
          revision: 1,
        }),
      /UNIQUE/,
    );
    assert.throws(
      () =>
        insert("micro_valuation_events", {
          ledger_id: ledger,
          receipt_line_id: line2,
          request_id: "event",
          revision: 2,
        }),
      /UNIQUE/,
    );
    assert.throws(
      () =>
        insert("micro_valuation_events", {
          ledger_id: ledger,
          receipt_line_id: line,
          request_id: "event2",
          revision: 2,
        }),
      /UNIQUE/,
    );
    assert.throws(
      () =>
        insert("micro_valuation_events", {
          ledger_id: ledger,
          receipt_line_id: "missing",
          request_id: "event2",
          revision: 2,
        }),
      /FOREIGN KEY/,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
