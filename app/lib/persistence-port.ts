export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

export interface PersistenceStatement {
  readonly sql: string;
  bind(...values: SqlValue[]): PersistenceStatement;
}

export interface QueryResult {
  results: SqlRow[];
}

/** Statements belong to one connection. A batch is atomic, including its reads. */
export interface PersistenceDatabase {
  prepare(sql: string): PersistenceStatement;
  batch(statements: PersistenceStatement[]): Promise<QueryResult[]>;
}
