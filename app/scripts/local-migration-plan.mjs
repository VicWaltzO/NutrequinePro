import { DatabaseSync } from "node:sqlite";
import { migrationPreparation } from "./local-database.mjs";

export const schemaQuery = "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name";

// Compatibility entry point from main; use the same schema validator as dev.
export function needsInitialAdoption(rows, initialSql, appliedNames, initialName) {
  if (appliedNames.includes(initialName)) return false;
  const expectedDb = new DatabaseSync(":memory:");
  try {
    expectedDb.exec(initialSql);
    return migrationPreparation(rows, expectedDb.prepare(schemaQuery).all(), [], [initialName]).adopt;
  } finally {
    expectedDb.close();
  }
}
