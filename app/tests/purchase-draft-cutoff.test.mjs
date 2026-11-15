import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { seedState, executeCommand } from "../lib/domain.mjs";
import { payload, actor, identity } from "./helpers/receipt-fixture.mjs";
import { assertPurchaseRectificationIntegrity as integrity } from "../features/microinsumos/domain/purchase-rectifications.mjs";
import { initializeDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { createStore } from "../lib/application-store.mjs";
import { DatabaseSync } from "node:sqlite";

function run(s, type, payload) {
  const request_id = randomUUID();
  const out = executeCommand(
    s,
    { type, payload, request_id },
    actor,
    new Date(Date.UTC(2026, 10, 15, 18, 0, s.revision)).toISOString(),
  );
  Object.assign(out.state.audit.at(-1), { request_id, request_contract_version: 1 });
  integrity(s, out.state);
  return out;
}
function fixture() {
  let s = seedState();
  s.users = [actor];
  let out = run(s, "MICRO_SAVE", { operational_id: 1, name: "Micro sintetico HF01", is_active: true });
  s = out.state;
  const micro = out.result;
  const opening = {
    micro_ingredient_id: micro,
    quantity_kg: "0",
    unit_cost: "2",
    cutoff_date: "2026-10-30",
    measurement: "ESTIMATED",
    source: "Ensayo sintetico",
    notes: "",
  };
  out = run(s, "MICRO_OPEN", opening);
  s = out.state;
  const id = out.result;
  const draft = payload({
    status: "DRAFT",
    total: "20",
    lines: [{ micro_ingredient_id: micro, quantity_kg: "5", unit_price: "4", amount: "20", discount: "0" }],
  });
  out = run(s, "MICRO_RECEIPT_SAVE", draft);
  s = out.state;
  return { s, id, micro, opening, draft, receipt: out.result };
}
function correct(f, cutoff = "2026-10-29") {
  return run(f.s, "MICRO_CORRECT", {
    ...f.opening,
    id: f.id,
    expected_version: f.s.microOpenings[0].version,
    cutoff_date: cutoff,
    reason: "Correccion legal sintetica",
  }).state;
}
function confirmation(f) {
  return {
    type: "MICRO_RECEIPT_SAVE",
    request_id: randomUUID(),
    payload: {
      ...f.draft,
      status: "CONFIRMED",
      id: f.receipt,
      expected_version: f.s.microReceipts[0].version,
    },
  };
}
function confirmed() {
  const f = fixture();
  f.s = correct(f);
  const cmd = confirmation(f);
  return run(f.s, cmd.type, cmd.payload).state;
}

test("HF01: corte 30/10, borrador 01/11, correccion 29/10 y confirmacion conservan historia y stock", () => {
  const f = fixture();
  const saved = structuredClone(f.s.microReceiptLines[0]);
  f.s = correct(f);
  const cmd = confirmation(f);
  const after = run(f.s, cmd.type, cmd.payload).state;
  assert.deepEqual(after.microReceiptLines[0], { ...saved, is_current: false });
  assert.equal(after.microReceiptLines[1].cutoff_date_snapshot, "2026-10-29");
  assert.equal(after.microReceipts[0].status, "CONFIRMED");
  assert.equal(after.expenses.length, 1);
  assert.equal(after.microLedgers[0].ledger.quantity_grams, 5000);
  integrity(null, JSON.parse(JSON.stringify(after)));
  for (const key of ["sales", "productions", "inventoryMovements", "microIssues", "microReturns"])
    assert.deepEqual(after[key], f.s[key]);
});

test("HF01: cada version conserva su propio corte, incluso correccion que vuelve al original", () => {
  const f = fixture();
  f.s = correct(f);
  f.s = run(f.s, "MICRO_RECEIPT_SAVE", { ...f.draft, id: f.receipt, expected_version: 1 }).state;
  f.s = correct(f, "2026-10-28");
  f.s = run(f.s, "MICRO_RECEIPT_SAVE", { ...f.draft, id: f.receipt, expected_version: 2 }).state;
  f.s = correct(f, "2026-10-30");
  const cmd = confirmation(f);
  const after = run(f.s, cmd.type, cmd.payload).state;
  assert.deepEqual(
    after.microReceiptLines.map((l) => l.cutoff_date_snapshot),
    ["2026-10-30", "2026-10-29", "2026-10-28", "2026-10-30"],
  );
  after.audit.reverse();
  after.corrections.reverse();
  after.microReceiptLines.reverse();
  integrity(null, after);
});

test("HF01: corte vigente adelantado que cruza fecha documental rechaza sin mutacion", () => {
  for (const cutoff of ["2026-11-01", "2026-11-02"]) {
    const f = fixture();
    f.s = correct(f, cutoff);
    const before = structuredClone(f.s);
    const cmd = confirmation(f);
    assert.throws(() => run(f.s, cmd.type, cmd.payload), /posterior al corte/);
    assert.deepEqual(f.s, before);
  }
});

const corruptions = {
  cutoff: (s) => (s.microReceiptLines[0].cutoff_date_snapshot = "2026-10-27"),
  quantity: (s) => s.microReceiptLines[0].quantity_grams++,
  missingDraftAudit: (s) =>
    s.audit.splice(
      s.audit.findIndex((a) => a.payload.status === "DRAFT"),
      1,
    ),
  missingOpeningAudit: (s) =>
    s.audit.splice(
      s.audit.findIndex((a) => a.action === "MICRO_OPEN"),
      1,
    ),
  missingCorrectionAudit: (s) =>
    s.audit.splice(
      s.audit.findIndex((a) => a.action === "MICRO_CORRECT"),
      1,
    ),
  missingCorrection: (s) => s.corrections.splice(0),
  openingRevision: (s) => s.microOpenings[0].version++,
  correctionPayload: (s) =>
    (s.audit.find((a) => a.action === "MICRO_CORRECT").payload.cutoff_date = "2026-10-27"),
  originalPayload: (s) => (s.audit.find((a) => a.action === "MICRO_OPEN").payload.cutoff_date = "2026-10-27"),
  correctionOldSnapshot: (s) => (s.corrections[0].old_snapshot.cutoff_date = "2026-10-27"),
  originalOpeningId: (s) => (s.corrections[0].old_snapshot.id = "forged-opening"),
  forgedDraftTimestamp: (s) => {
    const a = s.audit.find((a) => a.payload.status === "DRAFT");
    a.created_at = "2026-11-15T18:10:00.000Z";
    s.microReceiptLines[0].created_at = a.created_at;
  },
  correctionTimestamp: (s) => (s.corrections[0].created_at = "2026-11-15T17:00:00.000Z"),
  draftActor: (s) => (s.audit.find((a) => a.payload.status === "DRAFT").created_by = "intruder"),
  correctionRole: (s) => (s.audit.find((a) => a.action === "MICRO_CORRECT").actor_role = "OPERATOR"),
};
for (const [name, mutate] of Object.entries(corruptions))
  test(`HF01 adversarial: ${name}`, () => {
    const s = confirmed();
    mutate(s);
    assert.throws(() => integrity(null, s));
  });

async function databaseFixture(t) {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp35-hf01-")), "private"));
  const file = join(root, "synthetic.sqlite");
  initializeDatabase(file);
  const c = openSqliteDatabase(file);
  t.after(() => c.close());
  const store = createStore(() => c);
  const f = fixture();
  await store.persistState(null, f.s);
  const correction = {
    type: "MICRO_CORRECT",
    request_id: randomUUID(),
    payload: {
      ...f.opening,
      id: f.id,
      expected_version: 1,
      cutoff_date: "2026-10-29",
      reason: "Correccion legal sintetica",
    },
  };
  await store.runCommand(correction, identity);
  f.s = await store.loadState();
  return { root, file, c, store, f };
}

test("HF01 SQLite: persistencia, replay dos conexiones, import adversarial, rollback y restore", async (t) => {
  const { root, file, store, f } = await databaseFixture(t);
  const c2 = openSqliteDatabase(file);
  t.after(() => c2.close());
  const b = createStore(() => c2),
    cmd = confirmation(f);
  await store.runCommand(cmd, identity);
  const after = await b.loadState();
  await b.runCommand(cmd, identity);
  assert.deepEqual(await b.loadState(), after);
  await assert.rejects(b.runCommand({ ...cmd, payload: { ...cmd.payload, total: "21" } }, identity));
  await assert.rejects(b.runCommand({ ...cmd, request_id: randomUUID() }, identity));
  const bad = structuredClone(after);
  bad.audit.splice(
    bad.audit.findIndex((a) => a.action === "MICRO_CORRECT"),
    1,
  );
  await assert.rejects(store.persistState(null, bad));
  assert.deepEqual(await store.loadState(), after);
  const backup = join(root, "backup.sqlite"),
    restored = join(root, "restored.sqlite");
  await backupDatabase(file, backup);
  await restoreDatabase(backup, restored);
  const r = openSqliteDatabase(restored);
  try {
    assert.deepEqual(await createStore(() => r).loadState(), after);
  } finally {
    r.close();
  }
  assert.ok(inspectDatabase(file));
  const inspection = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(inspection.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(inspection.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    inspection.close();
  }
});

test("HF01 SQLite: fallo en ultimo statement revierte confirmacion completa", async (t) => {
  const { c, store, f } = await databaseFixture(t);
  const before = await store.loadState();
  await c.batch([
    c.prepare(
      "CREATE TRIGGER fail_hf01 BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT,'synthetic hf01 rollback'); END",
    ),
  ]);
  await assert.rejects(store.runCommand(confirmation(f), identity), /synthetic hf01 rollback/);
  assert.deepEqual(await store.loadState(), before);
});

test("HF01 CAS: confirmacion tras MICRO_CORRECT en dos procesos con mismo y distinto request_id", async (t) => {
  for (const sameRequest of [true, false]) {
    const { file, store, f } = await databaseFixture(t);
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
    const cmd = confirmation(f);
    const commands = [cmd, sameRequest ? cmd : { ...cmd, request_id: randomUUID() }];
    const results = children.map((p) => once(p, "message"));
    children.forEach((p, i) => p.send(commands[i]));
    const outcomes = (await Promise.all(results)).map(([o]) => o);
    assert.equal(outcomes.filter((o) => o.saved).length, 1);
    const saved = await store.loadState();
    assert.equal(saved.expenses.length, 1);
    assert.equal(saved.microValuationEvents.length, 1);
    const winner = outcomes.findIndex((o) => o.saved);
    await store.runCommand(commands[winner], identity);
    if (!sameRequest) await assert.rejects(store.runCommand(commands[1 - winner], identity));
    assert.deepEqual(await store.loadState(), saved);
  }
});
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";

test("HF01 HTTP: confirmar borrador corregido conserva 401/403/409/422, roles, CSRF y replay", async (t) => {
  const { root, file, store, f } = await databaseFixture(t);
  const auth_database = join(root, "auth.sqlite"),
    password = randomUUID() + "Aa!";
  await provisionAuthentication(file, auth_database, "link", { user_id: actor.id, login: "hf01", password });
  const app = await createLocalServer({ database: file, auth_database, port: 0 });
  t.after(() => app.close());
  const url = await app.start();
  let cookie, csrf;
  const login = async () => {
    const res = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "hf01", password }),
    });
    assert.equal(res.status, 200);
    cookie = res.headers.get("set-cookie").split(";")[0];
    csrf = (await res.json()).csrf_token;
  };
  await login();
  const send = (command, token = csrf, authenticated = true) =>
    fetch(url + "/api/command", {
      method: "POST",
      headers: {
        origin: url,
        "content-type": "application/json",
        ...(authenticated ? { cookie } : {}),
        "x-csrf-token": token,
      },
      body: JSON.stringify(command),
    });
  const cmd = confirmation(f),
    before = await store.loadState();
  assert.equal((await send(cmd, csrf, false)).status, 401);
  assert.equal((await send(cmd, "incorrect-token")).status, 403);
  assert.equal((await send({ ...cmd, payload: { ...cmd.payload, total: "21" } })).status, 422);
  for (const role of ["OPERATOR", "VIEWER"]) {
    const old = await store.loadState(),
      next = structuredClone(old);
    next.users[0].role = role;
    next.revision++;
    await store.persistState(old, next);
    await login();
    assert.equal((await send(cmd)).status, 403);
    const denied = await store.loadState();
    assert.deepEqual(denied, next);
  }
  const old = await store.loadState(),
    next = structuredClone(old);
  next.users[0].role = "ADMIN";
  next.revision++;
  await store.persistState(old, next);
  await login();
  const response = await send(cmd);
  assert.equal(response.status, 200, await response.text());
  const after = await store.loadState();
  assert.equal(after.expenses.length, 1);
  assert.equal((await send(cmd)).status, 200);
  assert.equal(
    (await send({ ...cmd, payload: { ...cmd.payload, source: "Cambio de solicitud" } })).status,
    409,
  );
  const stateResponse = await fetch(url + "/api/state", { headers: { cookie } });
  assert.equal(stateResponse.status, 200);
  assert.deepEqual(await store.loadState(), after);
  assert.deepEqual(after.sales, before.sales);
  assert.deepEqual(after.productions, before.productions);
});

test("HF01: importacion rechaza timestamps coordinados fuera del orden documental aunque corte vuelva al original", () => {
  const f = fixture();
  f.s = correct(f);
  f.s = run(f.s, "MICRO_RECEIPT_SAVE", { ...f.draft, id: f.receipt, expected_version: 1 }).state;
  f.s = correct(f, "2026-10-30");
  const cmd = confirmation(f),
    original = run(f.s, cmd.type, cmd.payload).state;
  for (const version of [1, 2]) {
    const bad = structuredClone(original);
    const a = bad.audit.find(
      (a) =>
        a.action === "MICRO_RECEIPT_SAVE" &&
        a.payload.status === "DRAFT" &&
        (a.payload.expected_version ?? 0) === version - 1,
    );
    a.created_at = "2026-11-16T18:00:00.000Z";
    for (const line of bad.microReceiptLines.filter((l) => l.version === version))
      line.created_at = a.created_at;
    assert.throws(() => integrity(null, bad), /cronología/);
  }
  const bad = structuredClone(original);
  const first = bad.audit.find(
    (a) => a.action === "MICRO_RECEIPT_SAVE" && a.payload.status === "DRAFT" && !a.payload.expected_version,
  );
  const second = bad.audit.find((a) => a.action === "MICRO_RECEIPT_SAVE" && a.payload.expected_version === 1);
  const late = bad.audit.find((a) => a.payload.status === "CONFIRMED").created_at;
  first.created_at = late;
  bad.microReceipts[0].created_at = late;
  for (const line of bad.microReceiptLines.filter((l) => l.version === 1)) line.created_at = late;
  assert.ok(Date.parse(first.created_at) > Date.parse(second.created_at));
  assert.throws(() => integrity(null, bad), /cronología/);
});
