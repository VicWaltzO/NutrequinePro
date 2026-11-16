import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { executeCommand } from "../lib/domain.mjs";
import { preparationOverview } from "../features/microinsumos/domain/preparations.mjs";
import { effectivePreparationPolicies } from "../features/microinsumos/domain/substitutions.mjs";
import { preparationFixture, command, plan } from "./helpers/preparation-fixture.mjs";
import { actor, payload } from "./helpers/receipt-fixture.mjs";
import { substitutionFixture, substitute, adopt } from "./helpers/substitution-fixture.mjs";
import { ready, closeCommand } from "./helpers/mill-fixture.mjs";
import { rectificationFixture, rectify, apply34 } from "./helpers/rectification-fixture.mjs";
import { buy35, rectify35, apply35 } from "./helpers/purchase-rectification-fixture.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { provisionAuthentication } from "../server/provision.mts";
import { createLocalServer } from "../server/application.mts";
const apply = (s, c, options) => executeCommand(s, c, actor, "2026-11-15T20:00:00.000Z", options);
const overview = (s, options = {}) =>
  preparationOverview(
    s,
    effectivePreparationPolicies(
      s,
      options.microPreparationPolicies ?? [],
      options.microSubstitutionPolicies ?? [],
    ),
    "2026-11-15T20:00:00.000Z",
  );
const alerts = (s, options) => overview(s, options).alerts;
const preventive = (s, options, id = "m1") =>
  alerts(s, options).preventive.items.find((i) => i.micro_ingredient_id === id);
const assign = (s, id, options) =>
  apply(
    s,
    command("MICRO_ASSIGN", {
      preparation_id: id,
      reason: "Ensayo sintetico",
      expected_revision: s.revision,
    }),
    options,
  ).state;
const confirm = (s, id, nuclei, options) =>
  apply(
    s,
    command("MICRO_PREPARATION_CONFIRM", {
      preparation_id: id,
      nuclei,
      date: "2026-11-15",
      expected_revision: s.revision,
    }),
    options,
  ).state;
function publish(s, options, family, lines) {
  const saved = apply(
    s,
    command("MICRO_FORMULA_SAVE", {
      family,
      expected_version: s.microFormulaHeads.find((h) => h.family === family)?.version ?? 0,
      lines,
    }),
    options,
  );
  s = apply(
    saved.state,
    command("MICRO_FORMULA_ACTIVATE", {
      family,
      formula_id: saved.result,
      expected_version: saved.state.microFormulaHeads.find((h) => h.family === family).version,
    }),
    options,
  ).state;
  options.microPreparationPolicies.push({
    family,
    formula_id: saved.result,
    reference: "Solo sintetico",
    lines: s.microFormulaLines
      .filter((l) => l.formula_id === saved.result)
      .map((l) => ({ micro_ingredient_id: l.micro_ingredient_id, dose_grams: l.dose_grams })),
  });
  return s;
}
test("NQP36: maximo, igualdad, ingrediente exclusivo, activacion e historico sin mutaciones", () => {
  const f = preparationFixture();
  const before = structuredClone(f.s);
  assert.deepEqual(
    alerts(f.s, f.options).preventive.items.map((i) => [i.minimum_hundredths, i.missing_hundredths]),
    [
      [600000, 100000],
      [2000, 0],
    ],
  );
  assert.deepEqual(f.s, before);
  let s = apply(f.s, plan(f.s), f.options).state;
  const order = structuredClone(s.microPreparations[0]);
  s = publish(s, f.options, "ROSADO", [{ micro_ingredient_id: "m2", dose_kg: "0.002" }]);
  assert.equal(preventive(s, f.options).minimum_hundredths, 200000);
  assert.equal(preventive(s, f.options, "m2").minimum_hundredths, 4000);
  assert.equal(alerts(s, f.options).by_order[0].items[0].required_hundredths, 600000);
  assert.deepEqual(s.microPreparations[0], order);
  const saved = apply(
    s,
    command("MICRO_FORMULA_SAVE", {
      family: "ROSADO",
      expected_version: 4,
      lines: [{ micro_ingredient_id: "m1", dose_kg: "1" }],
    }),
    f.options,
  ).state;
  assert.deepEqual(alerts(saved, f.options), alerts(s, f.options));
});
test("NQP36: sustitucion excluye preventivo agotado, mantiene orden original y excluye supersedida", () => {
  const f = substitutionFixture();
  f.s.microOpenings[0].quantity_grams = 0;
  f.s.microOpenings[0].valuation_cents = 0;
  let s = apply(f.s, plan(f.s), f.options).state;
  const id = s.microPreparations[0].id;
  s = apply(s, substitute(s), f.options).state;
  assert.equal(preventive(s, f.options), undefined);
  assert.equal(preventive(s, f.options, "m3").minimum_hundredths, 274000);
  assert.equal(alerts(s, f.options).by_order[0].items[0].micro_ingredient_id, "m1");
  s = apply(s, adopt(s, id), f.options).state;
  assert.equal(
    alerts(s, f.options).by_order.some((a) => a.preparation_id === id),
    false,
  );
});
test("NQP36: ledger exacto, igualdad y deficit 0.01g tras confirmacion", () => {
  const f = preparationFixture();
  let s = publish(f.s, f.options, "ROSADO", [{ micro_ingredient_id: "m2", dose_kg: "0.001" }]);
  s = publish(s, f.options, "VERDE_AMARILLO", [{ micro_ingredient_id: "m2", dose_kg: "0.001" }]);
  s.microOpenings[1].quantity_grams = 20;
  s.microOpenings[1].valuation_cents = 4;
  assert.equal(preventive(s, f.options, "m2").status, "COVERED");
  s = apply(s, plan(s, { nuclei: "0.01" }), f.options).state;
  s = assign(s, s.microPreparations[0].id, f.options);
  s = confirm(s, s.microPreparations[0].id, "0.01", f.options);
  const i = preventive(s, f.options, "m2");
  assert.equal(i.physical_hundredths, 1999);
  assert.equal(i.missing_hundredths, 1);
  assert.equal(i.stock_source, "LEDGER");
  assert.deepEqual(alerts(s, f.options).by_order, []);
});
test("NQP36: compromisos propios/terceros, reversion, cierre parcial sin doble descuento", () => {
  const f = preparationFixture();
  let s = apply(f.s, plan(f.s, { nuclei: "10" }), f.options).state;
  const own = s.microPreparations[0].id;
  s = apply(s, plan(s, { nuclei: "10" }), f.options).state;
  const other = s.microPreparations[1].id;
  assert.equal(alerts(s, f.options).by_order.length, 0);
  s = assign(s, own, f.options);
  assert.deepEqual(
    alerts(s, f.options).by_order.map((a) => [a.preparation_id, a.items[0].missing_hundredths]),
    [[other, 100000]],
  );
  assert.equal(preventive(s, f.options).physical_hundredths, 500000);
  s = apply(
    s,
    command("MICRO_ASSIGNMENT_REVERSE", {
      assignment_id: s.microAssignments[0].id,
      reason: "Liberacion sintetica",
      expected_revision: s.revision,
    }),
    f.options,
  ).state;
  assert.equal(alerts(s, f.options).by_order.length, 0);
  s = assign(s, own, f.options);
  s = confirm(s, own, "8", f.options);
  assert.equal(preventive(s, f.options).physical_hundredths, 260000);
  assert.deepEqual(
    alerts(s, f.options).by_order.map((a) => [a.preparation_id, a.items[0].missing_hundredths]),
    [[other, 40000]],
  );
});
test("NQP36: compra y rectificacion 25 a 20; no cambian ISSUE ni costos", () => {
  const f = preparationFixture();
  let s = buy35(f.s).state;
  assert.equal(preventive(s, f.options).physical_hundredths, 3000000);
  const issues = structuredClone(s.microIssues),
    costs = structuredClone(s.productionCosts);
  s = apply35(s, rectify35(s)).state;
  assert.equal(preventive(s, f.options).physical_hundredths, 2500000);
  assert.deepEqual(s.microIssues, issues);
  assert.deepEqual(s.productionCosts, costs);
});
test("NQP36: RETURN recuperable cambia fisico, AUDIT_ONLY no devuelve", () => {
  const f = rectificationFixture();
  const before = preventive(f.s, f.options).physical_hundredths;
  let s = apply34(f.s, rectify(f.s), f.options).state;
  assert.equal(preventive(s, f.options).physical_hundredths, before + 60000);
  const closed = ready(["1"]);
  closed.s = apply34(closed.s, closeCommand(closed.s), closed.options).state;
  const physical = preventive(closed.s, closed.options).physical_hundredths;
  const id = closed.s.productionJourneyLinks[0].preparation_id;
  s = apply34(closed.s, rectify(closed.s, "8", { recoverable: false }, id), closed.options).state;
  assert.equal(preventive(s, closed.options).physical_hundredths, physical);
});
test("NQP36 HTTP/SQLite: roles, GET puro y fresco tras compra, 401/403 y CAS", async (t) => {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp36-http-")), "private"));
  const database = join(root, "synthetic.sqlite"),
    auth_database = join(root, "auth.sqlite");
  initializeDatabase(database);
  const db = openSqliteDatabase(database),
    f = preparationFixture(),
    draft = structuredClone(f.s);
  draft.microFormulaHeads = [];
  for (const formula of draft.microFormulas) {
    formula.published_at = null;
    formula.published_by = null;
  }
  const store = createStore(() => db, f.options);
  await store.persistState(null, draft);
  await store.persistState(draft, f.s);
  const password = randomUUID() + "Aa!";
  await provisionAuthentication(database, auth_database, "link", {
    user_id: actor.id,
    login: "alerts",
    password,
  });
  const app = await createLocalServer({
    database,
    auth_database,
    port: 0,
    micro_preparation_policies: f.policies,
  });
  t.after(async () => {
    await app.close();
    db.close();
  });
  const url = await app.start();
  assert.equal((await fetch(url + "/api/micro-preparations")).status, 401);
  for (const role of ["ADMIN", "OPERATOR", "VIEWER"]) {
    const old = await store.loadState(),
      changed = structuredClone(old);
    changed.users[0].role = role;
    changed.revision++;
    await store.persistState(old, changed);
    const login = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login: "alerts", password }),
    });
    const cookie = login.headers.get("set-cookie").split(";")[0],
      csrf = (await login.json()).csrf_token;
    const read = async () => {
      const before = await store.loadState();
      const r = await fetch(url + "/api/micro-preparations", { headers: { cookie } });
      assert.equal(r.status, 200);
      const out = await r.json();
      assert.deepEqual(await store.loadState(), before);
      assert.equal(out.revision, before.revision);
      return out;
    };
    assert.equal((await read()).alerts.preventive.items[0].minimum_hundredths, 600000);
    const send = (c, token = csrf) =>
      fetch(url + "/api/command", {
        method: "POST",
        headers: { origin: url, cookie, "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify(c),
      });
    if (role === "ADMIN") {
      assert.equal((await send(command("MICRO_RECEIPT_SAVE", payload()), "bad")).status, 403);
      assert.equal((await send(plan(await store.loadState()))).status, 200);
      assert.equal((await read()).alerts.by_order.length, 1);
      const buy = command("MICRO_RECEIPT_SAVE", payload());
      assert.equal((await send(buy)).status, 200);
      const after = await store.loadState(),
        out = await read();
      assert.equal(out.alerts.by_order.length, 0);
      assert.equal(out.alerts.preventive.items[0].status, "COVERED");
      assert.equal((await send(buy)).status, 200);
      assert.deepEqual(await store.loadState(), after);
      assert.equal((await send(plan({ ...after, revision: after.revision - 1 }))).status, 422);
    } else assert.equal((await send(command("MICRO_RECEIPT_SAVE", payload()))).status, 403);
  }
  const inspect = new DatabaseSync(database, { readOnly: true });
  try {
    assert.equal(inspect.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(inspect.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    inspect.close();
  }
});

test("NQP36: 0.01g, 0.5g, 1g y 20 nucleos mantienen unidades; cero y costo desconocido", () => {
  const f = preparationFixture();
  f.s.microOpenings[1].quantity_grams = 0;
  f.s.microOpenings[1].unit_cost_cents = null;
  f.s.microOpenings[1].valuation_cents = null;
  for (const [nuclei, expected] of [
    ["0.01", 1],
    ["0.50", 50],
    ["1", 100],
    ["20", 2000],
  ]) {
    const s = apply(f.s, plan(f.s, { nuclei }), f.options).state;
    const i = alerts(s, f.options).by_order[0].items.find((item) => item.micro_ingredient_id === "m2");
    assert.equal(i.missing_hundredths, expected);
    assert.equal(i.stock_source, "OPENING");
  }
});

test("NQP36: familias sin cabeza, receta incompleta, duplicada o ID14 no inventan suficiencia", () => {
  for (const kind of ["head", "policy", "duplicate", "reserved", "inactive"]) {
    const f = preparationFixture();
    const formula = f.s.microFormulaHeads[0].active_formula_id;
    if (kind === "head") f.s.microFormulaHeads.shift();
    if (kind === "policy") f.options.microPreparationPolicies[0].lines.pop();
    if (kind === "duplicate")
      f.s.microFormulaLines.push({ ...f.s.microFormulaLines.find((l) => l.formula_id === formula) });
    if (kind === "reserved") f.s.microIngredients[0].operational_id = 14;
    if (kind === "inactive") f.s.microIngredients[0].is_active = false;
    const a = alerts(f.s, f.options).preventive;
    assert.ok(a.unavailable_families.includes("ROSADO"), kind);
  }
});
