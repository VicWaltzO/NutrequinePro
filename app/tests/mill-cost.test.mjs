import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { ready, apply, closeCommand, actor } from "./helpers/mill-fixture.mjs";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { millChargeSnapshot } from "../features/produccion/domain/mill-charge.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { provisionAuthentication } from "../server/provision.mts";
import { createLocalServer } from "../server/application.mts";

import {
  millCostSummary,
  millCostHistory,
  millCostInputSnapshot,
  roundedCost,
} from "../features/produccion/domain/mill-cost.mjs";
import { journeyFixture, confirmed, create, link, substitute } from "./helpers/journey-fixture.mjs";
const identity = { userId: actor.id, displayName: actor.name };
const command = (s, packaging = "0", index = 0) => ({
  type: "MILL_COST_INPUT",
  request_id: crypto.randomUUID(),
  payload: {
    line_id: s.productionJourneyLines[index].id,
    packaging_amount: packaging,
    packaging_reference: "Comprobante sintético o cero confirmado",
    extras: [],
    reviewed_costs: true,
    reason: "Documentación sintética",
    expected_revision: s.revision,
  },
});
const reconcile = (s, index = 0, changes = []) => ({
  type: "MILL_RECONCILE",
  request_id: crypto.randomUUID(),
  payload: {
    line_id: s.productionJourneyLines[index].id,
    mode: "ACTUAL",
    changes,
    reason: "Comprobante sintético",
    expected_revision: s.revision,
  },
});
function closed(bags = 39, nuclei = "1") {
  const f = ready([nuclei]);
  f.s = apply(f.s, closeCommand(f.s, bags), f.options).state;
  f.s = apply(f.s, reconcile(f.s), f.options).state;
  return f;
}
async function database(t) {
  const f = closed();
  const dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp31-")), "private"));
  const file = join(dir, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db, f.options);
  await store.persistState(null, f.s);
  return { ...f, dir, file, db, store };
}
const summary = (s) => millCostSummary(s, s.productionJourneyLines[0].id);
const protectedTables = [
  "productionJourneyLines",
  "millClosures",
  "inventoryMovements",
  "microIssues",
  "microConfirmations",
  "microLedgers",
  "expenses",
  "payments",
  "productions",
  "productionCosts",
  "sales",
];
test("NQP31 40/39/38 costo estable, servicio una vez, merma en divisor exacto", () => {
  let total;
  for (const bags of [40, 39, 38]) {
    const f = closed(bags),
      before = structuredClone(f.s);
    f.s = apply(f.s, command(f.s, "44.00"), f.options).state;
    const cost = summary(f.s),
      charge = millChargeSnapshot(f.s.productionJourneyLines[0]);
    assert.equal(cost.complete, true);
    assert.equal(cost.service_cents, 25000);
    assert.equal(roundedCost(cost.total), roundedCost(cost.micro) + charge.actual_cents + 4400);
    assert.equal(
      BigInt(cost.unit.n) * BigInt(cost.total.d) * BigInt(bags),
      BigInt(cost.total.n) * BigInt(cost.unit.d),
    );
    if (total) assert.deepEqual(cost.total, total);
    total = cost.total;
    for (const table of protectedTables) assert.deepEqual(f.s[table], before[table], table);
  }
});
test("NQP31 desconocido, cero confirmado y cero sacos sin división o ingreso ficticio", () => {
  const f = closed(0, "0.01");
  assert.equal(summary(f.s).total, null);
  f.s = apply(f.s, command(f.s), f.options).state;
  assert.equal(summary(f.s).packaging_cents, 0);
  assert.ok(summary(f.s).total);
  assert.equal(summary(f.s).unit, null);
  assert.equal(summary(f.s).actual_bags, 0);
  assert.equal(
    f.s.inventoryMovements.filter((m) => m.source_type === "MILL_CLOSURE" && m.item_type === "PRODUCT")
      .length,
    0,
  );
  const open = ready(["1"]);
  assert.equal(summary(open.s).total, null);
  assert.throws(() => apply(open.s, command(open.s), open.options), /Cierre/);
});
test("NQP31 límites, nulos, negativos, revisión, redondeo exacto", () => {
  const f = closed();
  for (const value of [null, "", -1, "1e3", "0.001", "10000000001", Infinity])
    assert.throws(() => millCostInputSnapshot({ ...command(f.s).payload, packaging_amount: value }));
  for (const change of [
    { reviewed_costs: false },
    { packaging_reference: "" },
    { extras: null },
    { freight: 1 },
    { extras: [{ amount: "1", description: "x", reference: "" }] },
    { extras: [{ amount: "0", description: "x", reference: "a" }] },
    { extras: Array(21).fill({ amount: "1", description: "x", reference: "a" }) },
  ])
    assert.throws(() => millCostInputSnapshot({ ...command(f.s).payload, ...change }));
  assert.equal(roundedCost({ n: "1", d: "2" }), 1);
  assert.equal(roundedCost({ n: "149", d: "100" }), 1);
  assert.equal(roundedCost({ n: "150", d: "100" }), 2);
  assert.equal(roundedCost({ n: "999999999999", d: "1" }), 999999999999);
  for (const value of [
    { n: "9007199254740992", d: "1" },
    { n: "-1", d: "1" },
    { n: "1", d: "0" },
  ])
    assert.throws(() => roundedCost(value));
  assert.equal(roundedCost(null), null);
});
test("NQP31 tres productos independientes y total variable sin mutar históricos", () => {
  const f = ready();
  let s = f.s;
  for (let i = 0; i < 3; i++) {
    s = apply(s, closeCommand(s, [39, 38, 40][i], i), f.options).state;
    s = apply(s, reconcile(s, i), f.options).state;
    s = apply(s, command(s, String(i + 1), i), f.options).state;
  }
  const values = s.productionJourneyLines.map((l) => millCostSummary(s, l.id));
  assert.deepEqual(
    values.map((v) => v.actual_bags),
    [39, 38, 40],
  );
  assert.deepEqual(
    values.map((v) => v.packaging_cents),
    [100, 200, 300],
  );
  for (const [i, v] of values.entries())
    assert.equal(
      BigInt(v.unit.n) * BigInt(v.total.d) * BigInt([39, 38, 40][i]),
      BigInt(v.total.n) * BigInt(v.unit.d),
    );
  const before = structuredClone(s),
    original = summary(s);
  s = apply(
    s,
    reconcile(s, 0, [
      {
        ingredient_id: s.productionJourneyLines[0].macro_estimate[0].ingredient_id,
        quantity_kg: "2",
        price_per_kg: "99",
      },
    ]),
    f.options,
  ).state;
  assert.notDeepEqual(summary(s).total, original.total);
  assert.deepEqual(summary(before), original);
  assert.equal(summary(s).basis, "INFORMATIONAL_VARIABLE");
  for (const table of protectedTables) assert.deepEqual(s[table], before[table], table);
  const c = command(s, "0");
  c.payload.extras = [{ amount: "3.25", description: "Costo sintético directo", reference: "DOC-31" }];
  s = apply(s, c, f.options).state;
  assert.equal(summary(s).extras_cents, 325);
  assert.equal(summary(s).packaging_cents, 0);
  assert.equal(millCostHistory(s, s.productionJourneyLines[0].id).length, 2);
  assert.throws(() => apply(s, command(before), f.options), /cambiaron/);
  assert.throws(() => apply(s, command(s), f.options, { ...actor, role: "VIEWER" }), /consultar/);
});
test("NQP31 micro compartido 4+6 conserva suma racional", () => {
  const f = journeyFixture();
  let { s, id } = confirmed(f.s, f.options, "VERDE_AMARILLO");
  s = apply(s, create(s, ["1", "4", "6"]), f.options).state;
  for (const [i, n] of [
    [1, "4"],
    [2, "6"],
  ]) {
    s = apply(s, link(s, s.productionJourneyLines[i].id, id, n), f.options).state;
    s = apply(s, closeCommand(s, 39, i), f.options).state;
    s = apply(s, reconcile(s, i), f.options).state;
    s = apply(s, command(s, "0", i), f.options).state;
  }
  const [a, b] = [1, 2].map((i) => millCostSummary(s, s.productionJourneyLines[i].id).micro),
    total = s.microConfirmations[0].total_cost_cents;
  assert.equal(
    (BigInt(a.n) * BigInt(b.d) + BigInt(b.n) * BigInt(a.d)) * BigInt(total.d),
    BigInt(total.n) * BigInt(a.d) * BigInt(b.d),
  );
  assert.equal(s.microConfirmations.length, 1);
});
test("NQP31 mezcla 10+10 preserva ISSUE y fórmulas efectivas", () => {
  const f = journeyFixture();
  let { s, id: a } = confirmed(f.s, f.options);
  s = apply(s, substitute(s), f.options).state;
  const next = confirmed(s, f.options);
  s = next.s;
  s = apply(s, create(s, ["20"]), f.options).state;
  for (const id of [a, next.id])
    s = apply(s, link(s, s.productionJourneyLines[0].id, id, "10"), f.options).state;
  const c = closeCommand(s, 39);
  c.payload.formula_consent = true;
  s = apply(s, c, f.options).state;
  const original = structuredClone(s.microIssues);
  s = apply(s, reconcile(s), f.options).state;
  s = apply(s, command(s), f.options).state;
  const micro = summary(s).micro,
    [aCost, bCost] = s.microConfirmations.map((x) => x.total_cost_cents);
  assert.equal(
    BigInt(micro.n) * BigInt(aCost.d) * BigInt(bCost.d),
    (BigInt(aCost.n) * BigInt(bCost.d) + BigInt(bCost.n) * BigInt(aCost.d)) * BigInt(micro.d),
  );
  assert.deepEqual(s.microIssues, original);
});
test("NQP31 rollback por fallo SQL tardío de auditoría", async (t) => {
  const f = await database(t),
    raw = new DatabaseSync(f.file);
  t.after(() => raw.close());
  raw.exec(
    "CREATE TRIGGER fail_cost_audit BEFORE INSERT ON audit WHEN json_extract(NEW.data,'$.action')='MILL_COST_INPUT' BEGIN SELECT RAISE(ABORT,'late cost audit failure'); END",
  );
  const before = await f.store.loadState();
  await assert.rejects(f.store.runCommand(command(before), identity), /late cost audit failure/);
  assert.deepEqual(await f.store.loadState(), before);
  assert.deepEqual(raw.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(raw.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
});
test("NQP31 SQLite replay actor/payload, rollback tardío y auditoría, importación inmutable", async (t) => {
  const f = await database(t),
    c = command(f.s);
  const out = await f.store.runCommand(c, identity);
  assert.deepEqual(await f.store.runCommand(c, identity), out);
  await assert.rejects(
    f.store.runCommand({ ...c, payload: { ...c.payload, reason: "Otro" } }, identity),
    /identificador/,
  );
  await assert.rejects(f.store.runCommand(c, { userId: "mill-op" }), /global/);
  const before = await f.store.loadState();
  const next = apply(before, command(before, "1"), f.options).state;
  const plan = writePlan(before, next);
  plan.push({ sql: "INSERT INTO absent_table VALUES (?)", args: ["late"] });
  await assert.rejects(f.db.batch(plan.map((q) => f.db.prepare(q.sql).bind(...q.args))));
  assert.deepEqual(await f.store.loadState(), before);
  const noAudit = structuredClone(next);
  noAudit.audit.pop();
  await assert.rejects(f.store.persistState(before, noAudit), /auditoría/);
  const tampered = structuredClone(before);
  tampered.corrections.at(-1).new_snapshot.packaging_cents = 1;
  await assert.rejects(f.store.persistState(before, tampered), /inmutable/);
  await assert.rejects(f.store.persistState(null, tampered), /inválido/);
  assert.deepEqual(await f.store.loadState(), before);
});

test("NQP31 SQLite dos operadores/conexiones un ganador, sin doble hecho económico", async (t) => {
  const f = await database(t),
    db2 = openSqliteDatabase(f.file);
  t.after(() => db2.close());
  const results = await Promise.allSettled([
    f.store.runCommand(command(f.s), identity),
    createStore(() => db2, f.options).runCommand(command(f.s), { userId: "mill-op" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const after = await f.store.loadState();
  assert.equal(millCostHistory(after, f.s.productionJourneyLines[0].id).length, 1);
  assert.deepEqual(after.expenses, f.s.expenses);
  assert.deepEqual(after.inventoryMovements, f.s.inventoryMovements);
});

test("NQP31 dos procesos CAS y backup/restore en esquema existente", async (t) => {
  const f = await database(t);
  const children = [0, 1].map(() =>
    fork(new URL("./helpers/mill-race-worker.mjs", import.meta.url), [f.file], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    }),
  );
  t.after(() => children.forEach((c) => c.kill()));
  const prepared = children.map((c) => once(c, "message"));
  children.forEach((c) => c.send({ type: "prepare", command: command(f.s) }));
  await Promise.all(prepared);
  const outcomes = children.map((c) => once(c, "message"));
  children.forEach((c) => c.send({ type: "commit" }));
  assert.equal((await Promise.all(outcomes)).filter(([r]) => r.won).length, 1);
  const saved = await f.store.loadState();
  const backup = join(f.dir, "backup.sqlite");
  await backupDatabase(f.file, backup);
  const restored = join(f.dir, "restored.sqlite");
  await restoreDatabase(backup, restored);
  const db = openSqliteDatabase(restored);
  t.after(() => db.close());
  assert.deepEqual(await createStore(() => db, f.options).loadState(), saved);
});

test("NQP31 HTTP sesión, CSRF, OPERATOR/VIEWER, colisión409 y replay", async (t) => {
  const f = await database(t),
    auth = join(f.dir, "auth.sqlite"),
    password = crypto.randomUUID() + "Aa!";
  await provisionAuthentication(f.file, auth, "link", { login: "mill.admin", user_id: actor.id, password });
  const app = await createLocalServer({
    database: f.file,
    auth_database: auth,
    port: 0,
    micro_preparation_policies: f.options.microPreparationPolicies,
    micro_substitution_policies: f.options.microSubstitutionPolicies,
  });
  t.after(() => app.close());
  const url = await app.start();
  let cookie, csrf;
  const login = async () => {
    const r = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "mill.admin", password }),
    });
    assert.equal(r.status, 200);
    cookie = r.headers.get("set-cookie").split(";")[0];
    csrf = (await r.json()).csrf_token;
  };
  await login();
  const send = (c, token = csrf, authenticated = true) =>
    fetch(url + "/api/command", {
      method: "POST",
      headers: {
        origin: url,
        "content-type": "application/json",
        ...(authenticated ? { cookie, "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(c),
    });
  const c = command(f.s);
  assert.equal((await send(c, csrf, false)).status, 401);
  assert.equal((await send(c, "invalid")).status, 403);
  assert.equal((await send({ ...c, payload: { ...c.payload, reviewed_costs: false } })).status, 422);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send(c)).status, 200);
  assert.equal((await send({ ...c, payload: { ...c.payload, reason: "Colisión" } })).status, 409);
  let s = await f.store.loadState(),
    updated = structuredClone(s);
  updated.users.find((u) => u.id === actor.id).role = "OPERATOR";
  await f.store.persistState(s, updated);
  await login();
  assert.equal((await send(command(updated, "1"))).status, 200);
  s = await f.store.loadState();
  updated = structuredClone(s);
  updated.users.find((u) => u.id === actor.id).role = "VIEWER";
  await f.store.persistState(s, updated);
  await login();
  assert.equal((await send(command(updated))).status, 403);
  const beforeGet = await f.store.loadState();
  assert.equal((await fetch(url + "/api/state", { headers: { cookie } })).status, 200);
  assert.deepEqual(await f.store.loadState(), beforeGet);
  assert.equal(millCostHistory(await f.store.loadState(), f.s.productionJourneyLines[0].id).length, 2);
});
