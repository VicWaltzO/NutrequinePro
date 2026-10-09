import { env } from "cloudflare:workers";
import { createStore } from "./application-store.mjs";
function db(): D1Database {
  if (!env.DB) throw new Error("La base de datos no está disponible.");
  return env.DB as D1Database;
}
export const { loadState, persistState, ensureState, runCommand } = createStore(db);
