import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./sites-env.mjs";
import { localBindingConfig, localStatePath, projectRoot } from "./local-bindings.mjs";
import { needsInitialAdoption, schemaQuery } from "./local-migration-plan.mjs";

const initialName = "0000_nervous_silver_fox.sql";

export function prepareLocalDatabase() {
  const database = localBindingConfig.d1_databases[0];
  if (!database) return;
  const configPath = path.join(projectRoot, ".sites-runtime", "wrangler.local.json");
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    name: "nutrequine-pro-local",
    compatibility_date: "2026-05-15",
    ...localBindingConfig,
    main: path.join(projectRoot, localBindingConfig.main),
    d1_databases: [{ ...database, migrations_dir: path.join(projectRoot, "drizzle") }],
  }));
  const baseArgs = ["--local", "--persist-to", localStatePath, "--config", configPath];
  const run = (args, json = false) => {
    const result = spawnSync(process.execPath, [
      path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"), ...args,
    ], {
      cwd: projectRoot,
      env: { ...process.env, CI: "true" },
      encoding: "utf8",
      stdio: json ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      if (json) process.stderr.write(result.stderr || result.stdout || "");
      throw new Error("No se pudo preparar la base local. Corrija el error de Wrangler y vuelva a ejecutar npm run dev.");
    }
    if (!json) return;
    const response = JSON.parse(result.stdout);
    if (response.some((entry) => !entry.success)) throw new Error("Falló la consulta de la base local.");
    return response.flatMap((entry) => entry.results);
  };
  const query = (sql) => run(["d1", "execute", database.binding, ...baseArgs, "--command", sql, "--json"], true);
  console.log("Preparando base D1 local (SQLite, sin Docker)...");
  const schema = query(schemaQuery);
  const applied = schema.some(({ name }) => name === "d1_migrations")
    ? query("SELECT name FROM d1_migrations").map(({ name }) => name) : [];
  if (needsInitialAdoption(schema, readFileSync(path.join(projectRoot, "drizzle", initialName), "utf8"), applied, initialName)) {
    query(`CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    ); INSERT OR IGNORE INTO d1_migrations (name) VALUES ('${initialName}');`);
    console.log("Migración inicial existente reconocida; se conservan los datos.");
  }
  run(["d1", "migrations", "apply", database.binding, ...baseArgs]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareLocalDatabase();
}
