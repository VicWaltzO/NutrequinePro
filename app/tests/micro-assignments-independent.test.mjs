import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedState, executeCommand, TABLES } from "../lib/domain.mjs";
import { createStore } from "../lib/application-store.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { evaluatePreparation } from "../features/microinsumos/domain/preparations.mjs";
const actor = {
  id: "independent-operator",
  name: "Operador sintético independiente",
  role: "OPERATOR",
  is_active: true,
};
const admin = { ...actor, role: "ADMIN" };
const identity = { userId: actor.id, displayName: actor.name };
const cmd = (type, payload) => ({ type, payload, request_id: randomUUID() });
function fixture() {
  let s = seedState();
  s.users = [actor];
  const apply = (type, payload) => {
    const next = executeCommand(s, cmd(type, payload), admin);
    s = next.state;
    return next.result;
  };
  const ids = [1, 2].map((operational_id) =>
    apply("MICRO_SAVE", {
      operational_id,
      name: `Independiente sintético ${operational_id}`,
      is_active: true,
    }),
  );
  for (const id of ids)
    apply("MICRO_OPEN", {
      micro_ingredient_id: id,
      quantity_kg: "0.020",
      measurement: "REAL",
      cutoff_date: "2026-10-01",
      source: "Ensayo independiente sintético",
      unit_cost: "1",
    });
  const formula = apply("MICRO_FORMULA_SAVE", {
    family: "ROSADO",
    expected_version: 0,
    lines: ids.map((id) => ({ micro_ingredient_id: id, dose_kg: "0.001" })),
  });
  apply("MICRO_FORMULA_ACTIVATE", { family: "ROSADO", expected_version: 1, formula_id: formula });
  const options = {
    microPreparationPolicies: [
      {
        formula_id: formula,
        family: "ROSADO",
        reference: "Aprobación sintética independiente",
        lines: ids.map((id) => ({ micro_ingredient_id: id, dose_grams: 1 })),
      },
    ],
  };
  for (let i = 0; i < 2; i++)
    s = executeCommand(
      s,
      cmd("MICRO_PREPARATION_CREATE", {
        family: "ROSADO",
        formula_id: formula,
        nuclei: "15",
        date: "2026-11-09",
        expected_revision: s.revision,
      }),
      actor,
      undefined,
      options,
    ).state;
  return { s, ids, options };
}
function assign(s, id, more = {}) {
  return cmd("MICRO_ASSIGN", {
    preparation_id: id,
    reason: "Elegir orden expresamente",
    expected_revision: s.revision,
    ...more,
  });
}
function reverse(s, id) {
  return cmd("MICRO_ASSIGNMENT_REVERSE", {
    assignment_id: id,
    reason: "Liberar sin consumo",
    expected_revision: s.revision,
  });
}
async function persisted(t) {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp27-independent-")), "private"));
  const file = join(root, "synthetic.sqlite");
  initializeDatabase(file);
  const a = openSqliteDatabase(file),
    b = openSqliteDatabase(file);
  t.after(() => {
    a.close();
    b.close();
  });
  const f = fixture(),
    draft = structuredClone(f.s);
  draft.microPreparations = [];
  draft.microFormulaHeads = [];
  for (const formula of draft.microFormulas) {
    formula.published_at = null;
    formula.published_by = null;
  }
  const sa = createStore(() => a, f.options),
    sb = createStore(() => b, f.options);
  await sa.persistState(null, draft);
  const published = structuredClone(f.s);
  published.microPreparations = [];
  await sa.persistState(draft, published);
  await sa.persistState(published, f.s);
  return { ...f, a, b, sa, sb, root };
}
test("independiente27: operador elige B, 20/15/5 exactos, rechazo A y tablas protegidas intactas", () => {
  const { s, options } = fixture();
  const next = executeCommand(s, assign(s, s.microPreparations[1].id), actor, undefined, options).state;
  const e = evaluatePreparation(next, next.microPreparations[0], "synthetic-now");
  assert.deepEqual(
    e.items.map((i) => [
      i.physical_hundredths,
      i.assigned_hundredths,
      i.available_hundredths,
      i.missing_hundredths,
    ]),
    [
      [2000, 1500, 500, 1000],
      [2000, 1500, 500, 1000],
    ],
  );
  assert.throws(
    () => executeCommand(next, assign(next, next.microPreparations[0].id), actor, undefined, options),
    /insuficiente/,
  );
  assert.throws(
    () => executeCommand(next, assign(next, next.microPreparations[1].id), actor, undefined, options),
    /ya tiene/,
  );
  for (const table of TABLES.filter(
    (t) => !["microAssignments", "microAssignmentLines", "audit"].includes(t),
  ))
    assert.deepEqual(next[table], s[table], table);
});
test("independiente27: reversión única libera todo, reasignación conserva historial y sin política no compromete", () => {
  const { s, options } = fixture();
  const assigned = executeCommand(s, assign(s, s.microPreparations[1].id), actor, undefined, options);
  const released = executeCommand(
    assigned.state,
    reverse(assigned.state, assigned.result),
    actor,
    undefined,
    options,
  ).state;
  assert.equal(
    evaluatePreparation(released, released.microPreparations[0], "now").items[0].available_hundredths,
    2000,
  );
  assert.throws(
    () => executeCommand(released, reverse(released, assigned.result), actor, undefined, options),
    /revertida/,
  );
  assert.throws(
    () => executeCommand(released, assign(released, released.microPreparations[0].id), actor),
    /política/,
  );
  const next = executeCommand(
    released,
    assign(released, released.microPreparations[0].id),
    actor,
    undefined,
    options,
  ).state;
  assert.equal(next.microAssignments.length, 2);
  assert.equal(next.microAssignmentReversals.length, 1);
  assert.deepEqual(next.microPreparations, s.microPreparations);
});
test("independiente27: payload cerrado, cero autoridad VIEWER y política/dosis exactas", () => {
  const { s, options } = fixture(),
    id = s.microPreparations[0].id;
  for (const more of [
    { quantity_hundredths: 1 },
    { expected_revision: s.revision - 1 },
    { reason: "" },
    { preparation_id: s.microFormulas[0].id },
  ])
    assert.throws(() => executeCommand(s, assign(s, id, more), actor, undefined, options));
  assert.throws(
    () => executeCommand(s, assign(s, id), { ...actor, role: "VIEWER" }, undefined, options),
    /consultar/,
  );
  const wrong = structuredClone(options);
  wrong.microPreparationPolicies[0].lines[0].dose_grams = 2;
  assert.throws(() => executeCommand(s, assign(s, id), actor, undefined, wrong), /política/);
  const inactive = structuredClone(s);
  inactive.microIngredients[1].is_active = false;
  assert.throws(() => executeCommand(inactive, assign(inactive, id), actor, undefined, options), /inactivo/);
});
test("independiente27 SQLite: carrera dos conexiones, replay tras pérdida de respuesta y actor diferente", async (t) => {
  const f = await persisted(t);
  const a = assign(f.s, f.s.microPreparations[0].id),
    b = assign(f.s, f.s.microPreparations[1].id);
  const results = await Promise.allSettled([f.sa.runCommand(a, identity), f.sb.runCommand(b, identity)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const s = await f.sa.loadState(),
    accepted = s.audit.at(-1);
  assert.equal(s.microAssignments.length, 1);
  assert.equal(s.microAssignmentLines.length, 2);
  const replay = { type: accepted.action, payload: accepted.payload, request_id: accepted.request_id };
  assert.deepEqual((await f.sb.runCommand(replay, identity)).state, s);
  await assert.rejects(
    f.sb.runCommand({ ...replay, payload: { ...replay.payload, reason: "Otro motivo" } }, identity),
    /identificador/,
  );
  const other = structuredClone(s);
  other.users.push({ ...actor, id: "independent-other" });
  other.revision++;
  await f.sa.persistState(s, other);
  await assert.rejects(
    f.sb.runCommand(replay, { userId: "independent-other", displayName: "Otro sintético" }),
    /global/,
  );
});
test("independiente27 SQLite: FK/cantidad tardía revierte lote, compensaciones e historial inmutables", async (t) => {
  const f = await persisted(t),
    before = await f.sa.loadState();
  const proposed = executeCommand(
    before,
    assign(before, before.microPreparations[0].id),
    actor,
    undefined,
    f.options,
  ).state;
  for (const mutate of [
    (s) => {
      s.microAssignmentLines.at(-1).formula_line_id = "missing";
    },
    (s) => {
      s.microAssignmentLines.at(-1).quantity_hundredths++;
    },
    (s) => {
      s.microAssignmentLines.at(-1).micro_ingredient_id = s.microAssignmentLines[0].micro_ingredient_id;
    },
  ]) {
    const bad = structuredClone(proposed);
    mutate(bad);
    await assert.rejects(f.sa.persistState(before, bad));
    assert.deepEqual(await f.sa.loadState(), before);
  }
  const committed = await f.sa.runCommand(assign(before, before.microPreparations[0].id), identity);
  for (const table of ["micro_assignments", "micro_assignment_lines"])
    for (const sql of [`DELETE FROM ${table}`, `UPDATE ${table} SET data='{}'`])
      await assert.rejects(f.a.batch([f.a.prepare(sql)]));
  const released = await f.sa.runCommand(reverse(committed.state, committed.result), identity);
  for (const sql of [
    "DELETE FROM micro_assignment_reversals",
    "UPDATE micro_assignment_reversals SET data='{}'",
  ])
    await assert.rejects(f.a.batch([f.a.prepare(sql)]));
  assert.deepEqual(await f.sa.loadState(), released.state);
  writeFileSync(
    join(f.root, "independent-result.json"),
    JSON.stringify({ tests: "independent SQLite atomicity and immutable compensation", synthetic: true }),
  );
});
test("independiente27: frontera exacta 0.01g nunca desaparece por redondeo", () => {
  const { s, options } = fixture();
  s.microOpenings.forEach((o) => {
    o.quantity_grams = 1;
  });
  s.microPreparations[0].nuclei_hundredths = 99;
  s.microPreparations[1].nuclei_hundredths = 1;
  const first = executeCommand(s, assign(s, s.microPreparations[0].id), actor, undefined, options).state;
  const edge = evaluatePreparation(first, first.microPreparations[1], "now");
  assert.equal(edge.items[0].available_hundredths, 1);
  assert.equal(edge.items[0].required_hundredths, 1);
  const full = executeCommand(
    first,
    assign(first, first.microPreparations[1].id),
    actor,
    undefined,
    options,
  ).state;
  assert.equal(evaluatePreparation(full, full.microPreparations[0], "now").items[0].available_hundredths, 0);
  const third = executeCommand(
    full,
    cmd("MICRO_PREPARATION_CREATE", {
      family: "ROSADO",
      formula_id: full.microPreparations[0].formula_id,
      nuclei: "0.01",
      date: "2026-11-09",
      expected_revision: full.revision,
    }),
    actor,
    undefined,
    options,
  ).state;
  assert.equal(evaluatePreparation(third, third.microPreparations[2], "now").items[0].missing_hundredths, 1);
  assert.throws(
    () => executeCommand(third, assign(third, third.microPreparations[2].id), actor, undefined, options),
    /faltan 1 centésimas/,
  );
});
test("independiente27 SQLite: trigger de saldo libre bloquea persister defectuoso y revierte cabecera", async (t) => {
  const f = await persisted(t);
  const accepted = await f.sa.runCommand(assign(f.s, f.s.microPreparations[0].id), identity);
  const before = accepted.state,
    proposed = structuredClone(before),
    assignmentId = randomUUID();
  proposed.revision++;
  proposed.microAssignments.push({
    ...before.microAssignments[0],
    id: assignmentId,
    request_id: randomUUID(),
    preparation_id: before.microPreparations[1].id,
  });
  proposed.microAssignmentLines.push(
    ...before.microAssignmentLines.map((l) => ({ ...l, id: randomUUID(), assignment_id: assignmentId })),
  );
  await assert.rejects(f.sa.persistState(before, proposed), /Insufficient free micro stock/);
  assert.deepEqual(await f.sa.loadState(), before);
});
test("independiente27: fórmula nueva no sustituye orden histórica ni sus cantidades asignadas", () => {
  const { s, options, ids } = fixture();
  const order = structuredClone(s.microPreparations[0]);
  const draft = executeCommand(
    s,
    cmd("MICRO_FORMULA_SAVE", {
      family: "ROSADO",
      expected_version: 2,
      lines: ids.map((id) => ({ micro_ingredient_id: id, dose_kg: "0.002" })),
    }),
    admin,
    undefined,
    options,
  );
  const newer = executeCommand(
    draft.state,
    cmd("MICRO_FORMULA_ACTIVATE", { family: "ROSADO", formula_id: draft.result, expected_version: 3 }),
    admin,
    undefined,
    options,
  ).state;
  const assigned = executeCommand(newer, assign(newer, order.id), actor, undefined, options).state;
  assert.deepEqual(assigned.microPreparations[0], order);
  assert.equal(assigned.microAssignmentLines.length, 2);
  assert.ok(
    assigned.microAssignmentLines.every(
      (l) =>
        l.quantity_hundredths === 1500 &&
        assigned.microFormulaLines.find((f) => f.id === l.formula_line_id).formula_id === order.formula_id,
    ),
  );
  assert.equal(assigned.microFormulaHeads[0].active_formula_id, draft.result);
});
test("independiente27: apertura no baja del compromiso y reversión sin política libera exactamente", async (t) => {
  const f = await persisted(t);
  const accepted = await f.sa.runCommand(assign(f.s, f.s.microPreparations[0].id), identity);
  const before = accepted.state,
    opening = before.microOpenings[0];
  const correction = cmd("MICRO_CORRECT", {
    id: opening.id,
    expected_version: opening.version,
    quantity_kg: "0.005",
    cutoff_date: opening.cutoff_date,
    measurement: "REAL",
    source: "Corrección sintética independiente",
    unit_cost: "1",
    reason: "Ensayo de saldo insuficiente",
  });
  assert.throws(() => executeCommand(before, correction, admin, undefined, f.options), /por debajo/);
  const defective = structuredClone(before);
  defective.microOpenings[0].quantity_grams = 5;
  defective.revision++;
  await assert.rejects(f.sa.persistState(before, defective), /Opening below assigned stock/);
  assert.deepEqual(await f.sa.loadState(), before);
  const noPolicyStore = createStore(() => f.a);
  const released = await noPolicyStore.runCommand(reverse(before, accepted.result), identity);
  assert.equal(
    evaluatePreparation(released.state, released.state.microPreparations[0], "now").items[0]
      .available_hundredths,
    2000,
  );
  const corrected = executeCommand(released.state, correction, admin).state;
  assert.equal(corrected.microOpenings[0].quantity_grams, 5);
  assert.deepEqual(corrected.microPreparations, before.microPreparations);
});
test("independiente27 SQLite: request_id global cruza comando/actor y no recicla compromiso revertido", async (t) => {
  const f = await persisted(t),
    original = assign(f.s, f.s.microPreparations[0].id);
  const accepted = await f.sa.runCommand(original, identity);
  const reverseWithReusedId = {
    ...reverse(accepted.state, accepted.result),
    request_id: original.request_id,
  };
  await assert.rejects(f.sa.runCommand(reverseWithReusedId, identity), /identificador/);
  const other = structuredClone(accepted.state);
  other.users.push({ ...admin, id: "global-other" });
  other.revision++;
  await f.sa.persistState(accepted.state, other);
  await assert.rejects(
    f.sa.runCommand(
      {
        type: "MICRO_SAVE",
        request_id: original.request_id,
        payload: { operational_id: 3, name: "Nunca creado", is_active: true },
      },
      { userId: "global-other", displayName: "Otro" },
    ),
    /global/,
  );
  const released = await f.sa.runCommand(reverse(other, accepted.result), identity);
  const replay = await f.sa.runCommand(original, identity);
  assert.deepEqual(replay.state, released.state);
  assert.equal(
    evaluatePreparation(replay.state, replay.state.microPreparations[0], "now").assignment_status,
    "UNASSIGNED",
  );
  const reassigned = await f.sa.runCommand(
    assign(replay.state, replay.state.microPreparations[0].id),
    identity,
  );
  assert.equal(reassigned.state.microAssignments.length, 2);
  assert.equal(reassigned.state.microAssignmentReversals.length, 1);
});
