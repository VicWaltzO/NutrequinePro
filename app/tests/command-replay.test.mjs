import assert from "node:assert/strict";
import { createStore } from "../lib/application-store.mjs";
import { persistenceTest, testDatabase } from "./helpers/persistence-fixtures.mjs";

persistenceTest("NQP26 I09 / T03: replay canónico, conflicto de tipo/cuerpo y permiso vigente", async (t) => {
  const db = testDatabase(t);
  const store = createStore(() => db.binding);
  const admin = { userId: "replay-admin", displayName: "Admin sintético" };
  await store.ensureState(admin);
  await store.runCommand(
    {
      type: "USER_SAVE",
      payload: { id: "replay-operator", name: "Operador sintético", role: "OPERATOR" },
      request_id: "user",
    },
    admin,
  );
  const actor = { userId: "replay-operator", displayName: "Operador sintético" };
  const input = {
    type: "CUSTOMER_SAVE",
    payload: { name: "Cliente sintético", notes: "Prueba", site_ids: ["site-1"] },
    request_id: "replay-id",
  };
  const first = await store.runCommand(input, actor);
  const retry = await store.runCommand(
    { ...input, payload: { site_ids: ["site-1"], notes: "Prueba", name: "Cliente sintético" } },
    actor,
  );
  assert.deepEqual(retry, first);
  for (const command of [
    { ...input, payload: { ...input.payload, name: "Otro" } },
    { ...input, type: "SITE_SAVE" },
  ]) {
    const before = await store.loadState();
    await assert.rejects(store.runCommand(command, actor), /identificador de operación/);
    assert.deepEqual(await store.loadState(), before);
  }
  await store.runCommand(
    {
      type: "USER_SAVE",
      payload: { id: actor.userId, name: actor.displayName, role: "VIEWER" },
      request_id: "downgrade",
    },
    admin,
  );
  const before = await store.loadState();
  await assert.rejects(store.runCommand(input, actor), /solo puede consultar/);
  assert.deepEqual(await store.loadState(), before);
  await assert.rejects(
    store.runCommand(input, { userId: "missing", displayName: "Sin acceso" }),
    /Usuario sin acceso/,
  );
});

persistenceTest(
  "T03: auditoría legacy verificable funciona sin reescritura; incompleta bloquea",
  async (t) => {
    const db = testDatabase(t);
    const store = createStore(() => db.binding);
    const identity = { userId: "legacy-admin", displayName: "Admin sintético" };
    const input = { type: "CUSTOMER_SAVE", payload: { name: "Cliente legacy" }, request_id: "legacy-id" };
    await store.runCommand(input, identity);
    const before = await store.loadState();
    const legacy = structuredClone(before);
    delete legacy.audit.at(-1).request_contract_version;
    await store.persistState(before, legacy);
    await store.runCommand(input, identity);
    assert.deepEqual(await store.loadState(), legacy);
    const incomplete = structuredClone(legacy);
    delete incomplete.audit.at(-1).payload;
    await store.persistState(legacy, incomplete);
    await assert.rejects(store.runCommand(input, identity), /no permite verificar/);
    assert.deepEqual(await store.loadState(), incomplete);
  },
);
