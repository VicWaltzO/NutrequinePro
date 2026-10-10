import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appRoot,
  localConfigPath,
  localD1,
  localPersistPath,
  migrationPreparation,
} from "./local-database.mjs";
import "./sites-env.mjs";
import { schemaQuery } from "./local-migration-plan.mjs";

export function prepareLocalDatabase() {
  const files = readdirSync(path.join(appRoot, "drizzle"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (!files.length) throw new Error("No se encontraron migraciones versionadas.");
  const persistPath = localPersistPath();
  const wrangler = (args, json = false) => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(appRoot, "node_modules/wrangler/bin/wrangler.js"),
        "d1",
        ...args,
        "--local",
        "--config",
        localConfigPath,
        "--persist-to",
        persistPath,
        ...(json ? ["--json"] : []),
      ],
      { cwd: appRoot, env: process.env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(result.stderr || result.stdout || "No se pudo preparar D1 local.");
    if (!json) {
      process.stdout.write(result.stdout);
      return;
    }
    const responses = JSON.parse(result.stdout);
    if (responses.some((response) => !response.success)) throw new Error("D1 rechazó la inspección local.");
    return responses.flatMap((response) => response.results);
  };
  const query = (sql) => wrangler(["execute", localD1.binding, "--command", sql], true);
  const tables = query(schemaQuery);
  const applied = tables.some((row) => row.name === "d1_migrations")
    ? query("SELECT name FROM d1_migrations ORDER BY id").map((row) => row.name)
    : [];
  const reference = new DatabaseSync(":memory:");
  let initialTables;
  try {
    reference.exec(readFileSync(path.join(appRoot, "drizzle", files[0]), "utf8"));
    initialTables = reference.prepare(schemaQuery).all();
  } finally {
    reference.close();
  }
  const plan = migrationPreparation(tables, initialTables, applied, files);
  if (plan.adopt) {
    // Record the verified historical schema without executing its CREATE TABLE statements again.
    const name = files[0].replaceAll("'", "''");
    query(
      "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);" +
        `INSERT INTO d1_migrations (name) VALUES ('${name}');`,
    );
    console.log("D1 local: esquema inicial existente reconocido; registros conservados.");
  }
  if (plan.pending.length) wrangler(["migrations", "apply", localD1.binding]);
  console.log(`D1 local preparado: ${localD1.binding} · ${persistPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareLocalDatabase();
}
