import type { PersistenceDatabase, PersistenceStatement, SqlRow, SqlValue } from "../persistence-port";

/** Cloudflare types are confined to this boundary; business code uses the port. */
export function createD1Adapter(database: D1Database): PersistenceDatabase {
  const statements = new WeakMap<PersistenceStatement, D1PreparedStatement>();
  function wrap(sql: string, native: D1PreparedStatement): PersistenceStatement {
    const statement = Object.freeze({
      sql,
      bind: (...values: SqlValue[]) => wrap(sql, native.bind(...values)),
    });
    statements.set(statement, native);
    return statement;
  }
  return {
    prepare: (sql) => wrap(sql, database.prepare(sql)),
    async batch(batch) {
      if (!batch.length) return [];
      const native = batch.map((statement) => {
        const prepared = statements.get(statement);
        if (!prepared) throw new Error("La sentencia pertenece a otra conexión.");
        return prepared;
      });
      const results = await database.batch<SqlRow>(native);
      return results.map((result) => ({ results: result.results }));
    },
  };
}
