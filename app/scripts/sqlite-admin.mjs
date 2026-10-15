import { randomUUID } from "node:crypto";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import {
  initializeDatabase,
  inspectDatabase,
  migrateDatabase,
  verifyDatabase,
} from "../lib/sqlite/migrations.mjs";
import { backupDatabase, restoreDatabase, verifyBackup } from "../lib/sqlite/recovery.mjs";

const definitions = {
  directory: ["directory"],
  init: ["database"],
  inspect: ["database"],
  verify: ["database"],
  migrate: ["database", "apply", "adopt", "initialize-empty"],
  backup: ["database", "destination"],
  "verify-backup": ["backup"],
  restore: ["backup", "destination"],
};
const flags = new Set(["apply", "adopt", "initialize-empty"]);
const [command, ...args] = process.argv.slice(2);
const attempt = { id: randomUUID(), at: new Date().toISOString(), command };

try {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 18)) throw new Error("Se requiere Node.js 24.18 o superior.");
  if (!Object.hasOwn(definitions, command))
    throw new Error(
      "Comandos: directory, init, inspect, migrate, verify, backup, verify-backup, restore. Consulte docs/REPORTE_06_MIGRACIONES_SQLITE.md.",
    );
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index].slice(2);
    if (!args[index].startsWith("--") || !definitions[command].includes(key) || Object.hasOwn(options, key))
      throw new Error("Opción desconocida o repetida: " + args[index]);
    if (flags.has(key)) options[key] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("Falta el valor de --" + key);
      options[key] = value;
    }
  }
  for (const key of definitions[command].filter((name) => !flags.has(name)))
    if (!options[key]) throw new Error("Seleccione explícitamente --" + key);
  attempt.database = options.database ?? options.backup ?? options.directory;
  attempt.destination = options.destination;
  let result;
  switch (command) {
    case "directory":
      result = { directory: createPrivateDirectory(options.directory) };
      break;
    case "init":
      result = initializeDatabase(options.database);
      break;
    case "inspect":
      result = inspectDatabase(options.database);
      break;
    case "verify":
      result = verifyDatabase(options.database);
      break;
    case "migrate":
      if (!options.apply) throw new Error("Modificar una base existente requiere --apply.");
      result = migrateDatabase(options.database, {
        adopt: !!options.adopt,
        initializeEmpty: !!options["initialize-empty"],
      });
      break;
    case "backup":
      result = await backupDatabase(options.database, options.destination);
      break;
    case "verify-backup":
      result = verifyBackup(options.backup);
      break;
    case "restore":
      result = await restoreDatabase(options.backup, options.destination);
      break;
  }
  console.log(JSON.stringify({ ok: true, attempt, result }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        attempt,
        error: {
          name: error.name,
          code: error.code ?? error.errcode ?? "SQLITE_ADMIN_ERROR",
          sqliteCode: error.errcode,
          message: error.message,
          stack: error.stack,
        },
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
