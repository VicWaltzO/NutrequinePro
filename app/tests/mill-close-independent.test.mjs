import { writePlan } from "../lib/persistence.mjs";
import { stock } from "../features/inventario/domain/stock.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  journeyFixture,
  create,
  link,
  confirmed,
  actor,
  command,
  substitute,
} from "./helpers/journey-fixture.mjs";
import { executeCommand } from "../lib/domain.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
const apply = (s, c, o) => {
  const out = executeCommand(s, c, actor, "2026-11-13T20:00:00.000Z", o);
  out.state.audit.at(-1).request_id = c.request_id;
  return out;
};
function ready(n = "1") {
  const f = journeyFixture();
  let { s, id } = confirmed(f.s, f.options, "ROSADO", n);
  s = apply(s, create(s, [n]), f.options).state;
  const line = s.productionJourneyLines[0];
  s = apply(s, link(s, line.id, id, n), f.options).state;
  return { ...f, s, line };
}
const close = (s, bags) =>
  command("MILL_CLOSE", {
    line_id: s.productionJourneyLines[0].id,
    date: "2026-11-13",
    actual_bags: bags,
    lot_complete: true,
    formula_consent: false,
    expected_revision: s.revision,
  });
async function db(t, f) {
  const dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp30-independent-")), "private"));
  const file = join(dir, "business.sqlite");
  initializeDatabase(file);
  const binding = openSqliteDatabase(file);
  t.after(() => binding.close());
  const store = createStore(() => binding, f.options);
  return { store, binding };
}
test("independent: 40 theoretical / 39 and 38 real, no repeated micro ISSUE", () => {
  for (const bags of [39, 38]) {
    const f = ready();
    assert.equal(f.line.planned_weight_grams, 1000000);
    const out = apply(f.s, close(f.s, bags), f.options).state;
    assert.equal(out.millClosures[0].waste_grams, (40 - bags) * 25000);
    assert.deepEqual(out.microIssues, f.s.microIssues);
    assert.equal(
      out.inventoryMovements.filter((m) => m.source_type === "MILL_CLOSURE" && m.item_type === "PRODUCT")
        .length,
      1,
    );
    assert.equal(out.millClosures[0].final_cost_cents, null);
  }
});
test("independent: sub25kg closes zero and no product inventory", () => {
  const f = ready("0.01");
  const out = apply(f.s, close(f.s, 0), f.options).state;
  assert.equal(out.millClosures[0].waste_grams, 10000);
  assert.equal(out.millClosures[0].movement_id, null);
  assert.equal(
    out.inventoryMovements.filter((m) => m.source_type === "MILL_CLOSURE" && m.item_type === "PRODUCT")
      .length,
    0,
  );
});
test("independent: persisted exact replay, mutated payload rejected, viewer rejected", async (t) => {
  const f = ready();
  const { store } = await db(t, f);
  await store.persistState(null, f.s);
  const c = close(f.s, 39),
    identity = { userId: actor.id, displayName: actor.name };
  const a = await store.runCommand(c, identity);
  const b = await store.runCommand(c, identity);
  assert.equal(a.result, b.result);
  assert.equal(a.state.revision, b.state.revision);
  await assert.rejects(store.runCommand({ ...c, payload: { ...c.payload, actual_bags: 38 } }, identity));
  assert.throws(() => executeCommand(f.s, c, { ...actor, role: "VIEWER" }, undefined, f.options));
});
test("independent: initial snapshot MUST reject omitted macro movements and closure audit", async (t) => {
  const f = ready();
  const out = apply(f.s, close(f.s, 39), f.options).state;
  out.audit.at(-1).request_id = out.millClosures[0].request_id;
  out.inventoryMovements = out.inventoryMovements.filter(
    (m) => !(m.source_type === "MILL_CLOSURE" && m.item_type === "INGREDIENT"),
  );
  out.audit = out.audit.filter((a) => a.action !== "MILL_CLOSE");
  const { store } = await db(t, f);
  await assert.rejects(store.persistState(null, out), "corrupt closure snapshot was accepted");
});

test("independent: mismatch requires explicit consent and preserves both formulas", () => {
  const f = journeyFixture();
  let s = apply(f.s, create(f.s, ["1"]), f.options).state;
  const planned = s.productionJourneyLines[0].micro_formula_id;
  s = apply(s, substitute(s), f.options).state;
  const next = confirmed(s, f.options, "ROSADO", "1");
  s = apply(next.s, link(next.s, next.s.productionJourneyLines[0].id, next.id, "1"), f.options).state;
  assert.notEqual(s.microConfirmations.at(-1).formula_id, planned);
  assert.throws(() => apply(s, close(s, 39), f.options), /diferencia/);
  const c = close(s, 39);
  c.payload.formula_consent = true;
  const out = apply(s, c, f.options).state;
  assert.equal(out.millClosures[0].formula_mismatch, true);
  assert.equal(out.productionJourneyLines[0].micro_formula_id, planned);
  assert.deepEqual(out.microConfirmations, s.microConfirmations);
});

test("independent: SQLite metadata rejection and missing macro roll back entire transaction", async (t) => {
  const f = ready();
  const { store, binding } = await db(t, f);
  await store.persistState(null, f.s);
  for (const mutate of [
    (s) => {
      s.millClosures[0].lot_complete = false;
    },
    (s) => {
      s.inventoryMovements = s.inventoryMovements.filter(
        (m) => !(m.source_type === "MILL_CLOSURE" && m.item_type === "INGREDIENT"),
      );
    },
  ]) {
    const out = apply(f.s, close(f.s, 39), f.options).state;
    mutate(out);
    const statements = writePlan(f.s, out).map((q) => binding.prepare(q.sql).bind(...q.args));
    await assert.rejects(binding.batch(statements));
    assert.deepEqual(
      await store.loadState(),
      f.s,
      "SQLite rejection must leave all tables/revision unchanged",
    );
  }
});
test("independent: closed record mutation is rejected before persistence", async (t) => {
  const f = ready();
  const { store } = await db(t, f);
  const out = apply(f.s, close(f.s, 39), f.options).state;
  await store.persistState(null, out);
  const changed = structuredClone(out);
  changed.millClosures[0].actual_bags = 38;
  changed.revision++;
  await assert.rejects(store.persistState(out, changed), /inmutable/);
  assert.deepEqual(await store.loadState(), out);
});
test("independent: inventory closure contributes to preexisting stock", async (t) => {
  const f = ready();
  const { store } = await db(t, f);
  await store.persistState(null, f.s);
  const prior = stock(f.s, "prod-1");
  assert.ok(prior.quantity > 0, "fixture must contain stock");
  const c = close(f.s, 39);
  const { state } = await store.runCommand(c, { userId: actor.id, displayName: actor.name });
  const after = stock(state, "prod-1");
  assert.equal(after.quantity, prior.quantity + 39);
  assert.equal(after.weight_kg, prior.weight_kg + 975000);
  assert.deepEqual(
    state.inventoryMovements.filter((m) => m.source_type !== "MILL_CLOSURE"),
    f.s.inventoryMovements,
  );
});
test("independent: effective micro mismatch also persists in SQLite", async (t) => {
  const f = journeyFixture();
  const { store } = await db(t, f);
  await store.persistState(null, f.s);
  let prior = f.s;
  let s = apply(prior, create(prior, ["1"]), f.options).state;
  await store.persistState(prior, s);
  prior = s;
  s = apply(s, substitute(s), f.options).state;
  await store.persistState(prior, s);
  prior = s;
  const next = confirmed(s, f.options, "ROSADO", "1");
  s = apply(next.s, link(next.s, next.s.productionJourneyLines[0].id, next.id, "1"), f.options).state;
  await store.persistState(prior, s);
  const c = close(s, 39);
  const identity = { userId: actor.id, displayName: actor.name };
  await assert.rejects(store.runCommand(c, identity), /diferencia/);
  assert.deepEqual(await store.loadState(), s);
  c.payload.formula_consent = true;
  const { state } = await store.runCommand(c, identity);
  assert.equal(state.millClosures[0].formula_mismatch, true);
  assert.deepEqual(state.microIssues, s.microIssues);
});
