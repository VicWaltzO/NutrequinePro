import { backup } from "node:sqlite";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  assertPrivateDirectory,
  externalPath,
  openAdministration,
  selectedFile,
  sqliteUri,
} from "./files.mjs";
import { databaseSnapshot, migrationCatalog, sha256 } from "./schema.mjs";

function reserveDestination(destination, receiptSuffix) {
  const path = externalPath(destination);
  assertPrivateDirectory(dirname(path));
  if (existsSync(path + receiptSuffix)) throw new Error("Ya existe el manifiesto o recibo del destino.");
  return selectedFile(path, { create: true });
}

function syncFile(filename) {
  const descriptor = openSync(filename, "r+");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function copySnapshot(source, destination, onProgress) {
  return backup(source, sqliteUri(destination), { rate: 16, progress: onProgress });
}

// Pending migrations describe the installed catalog, not the contents of an older backup.
function sameSnapshot(actual, expected) {
  return isDeepStrictEqual({ ...actual, pending: [] }, { ...expected, pending: [] });
}

function verifySnapshot(filename, expected, catalog) {
  const { database } = openAdministration(filename);
  try {
    database.exec("BEGIN");
    const actual = databaseSnapshot(database, catalog);
    if (!sameSnapshot(actual, expected))
      throw new Error("La copia no coincide en esquema, relaciones, registros o historial.");
    database.exec("COMMIT");
    return actual;
  } finally {
    database.close();
  }
}

export async function backupDatabase(
  filename,
  destination,
  { catalog = migrationCatalog(), onProgress } = {},
) {
  const { database, filename: source } = openAdministration(filename);
  try {
    database.exec("BEGIN");
    const snapshot = databaseSnapshot(database, catalog);
    if (snapshot.status === "empty") throw new Error("No se respalda una base vacía sin preparar.");
    const target = reserveDestination(destination, ".manifest.json");
    await copySnapshot(database, target, onProgress);
    verifySnapshot(target, snapshot, catalog);
    syncFile(target);
    const manifest = {
      format: "nutrequine-sqlite-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      applicationVersion: JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"))
        .version,
      nodeVersion: process.version,
      sqliteVersion: database.prepare("SELECT sqlite_version() AS version").get().version,
      source,
      sha256: sha256(readFileSync(target)),
      snapshot,
    };
    writeFileSync(target + ".manifest.json", JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    syncFile(target + ".manifest.json");
    database.exec("COMMIT");
    return { backup: target, manifest };
  } finally {
    database.close();
  }
}

export function verifyBackup(filename, { catalog = migrationCatalog() } = {}) {
  const path = selectedFile(filename);
  const manifestPath = selectedFile(path + ".manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    manifest.format !== "nutrequine-sqlite-backup" ||
    manifest.version !== 1 ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    !manifest.snapshot ||
    !manifest.createdAt
  )
    throw new Error("Manifiesto de respaldo inválido o incompatible.");
  if (sha256(readFileSync(path)) !== manifest.sha256)
    throw new Error("El hash del respaldo no coincide con su manifiesto.");
  verifySnapshot(path, manifest.snapshot, catalog);
  return manifest;
}

export async function restoreDatabase(filename, destination, { catalog = migrationCatalog() } = {}) {
  const manifest = verifyBackup(filename, { catalog });
  const { database } = openAdministration(filename);
  try {
    database.exec("BEGIN");
    if (!sameSnapshot(databaseSnapshot(database, catalog), manifest.snapshot))
      throw new Error("El respaldo cambió antes de restaurarse.");
    const target = reserveDestination(destination, ".restore.json");
    await copySnapshot(database, target);
    verifySnapshot(target, manifest.snapshot, catalog);
    syncFile(target);
    if (sha256(readFileSync(filename)) !== manifest.sha256)
      throw new Error("El respaldo cambió durante la restauración.");
    const receipt = {
      format: "nutrequine-sqlite-restore",
      version: 1,
      restoredAt: new Date().toISOString(),
      backupSha256: manifest.sha256,
      sha256: sha256(readFileSync(target)),
      snapshot: manifest.snapshot,
    };
    writeFileSync(target + ".restore.json", JSON.stringify(receipt, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    syncFile(target + ".restore.json");
    database.exec("COMMIT");
    return { restored: target, receipt };
  } finally {
    database.close();
  }
}
