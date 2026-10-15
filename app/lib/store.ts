import { env } from "cloudflare:workers";
import { createStore } from "./application-store.mjs";
import { createD1Adapter } from "./adapters/d1";
import type { PersistenceDatabase } from "./persistence-port";
function db(): PersistenceDatabase {
  if (!env.DB) throw new Error("La base de datos no está disponible.");
  return createD1Adapter(env.DB as D1Database);
}
export const { loadState, persistState, ensureState, runCommand } = createStore(db);
