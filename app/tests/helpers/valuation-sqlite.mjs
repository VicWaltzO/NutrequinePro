// Synthetic harness only. No production command, schema or route activates this store.
import { randomUUID } from "node:crypto";
import { createStore } from "../../lib/application-store.mjs";
import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { applyValuation, assertValuationOpening } from "../../features/microinsumos/domain/valuation.mjs";

export function latestValuation(state) {
  return state.audit.findLast((row) => row.action === "SYNTHETIC_VALUATION")?.ledger;
}
export function valuationSnapshot(state, ledger, actor) {
  const next = structuredClone(state);
  next.revision++;
  next.audit.push({ id: randomUUID(), action: "SYNTHETIC_VALUATION", created_by: actor.id, ledger });
  return next;
}
export async function saveSyntheticValuation(store, event, actor, before = null) {
  before ??= await store.loadState();
  const ledger = latestValuation(before);
  assertValuationOpening(
    ledger,
    before.microOpenings.find((row) => row.id === ledger.opening.id),
    actor,
  );
  const next = applyValuation(ledger, event, actor);
  if (next.revision === ledger.revision) return before;
  const after = valuationSnapshot(before, next, actor);
  await store.persistState(before, after);
  return after;
}

if (process.argv[2] === "valuation-race") {
  const connection = openSqliteDatabase(process.argv[3]);
  const store = createStore(() => connection);
  const before = await store.loadState();
  process.send({ ready: true });
  process.on("message", async ({ event }) => {
    try {
      await saveSyntheticValuation(store, event, before.users[0], before);
      process.send({ saved: true });
    } catch (error) {
      process.send({ saved: false, error: error.message });
    } finally {
      connection.close();
      process.disconnect();
    }
  });
}
