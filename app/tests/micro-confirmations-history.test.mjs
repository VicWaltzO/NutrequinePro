import { test } from "node:test";
import assert from "node:assert/strict";
import { executeCommand } from "../lib/domain.mjs";
import { preparationFixture, command, plan } from "./helpers/preparation-fixture.mjs";
import { actor, payload } from "./helpers/receipt-fixture.mjs";
import { assignedHundredths } from "../features/microinsumos/domain/assignment-balances.mjs";
const apply = (s, c, o) => executeCommand(s, c, actor, "2026-11-10T12:00:00Z", o);
const assign = (s, id) =>
  command("MICRO_ASSIGN", { preparation_id: id, reason: "Ensayo sintético", expected_revision: s.revision });
const confirm = (s, id, nuclei) =>
  command("MICRO_PREPARATION_CONFIRM", {
    preparation_id: id,
    nuclei,
    date: "2026-11-10",
    expected_revision: s.revision,
  });
test("NQP28 precio antes/después ISSUE, fórmula posterior no se adopta y otras asignaciones protegidas", () => {
  const f = preparationFixture();
  let s = f.s;
  s.microOpenings[0].quantity_grams = 10000;
  const a = apply(s, plan(s), f.options);
  s = a.state;
  const b = apply(s, plan(s, { nuclei: "8" }), f.options);
  s = b.state;
  s = apply(s, assign(s, a.result), f.options).state;
  s = apply(s, assign(s, b.result), f.options).state;
  assert.equal(assignedHundredths(s, "m1"), 840000);
  const saved = apply(
    s,
    command("MICRO_FORMULA_SAVE", {
      family: "ROSADO",
      expected_version: 2,
      lines: [{ micro_ingredient_id: "m1", dose_kg: "0.001" }],
    }),
    f.options,
  );
  s = apply(
    saved.state,
    command("MICRO_FORMULA_ACTIVATE", { family: "ROSADO", formula_id: saved.result, expected_version: 3 }),
    f.options,
  ).state;
  const received = apply(s, command("MICRO_RECEIPT_SAVE", payload()), f.options).state;
  const first = apply(received, confirm(received, a.result, "12"), f.options).state;
  // 10000g@2 + 5000g@4 gives800/3 cents/kg;12*300g costs960c.
  assert.deepEqual(first.microIssues[0].event.snapshot.exact_cost_cents, { n: "960", d: "1" });
  assert.equal(first.microIssues[0].quantity_hundredths, 360000);
  assert.equal(assignedHundredths(first, "m1"), 240000);
  assert.equal(first.microLedgers[0].ledger.quantity_hundredths, 1140000);
  const snapshot = structuredClone(first.microConfirmations);
  const after = apply(
    first,
    command(
      "MICRO_RECEIPT_SAVE",
      payload({
        reference: "SECOND",
        total: "5",
        document_date: "2026-11-10",
        lines: [{ micro_ingredient_id: "m1", quantity_kg: "1", unit_price: "5", amount: "5", discount: "0" }],
      }),
    ),
    f.options,
  ).state;
  assert.deepEqual(after.microConfirmations, snapshot);
  const closed = apply(after, confirm(after, b.result, "8"), f.options).state;
  assert.equal(closed.microConfirmations.length, 2);
  assert.equal(assignedHundredths(closed, "m1"), 0);
  assert.deepEqual(closed.microIssues[0], first.microIssues[0]);
});

test("NQP28 órdenes competidoras: impide sobreasignar; cierre12 libera para orden nueva8", () => {
  const f = preparationFixture();
  let s = f.s;
  s.microOpenings[0].quantity_grams = 6000;
  const a = apply(s, plan(s), f.options);
  s = a.state;
  const b = apply(s, plan(s), f.options);
  s = b.state;
  s = apply(s, assign(s, a.result), f.options).state;
  assert.throws(() => apply(s, assign(s, b.result), f.options), /Saldo libre insuficiente/);
  assert.throws(() => apply(s, confirm(s, b.result, "12"), f.options), /vigente/);
  s = apply(s, confirm(s, a.result, "12"), f.options).state;
  assert.equal(s.microLedgers[0].ledger.quantity_hundredths, 240000);
  assert.equal(assignedHundredths(s, "m1"), 0);
  const eight = apply(s, plan(s, { nuclei: "8" }), f.options);
  s = eight.state;
  s = apply(s, assign(s, eight.result), f.options).state;
  s = apply(s, confirm(s, eight.result, "8"), f.options).state;
  assert.equal(s.microLedgers[0].ledger.quantity_hundredths, 0);
  assert.equal(s.microLedgers[0].ledger.value_cents.n, "0");
  assert.equal(s.microConfirmations.length, 2);
  assert.equal(s.microPreparations.length, 3);
  assert.equal(s.microAssignmentReversals.length, 0);
});
