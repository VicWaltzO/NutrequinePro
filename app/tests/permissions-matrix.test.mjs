import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { COMMAND_ROLES, assertCommandPermission } from "../shared/domain/permissions.mjs";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { substitutionFixture, substitute, plan, actor } from "./helpers/substitution-fixture.mjs";

// Independent baseline: existing administrative list plus the reconciliation domain guard.
const adminOnly = `COST_START COST_RECOGNIZE COST_SETTLE COST_ADJUST MICRO_FORMULA_SAVE
MICRO_FORMULA_ACTIVATE MICRO_RECEIPT_SAVE MICRO_RECEIPT_RECTIFY MICRO_PURCHASE_SAVE
MICRO_PURCHASE_CANCEL MICRO_SAVE MICRO_OPEN MICRO_CORRECT PRODUCT_SAVE INGREDIENT_SAVE
CONFIG_SAVE USER_SAVE SALE_CORRECT SALE_DELIVERY_DATE_UPDATE SALE_COVERAGE_ADOPT SALE_CANCEL
PAYMENT_REVERSE PRODUCTION_CONFIRM PRODUCTION_CLOSE PRODUCTION_CANCEL PRODUCTION_CORRECT
PRODUCTION_CORRECT_QUANTITIES INVENTORY_ADJUST EXPENSE_CANCEL PRODUCTION_RECONCILE`.split(/\s+/);

test("NQP37: every registered handler has exactly the approved effective roles; unknown types fail closed", () => {
  const source = readFileSync(new URL("../lib/execute-command.mjs", import.meta.url), "utf8");
  const block = source.slice(
    source.indexOf("const handlers = {"),
    source.indexOf("export function executeCommand"),
  );
  const types = [...block.matchAll(/^ {2}([A-Z_]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(Object.keys(COMMAND_ROLES).sort(), types);
  assert.equal(types.length, 55);
  for (const type of types) {
    for (const role of ["ADMIN", "OPERATOR", "VIEWER"]) {
      const allowed = role === "ADMIN" || (role === "OPERATOR" && !adminOnly.includes(type));
      const check = () => assertCommandPermission({ ...actor, role }, type);
      if (allowed) assert.doesNotThrow(check, type + role);
      else assert.throws(check, /administrador|consultar/, type + role);
    }
    assert.throws(() => assertCommandPermission({ ...actor, is_active: false }, type));
  }
  for (const type of ["FUTURE_WRITE", "toString", "__proto__", "", "micro_substitute"])
    for (const role of ["ADMIN", "OPERATOR", "VIEWER"])
      assert.throws(() => assertCommandPermission({ ...actor, role }, type));
  assert.throws(() => assertCommandPermission({ ...actor, role: "OWNER" }, "CUSTOMER_SAVE"));
});

async function fixture(t) {
  const dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp37-")), "private"));
  const database = join(dir, "synthetic.sqlite"),
    auth_database = join(dir, "auth.sqlite");
  initializeDatabase(database);
  const db = openSqliteDatabase(database),
    f = substitutionFixture();
  const store = createStore(() => db, f.options);
  const draft = structuredClone(f.s);
  draft.microFormulaHeads = [];
  for (const formula of draft.microFormulas) {
    formula.published_at = null;
    formula.published_by = null;
  }
  await store.persistState(null, draft);
  await store.persistState(draft, f.s);
  const password = randomUUID() + "Aa!";
  await provisionAuthentication(database, auth_database, "link", {
    login: "nqp37",
    user_id: actor.id,
    password,
  });
  const app = await createLocalServer({
    database,
    auth_database,
    port: 0,
    micro_preparation_policies: f.options.microPreparationPolicies,
    micro_substitution_policies: f.options.microSubstitutionPolicies,
  });
  const url = await app.start();
  const observer = new DatabaseSync(database, { readOnly: true });
  const tables = observer.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  const snapshot = () =>
    tables.map(({ name }) => [
      name,
      observer.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid').all(),
    ]);
  t.after(async () => {
    await app.close();
    observer.close();
    db.close();
  });
  async function login(role) {
    const before = await store.loadState(),
      next = structuredClone(before);
    next.users[0].role = role;
    next.revision++;
    await store.persistState(before, next);
    const r = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "nqp37", password }),
    });
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie").split(";")[0],
      csrf = (await r.json()).csrf_token;
    return {
      get: (path) => fetch(url + path, { headers: { cookie } }),
      send: (c, token = csrf, auth = true) =>
        fetch(url + "/api/command", {
          method: "POST",
          headers: {
            origin: url,
            "content-type": "application/json",
            ...(auth ? { cookie, "x-csrf-token": token } : {}),
          },
          body: JSON.stringify(c),
        }),
    };
  }
  async function rejected(session, c, status, ...args) {
    const before = snapshot(),
      r = await session.send(c, ...args);
    assert.equal(r.status, status, c.type + " " + (await r.text()));
    assert.deepEqual(snapshot(), before, "rejection changed SQLite: " + c.type);
  }
  return { ...f, dir, database, store, login, snapshot, rejected, observer };
}
const command = (type, payload = {}) => ({ type, payload, request_id: randomUUID() });

test("NQP37 HTTP: complete role denial matrix, GET purity, 401/403/422, unknown types and live session invalidation", async (t) => {
  const f = await fixture(t);
  for (const role of ["ADMIN", "OPERATOR", "VIEWER"]) {
    const session = await f.login(role);
    for (const path of ["/api/state", "/api/micro-preparations"]) {
      const before = f.snapshot();
      assert.equal((await session.get(path)).status, 200);
      assert.deepEqual(f.snapshot(), before);
    }
    for (const type of Object.keys(COMMAND_ROLES)) {
      if (role === "VIEWER" || (role === "OPERATOR" && adminOnly.includes(type)))
        await f.rejected(session, command(type), 403);
    }
    await f.rejected(session, command("FUTURE_WRITE"), 403);
    await f.rejected(session, command("CUSTOMER_SAVE", { name: "No CSRF" }), 403, "invalid");
    await f.rejected(session, command("CUSTOMER_SAVE", { name: "No auth" }), 401, "", false);
    if (role !== "VIEWER") {
      await f.rejected(session, command("CUSTOMER_SAVE", { name: "forged", role: "ADMIN" }), 422);
      const customer = command("CUSTOMER_SAVE", { name: "NQP37 " + role });
      const r = await session.send(customer);
      assert.equal(r.status, 200);
      const out = await r.json(),
        audit = out.state.audit.at(-1);
      assert.equal(audit.created_by, actor.id);
      assert.equal(audit.actor_role, role);
      assert.equal(audit.action, customer.type);
      assert.equal(audit.entity_id, out.result);
      assert.equal(audit.request_id, customer.request_id);
      assert.ok(Number.isFinite(Date.parse(audit.created_at)));
      const before = f.snapshot();
      assert.equal((await session.send(customer)).status, 200);
      assert.deepEqual(f.snapshot(), before);
      await f.rejected(session, { ...customer, payload: { name: "changed" } }, 409);
      const remove = command("CUSTOMER_DELETE", { id: out.result });
      assert.equal((await session.send(remove)).status, 200);
      const state = await f.store.loadState(),
        correction = state.corrections.at(-1);
      assert.equal(correction.entity_id, out.result);
      assert.equal(correction.old_snapshot.deleted_at, undefined);
      assert.ok(correction.new_snapshot.deleted_at);
    }
    // Previous session must stop working after the next role transition.
    const old = await f.store.loadState(),
      next = structuredClone(old);
    next.users[0].is_active = false;
    next.revision++;
    await f.store.persistState(old, next);
    await f.rejected(session, command("CUSTOMER_SAVE", { name: "inactive" }), 403);
    const inactive = await f.store.loadState(),
      active = structuredClone(inactive);
    active.users[0].is_active = true;
    active.revision++;
    await f.store.persistState(inactive, active);
  }
  assert.equal(f.observer.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(f.observer.prepare("PRAGMA foreign_key_check").all(), []);
});

test("NQP37 HTTP: ADMIN/OPERATOR substitutions require technical authorization, replay and stale revisions never write", async (t) => {
  const f = await fixture(t);
  for (const role of ["ADMIN", "OPERATOR"]) {
    const session = await f.login(role);
    const current = await f.store.loadState();
    await f.rejected(
      session,
      { ...substitute(current), payload: { ...substitute(current).payload, policy_id: "unapproved" } },
      422,
    );
    if (role === "ADMIN") {
      const create = plan(current);
      assert.equal((await session.send(create)).status, 200);
      await f.rejected(session, substitute(current), 422);
    }
    const state = await f.store.loadState();
    // One approved substitution consumes both formula heads; the operator performs it.
    if (role === "OPERATOR") {
      const c = substitute(state),
        r = await session.send(c);
      assert.equal(r.status, 200, await r.clone().text());
      const out = await r.json(),
        event = out.state.audit.at(-1);
      assert.equal(event.actor_role, "OPERATOR");
      assert.equal(event.action, "MICRO_SUBSTITUTE");
      assert.equal(event.request_id, c.request_id);
      assert.equal(out.state.microSubstitutions.at(-1).policy_id, "synthetic-25");
      const before = f.snapshot();
      assert.equal((await session.send(c)).status, 200);
      assert.deepEqual(f.snapshot(), before);
      await f.rejected(session, { ...c, payload: { ...c.payload, reason: "different" } }, 409);
    }
  }
});
