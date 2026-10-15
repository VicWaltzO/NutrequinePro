import { DatabaseSync, constants } from "node:sqlite";
import { closeSync, lstatSync, openSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, basename, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PersistenceBusyError } from "../persistence-errors.mjs";

const installationDirectory = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const forbiddenActions = new Set([
  constants.SQLITE_TRANSACTION,
  constants.SQLITE_SAVEPOINT,
  constants.SQLITE_ATTACH,
  constants.SQLITE_DETACH,
  constants.SQLITE_PRAGMA,
]);

function databasePath(filename) {
  if (typeof filename !== "string" || !isAbsolute(filename))
    throw new Error("Indique una ruta absoluta fuera del directorio de instalación.");
  const canonical = join(realpathSync(dirname(filename)), basename(filename));
  const location = relative(installationDirectory, canonical);
  if (!location || (!location.startsWith(".." + sep) && location !== ".." && !isAbsolute(location)))
    throw new Error("Los datos deben permanecer fuera del directorio de instalación.");
  return canonical;
}

/** Opens an existing file by default. Creation reserves a new file exclusively; no schema is applied. */
export function openSqliteDatabase(filename, { mode = "open", busyTimeoutMs = 1000 } = {}) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 18))
    throw new Error("El adaptador SQLite requiere Node.js 24.18 o superior.");
  if (!["open", "create"].includes(mode)) throw new Error("Modo de apertura inválido.");
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 2147483647)
    throw new Error("Tiempo de espera SQLite inválido.");
  const path = databasePath(filename);
  if (mode === "create") closeSync(openSync(path, "wx", 0o600));
  if (!lstatSync(path).isFile()) throw new Error("La ruta debe identificar un archivo regular, sin enlaces.");
  // mode=rw prevents SQLite from silently recreating a file removed after the filesystem check.
  const uri = pathToFileURL(path);
  uri.searchParams.set("mode", "rw");
  const database = new DatabaseSync(uri.href, {
    timeout: busyTimeoutMs,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
  });
  try {
    database.exec("PRAGMA synchronous = FULL");
  } catch (error) {
    database.close();
    throw error;
  }
  const statements = new WeakMap();
  function assertOpen() {
    if (!database.isOpen) throw new Error("La conexión SQLite está cerrada.");
  }
  function prepare(sql, args = []) {
    assertOpen();
    const statement = Object.freeze({
      sql,
      bind: (...values) => {
        for (const value of values)
          if (
            value !== null &&
            typeof value !== "string" &&
            !(typeof value === "number" && Number.isFinite(value))
          )
            throw new TypeError("Parámetro SQL inválido.");
        return prepare(sql, values);
      },
    });
    statements.set(statement, { sql, args });
    return statement;
  }
  return Object.freeze({
    filename: path,
    prepare,
    async batch(batch) {
      assertOpen();
      const queries = batch.map((statement) => {
        const query = statements.get(statement);
        if (!query) throw new Error("La sentencia pertenece a otra conexión.");
        return query;
      });
      try {
        database.exec("BEGIN");
        // Only this adapter controls transaction boundaries and connection settings.
        database.setAuthorizer((action) =>
          forbiddenActions.has(action) ? constants.SQLITE_DENY : constants.SQLITE_OK,
        );
        let results;
        try {
          results = queries.map(({ sql, args }) => {
            const statement = database.prepare(sql);
            if (statement.sourceSQL.trim() !== sql.trim())
              throw new Error("Cada sentencia debe contener una sola instrucción SQL.");
            return { results: statement.all(...args).map((row) => ({ ...row })) };
          });
        } finally {
          database.setAuthorizer(null);
        }
        database.exec("COMMIT");
        return results;
      } catch (error) {
        try {
          if (database.isTransaction) database.exec("ROLLBACK");
        } catch (rollbackError) {
          database.close();
          throw new AggregateError([error, rollbackError], "Falló el rollback; se cerró la conexión.");
        }
        if (typeof error.errcode === "number" && [5, 6].includes(error.errcode & 255))
          throw new PersistenceBusyError(error);
        throw error;
      }
    },
    close() {
      if (database.isOpen) database.close();
    },
  });
}
