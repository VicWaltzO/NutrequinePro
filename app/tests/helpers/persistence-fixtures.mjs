import { AsyncLocalStorage } from "node:async_hooks";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute, basename } from "node:path";
import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { memoryPersistence } from "./memory-persistence.mjs";

const adapterContext = new AsyncLocalStorage();
export const historicalSchema = readFileSync(
  new URL("../../drizzle/0000_nervous_silver_fox.sql", import.meta.url),
  "utf8",
);

export function temporaryDataDirectory(t, beforeRemove = () => {}) {
  const root = realpathSync(tmpdir());
  const directory = mkdtempSync(join(root, "nutrequine-05-"));
  t.after(async () => {
    await beforeRemove();
    const location = relative(root, realpathSync(directory));
    if (
      !location ||
      location.startsWith("..") ||
      isAbsolute(location) ||
      !basename(directory).startsWith("nutrequine-05-")
    )
      throw new Error("Ruta de limpieza fuera del directorio temporal sintético.");
    rmSync(directory, { recursive: true });
  });
  return directory;
}

export function diskFixture(t) {
  const connections = [];
  const close = () => {
    for (const connection of connections) connection.close();
  };
  const directory = temporaryDataDirectory(t, close);
  const filename = join(directory, "synthetic.sqlite");
  const binding = openSqliteDatabase(filename, { mode: "create", busyTimeoutMs: 50 });
  connections.push(binding);
  const database = new DatabaseSync(filename);
  connections.push({
    close: () => {
      if (database.isOpen) database.close();
    },
  });
  // Only a new, exclusively reserved synthetic file receives the unchanged historical SQL.
  database.exec(historicalSchema);
  return { binding, database, filename, close };
}

export function testDatabase(t) {
  if (adapterContext.getStore() === "sqlite") return diskFixture(t);
  const database = memoryPersistence();
  t.after(database.close);
  return { ...database, binding: database.binding };
}

/** Register the same business assertions for the reference port and real SQLite files. */
export function persistenceTest(name, callback) {
  test(name, (t) => adapterContext.run("memory", () => callback(t)));
  test("SQLite disco: " + name, (t) => adapterContext.run("sqlite", () => callback(t)));
}
