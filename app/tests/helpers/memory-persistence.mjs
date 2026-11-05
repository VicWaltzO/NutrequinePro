import { DatabaseSync } from "node:sqlite";
import { migrationCatalog } from "../../lib/sqlite/schema.mjs";

/** Reference persistence port backed by SQLite in memory; no external runtime. */
export function memoryPersistence() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrationCatalog().migrations) database.exec(migration.sql);
  const prepare = (sql, args = []) => ({ sql, args, bind: (...values) => prepare(sql, values) });
  const binding = {
    prepare,
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = statements.map(({ sql, args }) => ({
          results: database.prepare(sql).all(...args),
        }));
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { database, binding, close: () => database.close() };
}
