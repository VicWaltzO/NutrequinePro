import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const appRoot = fileURLToPath(new URL("../", import.meta.url));
export const localConfigPath = path.join(appRoot, "wrangler.local.json");
export const localD1 = JSON.parse(readFileSync(localConfigPath, "utf8")).d1_databases[0];

export function localPersistPath() {
  return path.resolve(appRoot, process.env.NUTREQUINE_LOCAL_STATE_DIR || ".wrangler/state");
}

const normalizeSql = (sql) => sql.trim().replace(/\s+/g, " ").replace(/;$/, "");
const infrastructureTable = (name) =>
  name.startsWith("sqlite_") || name.startsWith("_cf_") || name === "d1_migrations";

/** Decide before writing: old databases without a ledger must match the initial schema exactly. */
export function migrationPreparation(tables, initialTables, applied, files) {
  const businessTables = tables.filter((row) => !infrastructureTable(row.name));
  if (applied.length) {
    if (!applied.every((name, index) => name === files[index])) {
      throw new Error("El historial local de migraciones no coincide con los archivos versionados.");
    }
    if (!businessTables.length)
      throw new Error("Existe un historial de migraciones sin esquema de aplicación.");
    return { adopt: false, pending: files.slice(applied.length) };
  }
  if (!businessTables.length) return { adopt: false, pending: files };
  const actual = new Map(businessTables.map((row) => [row.name, normalizeSql(row.sql)]));
  if (
    actual.size !== initialTables.length ||
    initialTables.some((row) => actual.get(row.name) !== normalizeSql(row.sql))
  ) {
    throw new Error(
      "Esquema local parcial o desconocido. No se aplicó ninguna migración ni se modificaron sus registros. Revise la ruta de D1 y restaure su esquema mediante un procedimiento revisado.",
    );
  }
  return { adopt: true, pending: files.slice(1) };
}
