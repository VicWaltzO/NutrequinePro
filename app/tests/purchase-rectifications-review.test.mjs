import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { executeCommand } from "../lib/domain.mjs";
import { fixture, payload, actor } from "./helpers/receipt-fixture.mjs";
import { applyValuation, returnIssueValuation } from "../features/microinsumos/domain/valuation.mjs";
import { assertPurchaseRectificationIntegrity as integrity } from "../features/microinsumos/domain/purchase-rectifications.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { createStore } from "../lib/application-store.mjs";

const run = (s, type, payload, who = actor) => {
  const request_id = randomUUID();
  const next = executeCommand(s, { type, payload, request_id }, who).state;
  Object.assign(next.audit.at(-1), { request_id, request_contract_version: 1 });
  return next;
};
function bought() {
  const s = fixture();
  s.microOpenings.forEach((o) => Object.assign(o, { quantity_grams: 0, valuation_cents: 0 }));
  return run(
    s,
    "MICRO_RECEIPT_SAVE",
    payload({
      total: "250",
      lines: [{ micro_ingredient_id: "m1", quantity_kg: "25", unit_price: "10", amount: "250" }],
    }),
  );
}
function rectify(s, quantity = "20", price = "10") {
  return run(s, "MICRO_RECEIPT_RECTIFY", {
    id: s.microReceipts[0].id,
    expected_version: s.microReceipts[0].version,
    expected_revision: s.revision,
    date: "2026-11-15",
    reason: "Ensayo independiente",
    reference: "REV-35",
    total: String(Number(quantity) * Number(price)),
    discount: "0",
    lines: [
      {
        micro_ingredient_id: "m1",
        quantity_kg: quantity,
        unit_price: price,
        amount: String(Number(quantity) * Number(price)),
        discount: "0",
      },
    ],
  });
}
function issue(s, quantity = 10000) {
  s.microLedgers[0].ledger = applyValuation(
    s.microLedgers[0].ledger,
    {
      id: "review-issue",
      request_id: "review-issue",
      micro_ingredient_id: "m1",
      type: "ISSUE",
      date: "2026-11-02",
      quantity_grams: quantity,
      expected_revision: 1,
    },
    actor,
  );
  return s;
}
test("independent prospective policy, frozen issue and RETURN", () => {
  const before = issue(bought());
  const oldIssue = structuredClone(before.microLedgers[0].ledger.events[1]);
  const after = rectify(before);
  integrity(before, after);
  assert.equal(after.microLedgers[0].ledger.quantity_grams, 10000);
  assert.deepEqual(after.microLedgers[0].ledger.value_cents, { n: "10000", d: "1" });
  assert.deepEqual(after.microLedgers[0].ledger.events[1], oldIssue);
  assert.equal(after.expenses.length, 1);
  const ledger = returnIssueValuation(
    after.microLedgers[0].ledger,
    {
      id: "review-return",
      request_id: "review-return",
      micro_ingredient_id: "m1",
      type: "RETURN",
      date: "2026-11-15",
      quantity_hundredths: 100000,
      source_issue_id: "review-issue",
      expected_revision: 3,
    },
    actor,
  );
  assert.equal(ledger.quantity_grams, 11000);
  assert.deepEqual(ledger.value_cents, { n: "11000", d: "1" });
});
test("independent impossible physical/economic correction is atomic", () => {
  const s = issue(bought());
  const copy = structuredClone(s);
  assert.throws(() => rectify(s, "9"));
  assert.throws(() => rectify(s, "20", "1"));
  assert.deepEqual(s, copy);
  const empty = issue(bought(), 25000);
  assert.throws(() => rectify(empty, "25", "11"));
});
test("independent import rejects orphan historical line", () => {
  const s = rectify(bought());
  s.microReceiptLines.push({ ...s.microReceiptLines[0], id: "orphan-line", is_current: false, version: 999 });
  assert.throws(() => integrity(null, s));
});
test("independent import rejects orphan receipt evidence", () => {
  const s = rectify(bought());
  s.microValuationEvents.push({
    ...s.microValuationEvents[0],
    id: "orphan-evidence",
    receipt_line_id: s.microReceiptLines[1].id,
  });
  assert.throws(() => integrity(null, s));
});
test("independent import validates original documentary amounts before corrections", () => {
  const s = rectify(bought());
  const c = s.corrections.find((c) => c.entity_type === "MICRO_RECEIPT_RECTIFY");
  c.old_snapshot.lines[0].unit_price_cents = -100;
  s.microReceiptLines.find((l) => l.id === c.old_snapshot.lines[0].id).unit_price_cents = -100;
  assert.throws(() => integrity(null, s));
});
test("independent import requires expense correction evidence", () => {
  const s = rectify(bought());
  s.corrections = s.corrections.filter((c) => c.entity_type !== "EXPENSE");
  assert.throws(() => integrity(null, s));
});
test("independent import rejects counterfeit expense before and after snapshots", () => {
  const s = rectify(bought());
  const c = s.corrections.find((c) => c.entity_type === "EXPENSE");
  c.old_snapshot.description = "Gasto falso ajeno";
  c.new_snapshot.description = "Gasto falso ajeno";
  assert.throws(() => integrity(null, s));
});
test("independent import matches original receipt metadata and actor", () => {
  const s = rectify(bought());
  const original = s.microValuationEvents[0];
  original.event.actor_id = "counterfeit-admin";
  s.microLedgers[0].ledger.events[0].actor_id = "counterfeit-admin";
  assert.throws(() => integrity(null, s));
});
test("independent import binds original identity to confirmation audit", () => {
  const s = rectify(bought());
  const c = s.corrections.find((c) => c.entity_type === "MICRO_RECEIPT_RECTIFY");
  for (const r of [s.microReceipts[0], c.old_snapshot.receipt, c.new_snapshot.receipt]) {
    r.supplier = "Proveedor adulterado";
    r.document_key = JSON.stringify(["DOCUMENT", "PROVEEDOR ADULTERADO", r.reference]);
  }
  assert.throws(() => integrity(null, s));
});
test("independent import binds expense snapshots to current expense", () => {
  const s = rectify(bought());
  s.expenses[0].description = "Gasto ajeno sin corrección";
  assert.throws(() => integrity(null, s));
});
test("independent real SQLite import rejects original negative price", async () => {
  const s = rectify(bought());
  const c = s.corrections.find((c) => c.entity_type === "MICRO_RECEIPT_RECTIFY");
  c.old_snapshot.lines[0].unit_price_cents = -100;
  s.microReceiptLines.find((l) => l.id === c.old_snapshot.lines[0].id).unit_price_cents = -100;
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const m of migrationCatalog().migrations) db.exec(m.sql);
    const prepare = (sql, args = []) => ({ sql, args, bind: (...a) => prepare(sql, a) });
    const binding = {
      prepare,
      async batch(statements) {
        db.exec("BEGIN");
        try {
          const out = statements.map((p) => {
            const stmt = db.prepare(p.sql);
            return { results: stmt.columns().length ? stmt.all(...p.args) : (stmt.run(...p.args), []) };
          });
          db.exec("COMMIT");
          return out;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    };
    const store = createStore(() => binding);
    await assert.rejects(store.persistState(null, s));
  } finally {
    db.close();
  }
});
test("independent roles and large-scale exact remainder", () => {
  const s = bought();
  for (const role of ["VIEWER", "OPERATOR"]) {
    const who = { ...actor, role };
    assert.throws(() => run(s, "MICRO_RECEIPT_RECTIFY", { id: s.microReceipts[0].id }, who));
  }
  const corrected = rectify(s, "100000000", "10");
  assert.equal(corrected.microLedgers[0].ledger.quantity_grams, 100000000000);
  assert.deepEqual(corrected.microLedgers[0].ledger.value_cents, { n: "100000000000", d: "1" });
  integrity(s, corrected);
});
test("independent SQL cannot change confirmed total/expense without correction", () => {
  const s = bought();
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const m of migrationCatalog().migrations) db.exec(m.sql);
    for (const p of writePlan(null, s)) db.prepare(p.sql).run(...p.args);
    const receipt = { ...s.microReceipts[0], total_cents: 123, version: 2 };
    const expense = { ...s.expenses[0], amount: 123 };
    assert.throws(() => {
      db.exec("BEGIN");
      db.prepare("UPDATE micro_receipts SET data=? WHERE id=?").run(JSON.stringify(receipt), receipt.id);
      db.prepare("UPDATE expenses SET data=? WHERE id=?").run(JSON.stringify(expense), expense.id);
      db.exec("UPDATE settings SET revision=revision+1; COMMIT");
    });
  } finally {
    db.close();
  }
});
