import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { executeCommand } from "../lib/domain.mjs";
import { preparationFixture, plan, command } from "./helpers/preparation-fixture.mjs";
import { actor, identity, payload as receipt } from "./helpers/receipt-fixture.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { createStore } from "../lib/application-store.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import {
  applyValuation,
  createValuation,
  issueValuation,
  inspectValuation,
} from "../features/microinsumos/domain/valuation.mjs";
import { assignedHundredths } from "../features/microinsumos/domain/assignment-balances.mjs";

const apply = (s, c, options, user = actor) =>
  executeCommand(s, c, user, "2026-11-10T12:00:00.000Z", options);
const confirm = (s, nuclei = "12") =>
  command("MICRO_PREPARATION_CONFIRM", {
    preparation_id: s.microPreparations.at(-1).id,
    nuclei,
    date: "2026-11-10",
    expected_revision: s.revision,
  });
function assigned(nuclei = "20") {
  const f = preparationFixture();
  f.s.microOpenings[0].quantity_grams = 10000;
  let s = apply(f.s, plan(f.s, { nuclei }), f.options).state;
  s = apply(
    s,
    command("MICRO_ASSIGN", {
      preparation_id: s.microPreparations.at(-1).id,
      reason: "Revisión sintética independiente",
      expected_revision: s.revision,
    }),
    f.options,
  ).state;
  return { ...f, s };
}
async function persisted(t) {
  const f = assigned();
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp28-review-")), "private"));
  const file = join(root, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db, f.options);
  const draft = structuredClone(f.s);
  draft.microAssignments = [];
  draft.microAssignmentLines = [];
  draft.microPreparations = [];
  draft.microFormulaHeads = [];
  for (const formula of draft.microFormulas) {
    formula.published_at = null;
    formula.published_by = null;
  }
  await store.persistState(null, draft);
  const published = structuredClone(f.s);
  published.microAssignments = [];
  published.microAssignmentLines = [];
  published.microPreparations = [];
  await store.persistState(draft, published);
  await store.persistState(published, f.s);
  return { ...f, root, file, db, store };
}

test("revisión independiente28: 20→12, exactitud costo y cierre irrepetible conserva historia", () => {
  const f = assigned();
  const before = structuredClone(f.s);
  const next = apply(f.s, confirm(f.s), f.options, { ...actor, role: "OPERATOR" }).state;
  assert.deepEqual(
    next.microIssues.map((i) => [i.quantity_hundredths, i.released_hundredths]),
    [
      [360000, 240000],
      [1200, 800],
    ],
  );
  assert.deepEqual(
    next.microLedgers.map((l) => l.ledger.quantity_hundredths),
    [640000, 498800],
  );
  assert.deepEqual(next.microConfirmations[0].total_cost_cents, { n: "3612", d: "5" });
  assert.deepEqual(next.microConfirmations[0].unit_cost_cents, { n: "301", d: "5" });
  assert.equal(assignedHundredths(next, "m1"), 0);
  assert.equal(next.microAssignmentReversals.length, 0);
  assert.deepEqual(next.microPreparations, before.microPreparations);
  assert.deepEqual(next.inventoryMovements, before.inventoryMovements);
  assert.deepEqual(next.expenses, before.expenses);
  assert.throws(() => apply(next, confirm(next), f.options), /cerrada/);
  assert.deepEqual(f.s, before);
});

test("revisión independiente28: 0.01g,0.5g,1g y carry contra oráculo racional propio", () => {
  const opening = {
    id: "review-o",
    micro_ingredient_id: "review-m",
    version: 1,
    quantity_grams: 2,
    unit_cost_cents: 1000,
    cutoff_date: "2026-11-01",
  };
  let ledger = createValuation(opening, actor);
  let sum = 0;
  for (const [i, q] of [1, 50, 100].entries()) {
    ledger = issueValuation(
      ledger,
      {
        id: `review-${i}`,
        request_id: `review-request-${i}`,
        micro_ingredient_id: opening.micro_ingredient_id,
        type: "ISSUE",
        date: "2026-11-10",
        quantity_hundredths: q,
        expected_revision: ledger.revision,
      },
      { ...actor, role: "OPERATOR" },
    );
    sum += q;
    const view = inspectValuation(ledger, actor);
    assert.equal(view.quantity_hundredths, 200 - sum);
    assert.equal(BigInt(view.issued_exact_cents.n) * 100n, BigInt(sum) * BigInt(view.issued_exact_cents.d));
    assert.equal(BigInt(view.value_cents.n) * 100n, BigInt(200 - sum) * BigInt(view.value_cents.d));
  }
  assert.equal(ledger.issued_posted_cents, "2");
  assert.deepEqual(ledger.rounding_carry_cents, { n: "-49", d: "100" });
});

test("revisión independiente28: transición v1 preserva ISSUE previo y recepción posterior exacta", () => {
  const opening = {
    id: "old-o",
    micro_ingredient_id: "old-m",
    version: 1,
    quantity_grams: 10,
    unit_cost_cents: 200,
    cutoff_date: "2026-11-01",
  };
  let ledger = createValuation(opening, actor);
  ledger = applyValuation(
    ledger,
    {
      id: "old-issue",
      request_id: "old-request",
      micro_ingredient_id: "old-m",
      type: "ISSUE",
      date: "2026-11-02",
      quantity_grams: 1,
      expected_revision: 0,
    },
    actor,
  );
  const old = structuredClone(ledger.events);
  ledger = issueValuation(
    ledger,
    {
      id: "new-issue",
      request_id: "new-request",
      micro_ingredient_id: "old-m",
      type: "ISSUE",
      date: "2026-11-03",
      quantity_hundredths: 1,
      expected_revision: 1,
    },
    actor,
  );
  ledger = applyValuation(
    ledger,
    {
      id: "new-receipt",
      request_id: "receipt-request",
      micro_ingredient_id: "old-m",
      type: "RECEIPT",
      date: "2026-11-04",
      quantity_grams: 1,
      total_cost_cents: 1,
      expected_revision: 2,
    },
    actor,
  );
  assert.deepEqual(ledger.events.slice(0, 1), old);
  assert.equal(ledger.quantity_hundredths, 999);
  assert.deepEqual(inspectValuation(ledger, actor).value_cents, { n: "1399", d: "500" });
});

test("revisión independiente28 SQLite: última ISSUE fallida revierte libros/cierre/auditoría", async (t) => {
  const f = await persisted(t);
  const outcome = apply(f.s, confirm(f.s), f.options);
  outcome.state.microIssues.at(-1).formula_line_id = "wrong-last-line";
  await assert.rejects(f.store.persistState(f.s, outcome.state));
  assert.deepEqual(await f.store.loadState(), f.s);
});

test("revisión independiente28 SQLite: replay y competencia dos conexiones no duplican ISSUE", async (t) => {
  const f = await persisted(t);
  const second = openSqliteDatabase(f.file);
  t.after(() => second.close());
  const other = createStore(() => second, f.options);
  const c = confirm(f.s);
  const result = await Promise.allSettled([
    f.store.runCommand(c, identity),
    other.runCommand(confirm(f.s), identity),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  const current = await f.store.loadState();
  assert.equal(current.microConfirmations.length, 1);
  assert.equal(current.microIssues.length, 2);
  const winner = result[0].status === "fulfilled" ? c : null;
  if (winner) assert.deepEqual((await other.runCommand(winner, identity)).state, current);
  assert.deepEqual(inspectValuation(current.microLedgers[0].ledger, actor).quantity_hundredths, 640000);
});

test("revisión independiente28 SQLite: no aceptar saldo físico adulterado tras ISSUE", async (t) => {
  const f = await persisted(t);
  const outcome = apply(f.s, confirm(f.s), f.options);
  outcome.state.microLedgers[0].ledger.quantity_hundredths += 1;
  await assert.rejects(f.store.persistState(f.s, outcome.state));
  assert.deepEqual(await f.store.loadState(), f.s);
});

test("revisión independiente28 SQLite: no aceptar costo agregado adulterado", async (t) => {
  const f = await persisted(t);
  const outcome = apply(f.s, confirm(f.s), f.options);
  outcome.state.microConfirmations[0].total_cost_cents = { n: "0", d: "1" };
  await assert.rejects(f.store.persistState(f.s, outcome.state));
  assert.deepEqual(await f.store.loadState(), f.s);
});

test("revisión independiente28 SQLite: dos procesos confirman misma orden, un solo ganador durable", async (t) => {
  const f = await persisted(t);
  const source = `import {openSqliteDatabase} from './lib/adapters/node-sqlite.mjs';
import {createStore} from './lib/application-store.mjs';
const db=openSqliteDatabase(process.argv[1]);
const store=createStore(()=>db,JSON.parse(process.argv[2]));
process.stdin.once('data',async()=>{try{await store.runCommand(JSON.parse(process.argv[3]),JSON.parse(process.argv[4]));process.stdout.write('WIN');}catch{process.stdout.write('REJECT');}finally{db.close();}});
process.stdout.write('READY');`;
  async function worker(c) {
    return await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          source,
          f.file,
          JSON.stringify(f.options),
          JSON.stringify(c),
          JSON.stringify(identity),
        ],
        { cwd: process.cwd(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
      );
      let output = "",
        error = "";
      const done = new Promise((finish) => child.once("close", (code) => finish({ code, output, error })));
      child.stdout.on("data", (b) => {
        output += b;
        if (output.includes("READY")) resolve({ child, done });
      });
      child.stderr.on("data", (b) => {
        error += b;
      });
      child.once("error", reject);
      child.once("close", () => {
        if (!output.includes("READY")) reject(new Error(error));
      });
      t.after(() => {
        if (child.exitCode === null) child.kill();
      });
    });
  }
  const a = await worker(confirm(f.s));
  const b = await worker(confirm(f.s));
  a.child.stdin.end("GO");
  b.child.stdin.end("GO");
  const results = await Promise.all([a.done, b.done]);
  assert.equal(results.filter((r) => r.output.includes("WIN")).length, 1, JSON.stringify(results));
  assert.equal(results.filter((r) => r.output.includes("REJECT")).length, 1);
  const current = await f.store.loadState();
  assert.equal(current.microConfirmations.length, 1);
  assert.equal(current.microIssues.length, 2);
  assert.equal(inspectValuation(current.microLedgers[0].ledger, actor).quantity_hundredths, 640000);
});

test("revisión independiente28 SQL directo: escala física adulterada rechaza sin validador JavaScript", async (t) => {
  const f = await persisted(t);
  const outcome = apply(f.s, confirm(f.s), f.options);
  const ledger = outcome.state.microLedgers[0].ledger;
  ledger.quantity_hundredths += 1;
  ledger.quantity_grams = ledger.quantity_hundredths / 100;
  const statements = writePlan(f.s, outcome.state).map((p) => f.db.prepare(p.sql).bind(...p.args));
  await assert.rejects(f.db.batch(statements), /exact ledger balance/);
  assert.deepEqual(await f.store.loadState(), f.s);
});

test("revisión independiente28 SQL directo: recepción no puede reescribir snapshot ISSUE histórico", async (t) => {
  const f = await persisted(t);
  const closed = (await f.store.runCommand(confirm(f.s), identity)).state;
  const outcome = apply(
    closed,
    command("MICRO_RECEIPT_SAVE", receipt({ reference: "REVIEW-AFTER", document_date: "2026-11-10" })),
    f.options,
  );
  outcome.state.microLedgers[0].ledger.events[0].snapshot.exact_cost_cents = { n: "0", d: "1" };
  const statements = writePlan(closed, outcome.state).map((p) => f.db.prepare(p.sql).bind(...p.args));
  await assert.rejects(f.db.batch(statements), /Ledger history/);
  assert.deepEqual(await f.store.loadState(), closed);
});

test("revisión independiente28: costo futuro y orden nueva8 conservan cierre12 y permiten libre exacto", () => {
  const f = assigned();
  const closed = apply(f.s, confirm(f.s), f.options).state;
  const snapshot = structuredClone(closed.microConfirmations[0]);
  const oldIssues = structuredClone(closed.microIssues);
  let next = apply(
    closed,
    command("MICRO_RECEIPT_SAVE", receipt({ reference: "REVIEW-PRICE-AFTER", document_date: "2026-11-10" })),
    f.options,
  ).state;
  next = apply(next, plan(next, { nuclei: "8" }), f.options).state;
  next = apply(
    next,
    command("MICRO_ASSIGN", {
      preparation_id: next.microPreparations.at(-1).id,
      reason: "Ocho en orden nueva sintética",
      expected_revision: next.revision,
    }),
    f.options,
  ).state;
  assert.equal(assignedHundredths(next, "m1"), 240000);
  next = apply(next, confirm(next, "8"), f.options).state;
  assert.deepEqual(next.microConfirmations[0], snapshot);
  assert.deepEqual(next.microIssues.slice(0, oldIssues.length), oldIssues);
  assert.equal(next.microConfirmations.length, 2);
  assert.equal(next.microPreparations.length, 2);
  assert.equal(assignedHundredths(next, "m1"), 0);
  assert.notDeepEqual(next.microConfirmations[1].unit_cost_cents, snapshot.unit_cost_cents);
});
