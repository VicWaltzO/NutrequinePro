import type { DatabaseSync } from "node:sqlite";
import { openAdministration } from "../lib/sqlite/files.mjs";

const tables = {
  metadata: "(version INTEGER PRIMARY KEY CHECK(version=1), business_file TEXT NOT NULL)",
  credentials:
    "(user_id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, algorithm TEXT NOT NULL, version INTEGER NOT NULL)",
  sessions:
    "(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES credentials(user_id), credential_version INTEGER NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
  attempts: "(bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
  security_events:
    "(id INTEGER PRIMARY KEY, event TEXT NOT NULL, actor_id TEXT, target_id TEXT, created_at INTEGER NOT NULL)",
};

export function createAuthSchema(database: DatabaseSync, businessFile: string) {
  for (const [name, columns] of Object.entries(tables)) database.exec(`CREATE TABLE auth.${name} ${columns}`);
  database.prepare("INSERT INTO auth.metadata VALUES (1,?)").run(businessFile);
}

export function openAuthDatabase(filename: string, businessFile: string) {
  const { database } = openAdministration(filename, { write: true });
  try {
    const actual = database
      .prepare("SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name")
      .all();
    const expected = Object.entries(tables).sort(([a], [b]) => a.localeCompare(b));
    if (
      actual.length !== expected.length ||
      actual.some((row, index) => {
        const [name, columns] = expected[index];
        return row.name !== name || row.sql !== `CREATE TABLE ${name} ${columns}`;
      })
    )
      throw new Error("Esquema de autenticación incompatible; preparación explícita requerida.");
    const metadata = database.prepare("SELECT * FROM metadata").all();
    if (metadata.length !== 1 || metadata[0].version !== 1 || metadata[0].business_file !== businessFile)
      throw new Error("La autenticación no corresponde a la base comercial seleccionada.");
    if (
      database.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" ||
      database.prepare("PRAGMA foreign_key_check").all().length
    )
      throw new Error("Integridad de autenticación inválida.");
    if (!database.prepare("SELECT count(*) AS n FROM credentials").get()?.n)
      throw new Error("No hay credenciales preparadas.");
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
