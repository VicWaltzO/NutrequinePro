import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { apply35, buy35, empty35, rectify35, actor } from "./helpers/purchase-rectification-fixture.mjs";
import { identity, payload } from "./helpers/receipt-fixture.mjs";
import { journeyFixture, confirmed } from "./helpers/journey-fixture.mjs";
import { create, link } from "./helpers/journey-fixture.mjs";
import { closeCommand } from "./helpers/mill-fixture.mjs";
import { assertPurchaseRectificationIntegrity } from "../features/microinsumos/domain/purchase-rectifications.mjs";
import { inspectValuation, applyValuation } from "../features/microinsumos/domain/valuation.mjs";
import { initializeDatabase, migrateDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";

const integrity = (s) => assertPurchaseRectificationIntegrity(null, s);
test("35: compra usada en lote comercial cerrado conserva cierre y costo de producción", () => {
  const f = journeyFixture();
  f.s.microOpenings[0].quantity_grams = 0;
  f.s.microOpenings[0].valuation_cents = 0;
  const bought = buy35(f.s).state;
  const preparation = confirmed(bought, f.options, "ROSADO", "20");
  let s = apply35(preparation.s, create(preparation.s, ["20"]), f.options).state;
  s = apply35(s, link(s, s.productionJourneyLines[0].id, preparation.id, "20"), f.options).state;
  s = apply35(s, closeCommand(s), f.options).state;
  const after = apply35(s, rectify35(s), f.options).state;
  integrity(after);
  assert.equal(s.millClosures.length, 1);
  for (const table of [
    "millClosures",
    "productionJourneyLines",
    "productionJourneyLinks",
    "microIssues",
    "microConfirmations",
    "inventoryMovements",
    "productionCosts",
    "sales",
    "saleItems",
  ])
    assert.deepEqual(after[table], s[table], table);
  assert.equal(after.microLedgers[0].ledger.quantity_grams, 14000);
});
test("35: 25→20 conserva originales, aplica -5kg/-S50 una vez, gasto e identidad únicos y dos versiones", () => {
  const original = buy35(empty35()).state,
    before = structuredClone(original);
  const after = apply35(original, rectify35(original)).state;
  integrity(after);
  assert.deepEqual(original, before);
  assert.equal(after.microLedgers[0].ledger.quantity_grams, 20000);
  assert.deepEqual(after.microLedgers[0].ledger.value_cents, { n: "20000", d: "1" });
  assert.deepEqual(after.microLedgers[0].ledger.events[0], before.microLedgers[0].ledger.events[0]);
  assert.equal(after.microLedgers[0].ledger.events[1].input.quantity_grams, -5000);
  assert.equal(after.expenses.length, 1);
  assert.equal(after.expenses[0].id, before.expenses[0].id);
  assert.equal(after.expenses[0].amount, 20000);
  for (const key of [
    "id",
    "document_key",
    "supplier",
    "reference",
    "document_date",
    "expense_id",
    "request_id",
  ])
    assert.equal(after.microReceipts[0][key], before.microReceipts[0][key]);
  assert.deepEqual(
    after.microReceiptLines.map((l) => [l.version, l.quantity_grams, l.is_current]),
    [
      [1, 25000, false],
      [2, 20000, true],
    ],
  );
  const twice = apply35(
    after,
    rectify35(after, {
      total: "220",
      lines: [
        { micro_ingredient_id: "m1", quantity_kg: "22", unit_price: "10", amount: "220", discount: "0" },
      ],
    }),
  ).state;
  integrity(twice);
  assert.equal(twice.microLedgers[0].ledger.quantity_grams, 22000);
  assert.equal(twice.expenses.length, 1);
});
test("35: consumo confirmado previo conserva ISSUE y costo congelado y ajusta únicamente remanente", () => {
  const f = journeyFixture();
  f.s.microOpenings[0].quantity_grams = 0;
  f.s.microOpenings[0].valuation_cents = 0;
  const purchased = buy35(f.s).state;
  const used = confirmed(purchased, f.options, "ROSADO", "20").s;
  const after = apply35(used, rectify35(used), f.options).state;
  integrity(after);
  assert.equal(after.microLedgers[0].ledger.quantity_grams, 14000);
  assert.deepEqual(after.microLedgers[0].ledger.value_cents, { n: "14000", d: "1" });
  for (const table of [
    "microIssues",
    "microConfirmations",
    "productions",
    "productionCosts",
    "millClosures",
    "sales",
    "saleItems",
    "inventoryMovements",
  ])
    assert.deepEqual(after[table], used[table]);
  assert.deepEqual(after.microLedgers[0].ledger.events.slice(0, 2), used.microLedgers[0].ledger.events);
});
test("35: precio solo y factura multirrenglón, descuento explícito y logística separada", () => {
  const s = buy35(empty35(), payload()).state;
  const cmd = rectify35(s, {
    total: "23",
    discount: "1",
    lines: [{ ...payload().lines[0], unit_price: "3.20", amount: "16", discount: "1" }, payload().lines[1]],
  });
  const after = apply35(s, cmd).state;
  integrity(after);
  assert.equal(after.microLedgers[0].ledger.quantity_grams, s.microLedgers[0].ledger.quantity_grams);
  assert.deepEqual(after.microLedgers[1], s.microLedgers[1]);
  assert.equal(after.microLedgers[0].ledger.events.at(-1).input.quantity_grams, 0);
  assert.equal(after.expenses.length, 1);
  assert.equal(after.expenses[0].amount, 2300);
  const withFreight = apply35(after, {
    type: "EXPENSE_CREATE",
    request_id: randomUUID(),
    payload: { date: "2026-11-15", category: "LOGISTICS", description: "Flete sintético", amount: "5" },
  }).state;
  assert.deepEqual(withFreight.microLedgers, after.microLedgers);
  integrity(withFreight);
});
test("35: imposibles, campos extra, identidad y duplicados rechazan sin mutación", () => {
  const s = buy35(empty35()).state,
    before = structuredClone(s);
  for (const extra of [
    { supplier: "Otro" },
    { expected_revision: s.revision - 1 },
    { expected_version: 0 },
    { reason: " " },
    { reference: " " },
    { date: "2026-10-31" },
    { date: "2027-01-01" },
    { total: "199" },
    { discount: "1" },
    { lines: [] },
    { lines: [...rectify35(s).payload.lines, ...rectify35(s).payload.lines] },
  ])
    assert.throws(() => apply35(s, rectify35(s, extra)));
  for (const role of ["OPERATOR", "VIEWER"])
    assert.throws(() => apply35(s, rectify35(s), {}, { ...actor, role }), /administrador|consultar/);
  assert.deepEqual(s, before);
  const ledger = structuredClone(s.microLedgers[0].ledger);
  const used = applyValuation(
    ledger,
    {
      id: "synthetic-issue",
      request_id: "synthetic-issue",
      micro_ingredient_id: "m1",
      type: "ISSUE",
      date: "2026-11-02",
      quantity_grams: 23000,
      expected_revision: 1,
    },
    actor,
  );
  s.microLedgers[0].ledger = used;
  assert.throws(() => apply35(s, rectify35(s)), /Saldo libre/);
  const negative = buy35(empty35()).state;
  negative.microLedgers[0].ledger = applyValuation(
    negative.microLedgers[0].ledger,
    {
      id: "large-issue",
      request_id: "large-issue",
      micro_ingredient_id: "m1",
      type: "ISSUE",
      date: "2026-11-02",
      quantity_grams: 20000,
      expected_revision: 1,
    },
    actor,
  );
  assert.throws(
    () =>
      apply35(
        negative,
        rectify35(negative, {
          total: "25",
          lines: [
            { micro_ingredient_id: "m1", quantity_kg: "25", unit_price: "1", amount: "25", discount: "0" },
          ],
        }),
      ),
    /Saldo inconsistente/,
  );
});
test("35: compromisos bloquean reducción, cantidad cero monetaria válida y costo desconocido no inventado", () => {
  const f = journeyFixture();
  f.s.microOpenings[0].quantity_grams = 0;
  f.s.microOpenings[0].valuation_cents = 0;
  let s = buy35(f.s).state;
  const formula = s.microFormulaHeads.find((h) => h.family === "ROSADO").active_formula_id;
  const plan = apply35(
    s,
    {
      type: "MICRO_PREPARATION_CREATE",
      request_id: randomUUID(),
      payload: {
        family: "ROSADO",
        formula_id: formula,
        nuclei: "80",
        date: "2026-11-09",
        expected_revision: s.revision,
      },
    },
    f.options,
  );
  s = plan.state;
  s = apply35(
    s,
    {
      type: "MICRO_ASSIGN",
      request_id: randomUUID(),
      payload: { preparation_id: plan.result, reason: "Compromiso sintético", expected_revision: s.revision },
    },
    f.options,
  ).state;
  assert.throws(() => apply35(s, rectify35(s), f.options), /comprometidos/);
  const zero = buy35(empty35(), {
    total: "0",
    lines: [{ micro_ingredient_id: "m1", quantity_kg: "25", unit_price: "0", amount: "0", discount: "0" }],
  }).state;
  const next = apply35(
    zero,
    rectify35(zero, {
      total: "0",
      lines: [{ micro_ingredient_id: "m1", quantity_kg: "20", unit_price: "0", amount: "0", discount: "0" }],
    }),
  ).state;
  integrity(next);
  assert.deepEqual(next.microLedgers[0].ledger.value_cents, { n: "0", d: "1" });
  assert.throws(() =>
    apply35(
      zero,
      rectify35(zero, {
        lines: [
          { micro_ingredient_id: "m1", quantity_kg: "20", unit_price: null, amount: "0", discount: "0" },
        ],
      }),
    ),
  );
});
test("35: importaciones adulteradas o huérfanas y reordenadas", () => {
  const s = buy35(empty35()).state,
    after = apply35(s, rectify35(s)).state;
  integrity(after);
  for (const mutate of [
    (s) => s.corrections.splice(0),
    (s) => s.audit.splice(-1),
    (s) => s.expenses[0].amount++,
    (s) => s.microReceiptLines[0].quantity_grams++,
    (s) => (s.microReceipts[0].reference = "Otra"),
    (s) => s.corrections.at(-1).new_snapshot.differences[0].cost_delta_cents++,
    (s) => s.corrections.at(-1).old_snapshot.receipt.total_cents++,
    (s) => (s.audit.at(-1).payload.total = "199"),
    (s) => (s.audit.at(-1).actor_role = "OPERATOR"),
    (s) => (s.microLedgers[0].ledger.events.at(-1).actor_id = "otro"),
  ]) {
    const bad = structuredClone(after);
    mutate(bad);
    assert.throws(() => integrity(bad));
  }
  const reordered = structuredClone(after);
  for (const key of ["corrections", "audit", "microReceiptLines"]) reordered[key].reverse();
  integrity(reordered);
});
test("35 SQLite: upgrade0011, replay durable, CAS dos conexiones, rollback final, import y backup-restauración", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp35-db-")), "private"));
  const file = join(root, "synthetic.sqlite"),
    cat = migrationCatalog(),
    old = { ...cat, migrations: cat.migrations.slice(0, 12), schemas: cat.schemas.slice(0, 13) };
  initializeDatabase(file, { catalog: old });
  let c = openSqliteDatabase(file);
  const original = buy35(empty35()).state;
  await c.batch(writePlan(null, original).map((r) => c.prepare(r.sql).bind(...r.args)));
  c.close();
  const oldbackup = join(root, "before.sqlite");
  await backupDatabase(file, oldbackup, { catalog: old });
  migrateDatabase(file);
  c = openSqliteDatabase(file);
  const c2 = openSqliteDatabase(file);
  t.after(() => {
    c.close();
    c2.close();
  });
  const a = createStore(() => c),
    b = createStore(() => c2),
    cmd = rectify35(original);
  await a.runCommand(cmd, identity);
  const after = await a.loadState();
  await b.runCommand(cmd, identity);
  assert.deepEqual(await b.loadState(), after);
  await assert.rejects(b.runCommand({ ...cmd, payload: { ...cmd.payload, total: "199" } }, identity));
  for (const sameRequest of [true, false]) {
    const state = await a.loadState();
    const one = rectify35(state, {
      total: "210",
      lines: [
        { micro_ingredient_id: "m1", quantity_kg: "21", unit_price: "10", amount: "210", discount: "0" },
      ],
    });
    const two = sameRequest ? one : { ...one, request_id: randomUUID() };
    const outcomes = await Promise.allSettled([a.runCommand(one, identity), b.runCommand(two, identity)]);
    assert.ok(outcomes.some((o) => o.status === "fulfilled"));
    const next = await a.loadState();
    assert.equal(next.expenses.length, 1);
    await b.runCommand(one, identity);
    assert.deepEqual(await b.loadState(), next);
    if (sameRequest) {
      const back = rectify35(next);
      await a.runCommand(back, identity);
    }
  }
  const before = await a.loadState();
  const out = apply35(before, rectify35(before)).state;
  await c.batch([
    c.prepare(
      "CREATE TRIGGER fail35 BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT,'synthetic final failure'); END",
    ),
  ]);
  await assert.rejects(a.persistState(before, out), /synthetic final failure/);
  assert.deepEqual(await a.loadState(), before);
  await c.batch([c.prepare("DROP TRIGGER fail35")]);
  const backup = join(root, "after.sqlite"),
    restored = join(root, "restored.sqlite");
  await backupDatabase(file, backup);
  await restoreDatabase(backup, restored);
  const r = openSqliteDatabase(restored);
  assert.deepEqual(await createStore(() => r).loadState(), before);
  r.close();
  assert.ok(inspectDatabase(file));
  const imported = join(root, "import.sqlite");
  initializeDatabase(imported);
  const ic = openSqliteDatabase(imported);
  await createStore(() => ic).persistState(null, before);
  ic.close();
  console.log("NQP26-35 SQLite evidence", root, "integrity/FK/backup/import PASS");
});
test("35 SQLite: dos procesos con revisión idéntica y request igual/distinto, replay tras reinicio", async (t) => {
  for (const sameRequest of [true, false]) {
    const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp35-process-")), "private"));
    const file = join(root, "test.sqlite");
    initializeDatabase(file);
    let c = openSqliteDatabase(file);
    const st = createStore(() => c);
    const s = buy35(empty35()).state;
    await st.persistState(null, s);
    c.close();
    const children = [0, 1].map(() =>
      fork(new URL("./helpers/receipt-process.mjs", import.meta.url), [file], {
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      }),
    );
    t.after(() =>
      children.forEach((p) => {
        if (p.connected) p.kill();
      }),
    );
    await Promise.all(children.map((p) => once(p, "message")));
    const command = rectify35(s),
      commands = [command, sameRequest ? command : { ...command, request_id: randomUUID() }];
    const results = children.map((p) => once(p, "message"));
    children.forEach((p, i) => p.send(commands[i]));
    const outcomes = (await Promise.all(results)).map(([o]) => o);
    assert.equal(outcomes.filter((o) => o.saved).length, 1);
    c = openSqliteDatabase(file);
    try {
      const a = createStore(() => c);
      const before = await a.loadState();
      assert.equal(before.microLedgers[0].ledger.quantity_grams, 20000);
      if (sameRequest) await a.runCommand(command, identity);
      else await assert.rejects(a.runCommand(commands[outcomes.findIndex((o) => !o.saved)], identity));
      assert.deepEqual(await a.loadState(), before);
    } finally {
      c.close();
    }
  }
});
test("35 HTTP: sesión/CSRF/ADMIN, 401/403/409/422, GET sin escritura y replay", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp35-http-")), "private"));
  const database = join(root, "test.sqlite"),
    auth_database = join(root, "auth.sqlite");
  initializeDatabase(database);
  const c = openSqliteDatabase(database);
  const store = createStore(() => c);
  const initial = buy35(empty35()).state;
  await store.persistState(null, initial);
  c.close();
  const password = randomUUID() + "Aa!";
  await provisionAuthentication(database, auth_database, "link", {
    user_id: actor.id,
    login: "test35",
    password,
  });
  const app = await createLocalServer({ database, auth_database, port: 0 });
  t.after(() => app.close());
  const url = await app.start();
  const login = await fetch(url + "/api/auth/login", {
    method: "POST",
    headers: { origin: url, "content-type": "application/json" },
    body: JSON.stringify({ login: "test35", password }),
  });
  let cookie = login.headers.get("set-cookie").split(";")[0],
    csrf = (await login.json()).csrf_token;
  const send = (command, token = csrf, auth = true) =>
    fetch(url + "/api/command", {
      method: "POST",
      headers: {
        origin: url,
        "content-type": "application/json",
        ...(auth ? { cookie } : {}),
        "x-csrf-token": token,
      },
      body: JSON.stringify(command),
    });
  const get = async () => (await (await fetch(url + "/api/state", { headers: { cookie } })).json()).state;
  const cmd = rectify35(initial);
  assert.equal((await send(cmd, csrf, false)).status, 401);
  assert.equal((await send(cmd, "bad")).status, 403);
  const before = await get();
  assert.deepEqual(await get(), before);
  assert.equal((await send(rectify35(initial, { total: "199" }))).status, 422);
  const response = await send(cmd);
  assert.equal(response.status, 200, await response.text());
  const after = await get();
  assert.equal((await send(cmd)).status, 200);
  assert.equal(
    (await send({ ...cmd, payload: { ...cmd.payload, reason: "Solicitud alterada" } })).status,
    409,
  );
  assert.deepEqual(await get(), after);
  const stale = await send({ ...cmd, request_id: randomUUID() });
  assert.ok([409, 422].includes(stale.status));
  assert.deepEqual(await get(), after);
  for (const role of ["OPERATOR", "VIEWER"]) {
    const db = openSqliteDatabase(database),
      st = createStore(() => db),
      old = await st.loadState(),
      next = structuredClone(old);
    next.users[0].role = role;
    next.revision++;
    await st.persistState(old, next);
    db.close();
    const relogin = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "test35", password }),
    });
    cookie = relogin.headers.get("set-cookie").split(";")[0];
    const roleCsrf = (await relogin.json()).csrf_token;
    assert.equal((await send(rectify35(next), roleCsrf)).status, 403);
  }
});
test("35 valoración: 0.01g/0.5g/1g históricos, carry intacto y ajuste prospectivo exacto", () => {
  let ledger = buy35(empty35()).state.microLedgers[0].ledger;
  for (const q of [1, 50, 100])
    ledger = applyValuation(
      ledger,
      {
        id: `small-${q}`,
        request_id: `small-${q}`,
        micro_ingredient_id: "m1",
        type: "ISSUE",
        date: "2026-11-02",
        quantity_hundredths: q,
        expected_revision: ledger.revision,
      },
      actor,
    );
  const before = structuredClone(ledger);
  ledger = applyValuation(
    ledger,
    {
      id: "adj35",
      request_id: "adj35",
      micro_ingredient_id: "m1",
      type: "PURCHASE_ADJUSTMENT",
      date: "2026-11-15",
      quantity_grams: -5000,
      cost_delta_cents: -5000,
      receipt_id: "synthetic35",
      expected_revision: ledger.revision,
    },
    actor,
  );
  assert.deepEqual(ledger.events.slice(0, -1), before.events);
  assert.deepEqual(ledger.rounding_carry_cents, before.rounding_carry_cents);
  assert.equal(inspectValuation(ledger, actor).quantity_hundredths, 1999849);
});
