import type { PersistenceDatabase } from "../persistence-port";

export interface SqliteDatabase extends PersistenceDatabase {
  readonly filename: string;
  close(): void;
}
export interface SqliteOptions {
  /** Default: open. Create fails if the path already exists and does not initialize a schema. */
  mode?: "open" | "create";
  /** Bounded SQLite lock wait, in milliseconds. Default: 1000. */
  busyTimeoutMs?: number;
}
export function openSqliteDatabase(filename: string, options?: SqliteOptions): SqliteDatabase;
