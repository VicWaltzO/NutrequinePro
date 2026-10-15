import { DatabaseSync, constants } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ledgerName = "nutrequine_migrations";
export const ledgerSql = `CREATE TABLE nutrequine_migrations (
  position INTEGER PRIMARY KEY NOT NULL,
  name TEXT UNIQUE NOT NULL,
  sha256 TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('executed','adopted'))
)`;
const d1LedgerSql =
  "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)";
const schemaQuery =
  "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' ORDER BY type,name";
const normalizeSql = (sql) => sql.replaceAll("\r\n", "\n").trim();
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const identifier = (name) => '"' + name.replaceAll('"', '""') + '"';

export function schemaObjects(database) {
  return database
    .prepare(schemaQuery)
    .all()
    .map((row) => ({ ...row, sql: normalizeSql(row.sql) }));
}

export function executeMigration(database, sql) {
  const forbidden = new Set([
    constants.SQLITE_TRANSACTION,
    constants.SQLITE_SAVEPOINT,
    constants.SQLITE_ATTACH,
    constants.SQLITE_DETACH,
    constants.SQLITE_PRAGMA,
    constants.SQLITE_DROP_TABLE,
  ]);
  database.setAuthorizer((action) => (forbidden.has(action) ? constants.SQLITE_DENY : constants.SQLITE_OK));
  try {
    database.exec(sql);
  } finally {
    database.setAuthorizer(null);
  }
}

export function migrationCatalog(directory = fileURLToPath(new URL("../../drizzle/", import.meta.url))) {
  const journal = JSON.parse(readFileSync(join(directory, "meta/_journal.json"), "utf8"));
  if (journal.dialect !== "sqlite" || !Array.isArray(journal.entries) || !journal.entries.length)
    throw new Error("Catálogo SQLite vacío o incompatible.");
  const migrations = journal.entries.map((entry, index) => {
    if (entry.idx !== index || !/^\d{4}_[a-z0-9_]+$/.test(entry.tag))
      throw new Error("Orden de migraciones inválido.");
    const name = entry.tag + ".sql";
    const sql = readFileSync(join(directory, name), "utf8");
    return { name, sql, sha256: sha256(sql.replaceAll("\r\n", "\n")) };
  });
  const names = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (JSON.stringify(names) !== JSON.stringify(migrations.map((migration) => migration.name)))
    throw new Error("Los archivos SQL no coinciden con el journal versionado.");
  const reference = new DatabaseSync(":memory:");
  const schemas = [schemaObjects(reference)];
  try {
    reference.exec("BEGIN");
    for (const migration of migrations) {
      executeMigration(reference, migration.sql);
      schemas.push(schemaObjects(reference));
    }
    reference.exec("COMMIT");
    reference.exec(ledgerSql);
    const localLedger = schemaObjects(reference).find((row) => row.name === ledgerName);
    reference.exec(d1LedgerSql);
    const d1Objects = schemaObjects(reference).filter((row) => row.name === "d1_migrations");
    return { migrations, schemas, localLedger, d1Objects };
  } finally {
    reference.close();
  }
}

function equalSchema(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function d1MetadataSignature(objects) {
  // Both known ledger creators use this DDL; Wrangler varies whitespace and keyword case.
  return objects.map((object) => ({ ...object, sql: object.sql.replace(/\s+/g, "").toUpperCase() }));
}

export function preparationPlan(database, catalog) {
  const objects = schemaObjects(database);
  const local = objects.find((row) => row.name === ledgerName);
  if (local && !equalSchema(local, catalog.localLedger))
    throw new Error("Ledger SQLite de estructura desconocida.");
  const d1Objects = objects.filter((row) => row.name === "d1_migrations");
  if (
    d1Objects.length &&
    !equalSchema(d1MetadataSignature(d1Objects), d1MetadataSignature(catalog.d1Objects))
  )
    throw new Error("Metadatos D1 desconocidos.");
  const d1Applied = d1Objects.length
    ? database
        .prepare("SELECT name FROM d1_migrations ORDER BY id")
        .all()
        .map((row) => row.name)
    : [];
  if (!d1Applied.every((name, index) => name === catalog.migrations[index]?.name))
    throw new Error("Historial D1 desconocido o incompatible.");
  const applied = local
    ? database.prepare("SELECT * FROM nutrequine_migrations ORDER BY position").all()
    : [];
  if (local && !applied.length) throw new Error("Ledger SQLite vacío: historial incompatible.");
  applied.forEach((row, index) => {
    const migration = catalog.migrations[index];
    if (
      !migration ||
      row.position !== index ||
      row.name !== migration.name ||
      row.sha256 !== migration.sha256 ||
      !["executed", "adopted"].includes(row.origin) ||
      Number.isNaN(Date.parse(row.applied_at))
    )
      throw new Error("Historial SQLite incompatible o migración modificada.");
  });
  if (local && d1Applied.length > applied.length) throw new Error("El historial D1 supera al ledger SQLite.");
  const application = objects.filter((row) => ![ledgerName, "d1_migrations"].includes(row.name));
  let version = applied.length;
  if (!local && application.length) version = Math.max(1, d1Applied.length);
  if (!equalSchema(application, catalog.schemas[version]))
    throw new Error("Esquema parcial o desconocido; no se modificaron sus registros.");
  if (!application.length && (local || d1Applied.length)) throw new Error("Existe historial sin esquema.");
  let status = "empty";
  if (local) status = "managed";
  else if (application.length) status = "historical";
  return {
    status,
    version,
    applied: applied.map((row) => ({ ...row })),
    d1Applied,
    adoptionRequired: !local && application.length > 0,
    pending: catalog.migrations.slice(version).map((migration) => migration.name),
  };
}

export function verifyIntegrity(database) {
  const integrity = database.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok")
    throw new Error("Falló integrity_check.");
  if (database.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Falló foreign_key_check.");
  for (const table of database
    .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*'")
    .all()) {
    const columns = database.prepare(`PRAGMA table_info(${identifier(table.name)})`).all();
    if (!columns.some((column) => column.name === "data")) continue;
    const relations = database.prepare(`PRAGMA foreign_key_list(${identifier(table.name)})`).all();
    for (const row of database.prepare(`SELECT * FROM ${identifier(table.name)}`).iterate()) {
      let document;
      try {
        document = JSON.parse(row.data);
      } catch (cause) {
        throw new Error(`Documento JSON inválido en ${table.name}.`, { cause });
      }
      if (!document || typeof document !== "object" || Array.isArray(document))
        throw new Error("Documento JSON inválido.");
      if (table.name !== "settings" && document.id !== row.id)
        throw new Error("ID JSON inconsistente con su fila.");
      if (relations.some((relation) => (document[relation.from] ?? null) !== row[relation.from]))
        throw new Error("Relación JSON inconsistente con su columna SQL.");
    }
  }
  if (
    database.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='transaction_guards'").get().n &&
    database.prepare("SELECT count(*) AS n FROM transaction_guards").get().n
  )
    throw new Error("La base conserva guards transaccionales sin cerrar.");
}

export function databaseSnapshot(database, catalog) {
  const plan = preparationPlan(database, catalog);
  verifyIntegrity(database);
  const objects = schemaObjects(database);
  const tables = objects
    .filter((row) => row.type === "table")
    .map(({ name }) => {
      const columns = database
        .prepare(`PRAGMA table_info(${identifier(name)})`)
        .all()
        .map((row) => ({ ...row }));
      const foreignKeys = database
        .prepare(`PRAGMA foreign_key_list(${identifier(name)})`)
        .all()
        .map((row) => ({ ...row }));
      const query = database.prepare(
        `SELECT * FROM ${identifier(name)} ORDER BY ${columns.map((column) => identifier(column.name)).join(",")}`,
      );
      query.setReadBigInts(true);
      const hash = createHash("sha256");
      let count = 0;
      for (const row of query.iterate()) {
        hash.update(
          JSON.stringify(row, (_key, value) =>
            typeof value === "bigint" ? { integer: value.toString() } : value,
          ) + "\n",
        );
        count++;
      }
      return { name, columns, foreignKeys, count, sha256: hash.digest("hex") };
    });
  const hasSettings = objects.some((object) => object.type === "table" && object.name === "settings");
  const revision = hasSettings
    ? (database.prepare("SELECT revision FROM settings WHERE id='company'").get()?.revision ?? null)
    : null;
  return { ...plan, schemaHash: sha256(JSON.stringify(objects)), revision, tables };
}
