import { openAdministration, transaction } from "./files.mjs";
import { databaseSnapshot, executeMigration, ledgerName, ledgerSql, migrationCatalog } from "./schema.mjs";

export function inspectDatabase(filename, { catalog = migrationCatalog() } = {}) {
  const { database } = openAdministration(filename);
  try {
    return transaction(database, () => databaseSnapshot(database, catalog));
  } finally {
    database.close();
  }
}

export function verifyDatabase(filename, options) {
  const result = inspectDatabase(filename, options);
  if (result.status === "empty") throw new Error("La base está vacía y no se ha preparado.");
  return result;
}

function prepare(database, catalog, { adopt = false, initializeEmpty = false } = {}) {
  const before = databaseSnapshot(database, catalog);
  if (before.status === "empty" && !initializeEmpty)
    throw new Error("Base vacía: seleccione explícitamente --initialize-empty.");
  if (before.adoptionRequired && !adopt)
    throw new Error("Base histórica: la adopción requiere --adopt explícito.");
  const record = (position, origin) => {
    const migration = catalog.migrations[position];
    database
      .prepare("INSERT INTO nutrequine_migrations(position,name,sha256,applied_at,origin) VALUES (?,?,?,?,?)")
      .run(position, migration.name, migration.sha256, new Date().toISOString(), origin);
  };
  if (before.status !== "managed") {
    database.exec(ledgerSql);
    for (let index = 0; index < before.version; index++) record(index, "adopted");
  }
  for (let index = before.version; index < catalog.migrations.length; index++) {
    executeMigration(database, catalog.migrations[index].sql);
    record(index, "executed");
  }
  const after = databaseSnapshot(database, catalog);
  if (after.status !== "managed" || after.pending.length || after.version !== catalog.migrations.length)
    throw new Error("La preparación no alcanzó el esquema esperado.");
  if (before.adoptionRequired && !before.pending.length) {
    const retained = after.tables.filter((table) => table.name !== ledgerName);
    if (JSON.stringify(retained) !== JSON.stringify(before.tables))
      throw new Error("La adopción alteró tablas existentes.");
  }
  return after;
}

export function initializeDatabase(filename, { catalog = migrationCatalog(), busyTimeoutMs = 1000 } = {}) {
  const { database } = openAdministration(filename, { create: true, write: true, busyTimeoutMs });
  try {
    return transaction(database, () => prepare(database, catalog, { initializeEmpty: true }), true);
  } finally {
    database.close();
  }
}

export function migrateDatabase(
  filename,
  { catalog = migrationCatalog(), adopt = false, initializeEmpty = false, busyTimeoutMs = 1000 } = {},
) {
  const { database } = openAdministration(filename, { write: true, busyTimeoutMs });
  try {
    return transaction(database, () => prepare(database, catalog, { adopt, initializeEmpty }), true);
  } finally {
    database.close();
  }
}
