import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createValuation,
  applyValuation,
  inspectValuation,
  assertValuationOpening,
} from "../features/microinsumos/domain/valuation.mjs";
import { seedState, TABLES } from "../lib/domain.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { latestValuation, valuationSnapshot, saveSyntheticValuation } from "./helpers/valuation-sqlite.mjs";

// Independent reviewer scenarios and rational oracle; no implementation helpers imported.
const admin = { id: "review-admin", role: "ADMIN", name: "Revisión sintética", is_active: true };
const base = {
  id: "review-opening",
  micro_ingredient_id: "review-micro",
  version: 1,
  quantity_grams: 7000,
  unit_cost_cents: 137,
  cutoff_date: "2026-10-30",
};
function command(ledger, type, quantity_grams, total_cost_cents) {
  return {
    id: `review-${ledger.revision}`,
    request_id: `review-request-${ledger.revision}`,
    micro_ingredient_id: base.micro_ingredient_id,
    expected_revision: ledger.revision,
    date: "2026-11-02",
    type,
    quantity_grams,
    ...(type === "RECEIPT" ? { total_cost_cents } : {}),
  };
}
function ratio(n, d = BigInt(1)) {
  let x = n < 0 ? -n : n,
    y = d;
  while (y !== BigInt(0)) {
    const r = x % y;
    x = y;
    y = r;
  }
  return { n: n / x, d: d / x };
}
const plus = (a, b) => ratio(a.n * b.d + b.n * a.d, a.d * b.d);
const times = (a, n, d) => ratio(a.n * BigInt(n), a.d * BigInt(d));
const jsonRatio = (a) => ({ n: String(a.n), d: String(a.d) });

test("revisor NQP23: oráculo racional independiente, mezcla de recepciones y salidas, conservación exacta", () => {
  let ledger = createValuation(base, admin);
  let value = ratio(BigInt(959)),
    issued = ratio(BigInt(0)),
    acquired = value,
    quantity = 7000;
  const history = [];
  for (let index = 0; index < 24; index++) {
    const receive = index % 3 === 0;
    const grams = receive ? 13 + index : 7 + index;
    const cents = 3 + index;
    const input = command(ledger, receive ? "RECEIPT" : "ISSUE", grams, cents);
    if (receive) {
      value = plus(value, ratio(BigInt(cents)));
      acquired = plus(acquired, ratio(BigInt(cents)));
      quantity += grams;
    } else {
      const cost = times(value, grams, quantity);
      issued = plus(issued, cost);
      value = plus(value, { n: -cost.n, d: cost.d });
      quantity -= grams;
    }
    ledger = applyValuation(ledger, input, admin);
    assert.deepEqual(ledger.value_cents, jsonRatio(value));
    assert.deepEqual(ledger.issued_exact_cents, jsonRatio(issued));
    assert.equal(ledger.quantity_grams, quantity);
    assert.deepEqual(jsonRatio(plus(value, issued)), jsonRatio(acquired));
    assert.equal(JSON.stringify(ledger.events.slice(0, -1)), JSON.stringify(history));
    history.push(structuredClone(ledger.events.at(-1)));
  }
  ledger = applyValuation(ledger, command(ledger, "ISSUE", quantity), admin);
  assert.deepEqual(ledger.value_cents, { n: "0", d: "1" });
  assert.deepEqual(ledger.issued_exact_cents, jsonRatio(acquired));
});

test("revisor NQP23: medio céntimo, carry negativo y recuperación tras vaciar y recibir", () => {
  let ledger = createValuation({ ...base, quantity_grams: 1, unit_cost_cents: 500 }, admin);
  ledger = applyValuation(ledger, command(ledger, "ISSUE", 1), admin);
  assert.equal(ledger.events[0].snapshot.posted_cost_cents, "1");
  assert.deepEqual(ledger.rounding_carry_cents, { n: "-1", d: "2" });
  ledger = applyValuation(ledger, command(ledger, "RECEIPT", 2, 1), admin);
  ledger = applyValuation(ledger, command(ledger, "ISSUE", 1), admin);
  assert.equal(ledger.events[2].snapshot.posted_cost_cents, "0");
  ledger = applyValuation(ledger, command(ledger, "ISSUE", 1), admin);
  assert.equal(ledger.events[3].snapshot.posted_cost_cents, "1");
  assert.equal(ledger.issued_posted_cents, "2");
  assert.deepEqual(ledger.value_cents, { n: "0", d: "1" });
  assert.deepEqual(ledger.rounding_carry_cents, { n: "-1", d: "2" });
});

test("revisor NQP23: lectura no muta, identidad independiente, JSON corrupto y apertura alterada rechazados", () => {
  const ledger = createValuation(base, admin),
    original = JSON.stringify(ledger);
  const view = inspectValuation(ledger, { ...admin, role: "VIEWER" });
  view.opening.quantity_grams = 999;
  view.value_cents.n = "1000";
  assert.equal(JSON.stringify(ledger), original);
  const another = createValuation({ ...base, id: "other", micro_ingredient_id: "other-micro" }, admin);
  assert.throws(() => applyValuation(another, command(ledger, "ISSUE", 1), admin));
  const applied = applyValuation(ledger, command(ledger, "ISSUE", 1), admin);
  for (const mutate of [
    (x) => {
      x.revision++;
    },
    (x) => {
      x.events[0].snapshot.exact_cost_cents.n = "0";
    },
    (x) => {
      x.quantity_grams++;
    },
    (x) => {
      x.rounding_carry_cents.d = "0";
    },
    (x) => {
      x.contract_version = 2;
    },
  ]) {
    const corrupt = structuredClone(applied);
    mutate(corrupt);
    assert.throws(() => inspectValuation(corrupt, admin));
  }
  assert.throws(() => assertValuationOpening(applied, { ...base, version: 2 }, admin));
  assert.throws(() => applyValuation(applied, command(applied, "ISSUE", 1), { ...admin, is_active: false }));
});

test("revisor NQP23: límite racional rechaza atómicamente sin redondear", () => {
  let ledger = createValuation(base, admin),
    rejected = false;
  for (let index = 0; index < 150; index++) {
    const before = JSON.stringify(ledger);
    try {
      const received = applyValuation(ledger, command(ledger, "RECEIPT", 999983, 1), admin);
      ledger = applyValuation(received, command(received, "ISSUE", 999981), admin);
    } catch (error) {
      assert.match(error.message, /precisión/);
      assert.equal(JSON.stringify(ledger), before);
      rejected = true;
      break;
    }
  }
  assert.equal(rejected, true);
  assert.doesNotThrow(() => inspectValuation(ledger, admin));
});

test("revisor NQP23: no aceptar recepción cuyo promedio quedaría fuera de precisión", () => {
  let ledger = createValuation(base, admin);
  for (let index = 0; index < 56; index++) {
    ledger = applyValuation(ledger, command(ledger, "RECEIPT", 999983, 1), admin);
    ledger = applyValuation(ledger, command(ledger, "ISSUE", 999981), admin);
  }
  assert.equal(ledger.revision, 112);
  assert.equal(ledger.quantity_grams, 7112);
  assert.doesNotThrow(() => inspectValuation(ledger, admin));
  const before = JSON.stringify(ledger);
  assert.throws(() => applyValuation(ledger, command(ledger, "RECEIPT", 10000000000, 1), admin), /precisión/);
  assert.equal(JSON.stringify(ledger), before);
  assert.doesNotThrow(() => inspectValuation(ledger, admin));
});

test("revisor NQP23: reconstrucción en límite de 10.000 eventos y rechazo del siguiente", () => {
  const ledger = createValuation(base, admin);
  for (let revision = 0; revision < 10000; revision++) {
    const input = {
      id: `review-${revision}`,
      request_id: `review-request-${revision}`,
      micro_ingredient_id: base.micro_ingredient_id,
      type: "RECEIPT",
      date: "2026-11-02",
      quantity_grams: 1,
      expected_revision: revision,
      total_cost_cents: 0,
    };
    ledger.events.push({ input, actor_id: admin.id, revision: revision + 1, snapshot: null });
  }
  ledger.revision = 10000;
  ledger.quantity_grams += 10000;
  assert.equal(inspectValuation(ledger, admin).quantity_grams, 17000);
  const before = JSON.stringify(ledger);
  assert.throws(() => applyValuation(ledger, command(ledger, "ISSUE", 1), admin), /Límite/);
  assert.equal(JSON.stringify(ledger), before);
});

test("revisor NQP23 SQLite: recepción concurrente con IDs distintos, ganador único, retry obsoleto y tablas intactas", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp23-review-")), "private"));
  const filename = join(root, "review.sqlite");
  initializeDatabase(filename);
  const connection = openSqliteDatabase(filename),
    store = createStore(() => connection);
  t.after(() => connection.close());
  const state = seedState();
  state.users = [admin];
  state.microIngredients = [
    { id: base.micro_ingredient_id, operational_id: 18, name: "Revisión ficticia", is_active: true },
  ];
  state.microOpenings = [base];
  const seeded = valuationSnapshot(state, createValuation(base, admin), admin);
  await store.persistState(null, seeded);
  const helper = fileURLToPath(new URL("./helpers/valuation-sqlite.mjs", import.meta.url));
  const children = [0, 1].map(() =>
    fork(helper, ["valuation-race", filename], { stdio: ["ignore", "ignore", "ignore", "ipc"] }),
  );
  t.after(() => {
    for (const child of children) if (child.connected) child.kill();
  });
  await Promise.all(
    children.map(async (child) => assert.equal((await once(child, "message"))[0].ready, true)),
  );
  const commands = children.map((_, i) => ({
    ...command(latestValuation(seeded), "RECEIPT", 1000, 333),
    id: `race-${i}`,
    request_id: `race-request-${i}`,
  }));
  const replies = await Promise.all(
    children.map(async (child, i) => {
      const response = once(child, "message");
      child.send({ event: commands[i] });
      return (await response)[0];
    }),
  );
  assert.equal(replies.filter((reply) => reply.saved).length, 1);
  const after = await store.loadState();
  const ledger = latestValuation(after);
  assert.equal(ledger.quantity_grams, 8000);
  assert.deepEqual(ledger.value_cents, { n: "1292", d: "1" });
  const winner = commands[replies.findIndex((reply) => reply.saved)];
  assert.deepEqual(await saveSyntheticValuation(store, winner, admin), after);
  const loser = commands[replies.findIndex((reply) => !reply.saved)];
  await assert.rejects(saveSyntheticValuation(store, loser, admin), /obsoleta/);
  for (const name of TABLES.filter((name) => name !== "audit"))
    assert.deepEqual(after[name], seeded[name], name);
});
