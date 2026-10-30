import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { diskFixture, persistenceTest } from "./helpers/persistence-fixtures.mjs";
import {
  regressionFixture,
  rejectsWithoutChange,
  adminIdentity,
  salePayload,
} from "./helpers/regression-scenarios.mjs";
import { customerDuplicateReview } from "../features/clientes/domain/name-matches.mjs";

const accepted = (state, name, id) => ({
  name,
  ...(id ? { id } : {}),
  confirm_duplicate: true,
  duplicate_review: customerDuplicateReview(state.customers, name, id),
});

persistenceTest("D09-08/09/10/11/12/13/14/15/20: confirmación vigente, edición e historial", async (t) => {
  const f = await regressionFixture(t);
  const original = "Gonzálo Andrade";
  const first = await f.run("CUSTOMER_SAVE", { name: original, tax_id: "SINTETICO", site_ids: ["site-1"] });
  await f.run("SALE_SAVE", salePayload(first));
  const beforeHistory = await f.state();
  for (const confirm_duplicate of [undefined, false, "true", 1, {}, null]) {
    await rejectsWithoutChange(
      f,
      () => f.run("CUSTOMER_SAVE", { name: "Gonzalo-Andrade", confirm_duplicate }),
      /duplicado|Indicador/,
    );
  }
  await rejectsWithoutChange(
    f,
    () => f.run("CUSTOMER_SAVE", { name: "Gonzalo Andrade", confirm_duplicate: true }),
    /coincidencias/,
  );
  const payload = accepted(await f.state(), "Gonzalo Andrade");
  const second = await f.run("CUSTOMER_SAVE", payload);
  const beforeStale = await f.state();
  await rejectsWithoutChange(f, () => f.run("CUSTOMER_SAVE", payload), /coincidencias/);
  await rejectsWithoutChange(
    f,
    () => f.run("CUSTOMER_SAVE", { ...accepted(beforeStale, "Gonzalo Andrade"), name: "GONZALO ANDRADE" }),
    /coincidencias/,
  );
  // An edit of the first record excludes itself, but still acknowledges the other homonym.
  await f.run("CUSTOMER_SAVE", {
    ...accepted(await f.state(), original, first),
    tax_id: "SINTETICO",
    site_ids: ["site-1"],
  });
  const distinct = await f.run("CUSTOMER_SAVE", { name: "Persona sin relación" });
  await f.run("CUSTOMER_SAVE", { id: distinct, name: "Persona sin relación" });
  await rejectsWithoutChange(f, () => f.run("CUSTOMER_SAVE", { id: distinct, name: original }), /duplicado/);
  await f.run("CUSTOMER_DELETE", { id: second });
  const retired = await f.state();
  await rejectsWithoutChange(
    f,
    () => f.run("CUSTOMER_SAVE", accepted(beforeStale, "Gonzalo Andrade")),
    /coincidencias/,
  );
  const third = await f.run("CUSTOMER_SAVE", accepted(retired, "Gonzalo Andrada"));
  const state = await f.state();
  assert.equal(state.customers.find((x) => x.id === first).name, original);
  assert.equal(state.customers.find((x) => x.id === third).name, "Gonzalo Andrada");
  assert.notEqual(first, second);
  assert.deepEqual(state.sales, beforeHistory.sales);
  assert.deepEqual(state.saleItems, beforeHistory.saleItems);
  assert.deepEqual(
    state.customerSites.filter((x) => x.customer_id === first),
    beforeHistory.customerSites.filter((x) => x.customer_id === first),
  );
  const audit = state.audit.find((x) => x.entity_id === third);
  assert.equal(audit.payload.confirm_duplicate, true);
  assert.equal(audit.payload.duplicate_review, accepted(retired, "Gonzalo Andrada").duplicate_review);
});

test("D09-17: dos conexiones SQLite y confirmación obsoleta nunca guardan un candidato inadvertido", async (t) => {
  let other;
  t.after(() => other?.close());
  const db = diskFixture(t);
  other = openSqliteDatabase(db.filename);
  const a = createStore(() => db.binding);
  const b = createStore(() => other);
  await a.ensureState(adminIdentity);
  const run = (store, payload) =>
    store.runCommand({ type: "CUSTOMER_SAVE", payload, request_id: randomUUID() }, adminIdentity);
  const outcomes = await Promise.allSettled([
    run(a, { name: "Valentina Mendoza" }),
    run(b, { name: "VALENTINA MENDOZA" }),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((x) => x.status === "rejected").length, 1);
  assert.equal((await a.loadState()).customers.filter((x) => /valentina/i.test(x.name)).length, 1);
  const state = await a.loadState();
  await assert.rejects(() => run(b, { name: "Valentina Mendoza" }), /duplicado/);
  assert.deepEqual(await a.loadState(), state);
  const payload = accepted(state, "Valentina Mendoza");
  await run(a, payload);
  const saved = await a.loadState();
  await assert.rejects(() => run(b, payload), /coincidencias/);
  assert.deepEqual(await b.loadState(), saved);
  await run(b, accepted(saved, "Valentina Mendoza"));
  assert.equal((await b.loadState()).customers.filter((x) => /valentina/i.test(x.name)).length, 3);
});

test("D09-19: fallo SQL revierte cliente, sedes, vínculos, auditoría y revisión", async (t) => {
  const db = diskFixture(t);
  const store = createStore(() => db.binding);
  await store.ensureState(adminIdentity);
  const before = await store.loadState();
  db.database.exec(
    "CREATE TRIGGER synthetic_customer_audit_failure BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'synthetic injected failure'); END;",
  );
  await assert.rejects(() =>
    store.runCommand(
      {
        type: "CUSTOMER_SAVE",
        payload: {
          name: "Cliente rollback completo",
          new_sites: ["Sede rollback"],
          default_site_id: "new:0",
        },
        request_id: randomUUID(),
      },
      adminIdentity,
    ),
  );
  assert.deepEqual(await store.loadState(), before);
});
