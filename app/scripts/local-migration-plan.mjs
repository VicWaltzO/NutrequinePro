import { DatabaseSync } from "node:sqlite";

export const schemaQuery = "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name";

function applicationSchema(rows) {
  return rows.filter(({ name }) => !name.startsWith("_cf_") && !name.startsWith("sqlite_") && name !== "d1_migrations");
}

// Older setup instructions used `d1 execute --file`, which did not record the
// migration. Adopt only an exact initial schema; never mask a partial import.
export function needsInitialAdoption(rows, initialSql, appliedNames, initialName) {
  if (appliedNames.includes(initialName)) return false;
  const actual = applicationSchema(rows);
  if (!actual.length) return false;
  const expectedDb = new DatabaseSync(":memory:");
  let expected;
  try {
    expectedDb.exec(initialSql);
    expected = applicationSchema(expectedDb.prepare(schemaQuery).all());
  } finally {
    expectedDb.close();
  }
  const signature = (schema) => JSON.stringify(schema.map(({ type, name, sql }) =>
    [type, name, sql.replace(/\s+/g, " ").trim()]).sort((a, b) => a[1].localeCompare(b[1])));
  if (signature(actual) !== signature(expected)) {
    throw new Error("La base local tiene un esquema incompleto o distinto de la migración inicial. Se conserva sin cambios; revise la migración antes de continuar.");
  }
  return true;
}
