import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

/** Reference persistence port backed by SQLite in memory; no external runtime. */
export function memoryPersistence() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(readFileSync(new URL("../../drizzle/0000_nervous_silver_fox.sql", import.meta.url), "utf8"));
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
