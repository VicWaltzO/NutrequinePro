import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { catalogTables, originalCompanyCatalog, planCompanyCatalog } from "../company-catalog.mjs";
import { SQL_NAMES, RELATIONS } from "../state-schema.mjs";
import { openAdministration, selectedFile, transaction } from "./files.mjs";
import { backupDatabase, verifyBackup } from "./recovery.mjs";
import { databaseSnapshot, migrationCatalog, sha256 } from "./schema.mjs";

function readContext(database, filename, actorId) {
  const snapshot = databaseSnapshot(database, migrationCatalog());
  if (snapshot.status !== "managed" || snapshot.pending.length)
    throw new Error("Prepare el esquema SQLite antes de aprovisionar el catálogo.");
  const settings = database.prepare("SELECT revision FROM settings WHERE id='company'").get();
  if (!settings || !Number.isSafeInteger(settings.revision) || settings.revision < 0)
    throw new Error("Prepare primero la autenticación local; falta una revisión comercial válida.");
  const user = database.prepare("SELECT data FROM users WHERE id=?").get(actorId);
  const actor = user && JSON.parse(user.data);
  if (!actor || actor.id !== actorId || actor.role !== "ADMIN" || !actor.is_active)
    throw new Error("Seleccione un ADMIN comercial activo para autorizar y auditar la provisión.");
  const current = Object.fromEntries(
    catalogTables.map((table) => [
      table,
      database
        .prepare(`SELECT id,data FROM ${SQL_NAMES[table]} ORDER BY id`)
        .all()
        .map((row) => {
          const item = JSON.parse(row.data);
          if (item.id !== row.id) throw new Error("Identificador JSON incompatible en " + table);
          return item;
        }),
    ]),
  );
  return {
    actor,
    plan: {
      format: "nutrequine-company-catalog-plan",
      version: 1,
      database: filename,
      actor_id: actorId,
      catalog_hash: sha256(JSON.stringify(originalCompanyCatalog())),
      snapshot_hash: sha256(JSON.stringify(snapshot)),
      revision: settings.revision,
      ...planCompanyCatalog(current),
    },
  };
}

export function previewCompanyCatalog(filename, actorId) {
  const connection = openAdministration(filename);
  try {
    return transaction(
      connection.database,
      () => readContext(connection.database, connection.filename, actorId).plan,
    );
  } finally {
    connection.database.close();
  }
}

export function saveCatalogPreview(filename, actorId, destination) {
  const plan = previewCompanyCatalog(filename, actorId);
  const path = selectedFile(destination, { create: true });
  writeFileSync(path, JSON.stringify(plan, null, 2) + "\n", { mode: 0o600 });
  return { preview: path, ...plan };
}

function verifyPlan(plan, current) {
  if (!isDeepStrictEqual(plan, current))
    throw new Error("La vista previa cambió, fue alterada o está obsoleta. Genere y revise una nueva.");
}

export async function applyCompanyCatalog(filename, previewFile, backupFile) {
  const plan = JSON.parse(readFileSync(selectedFile(previewFile), "utf8"));
  if (
    plan.format !== "nutrequine-company-catalog-plan" ||
    plan.version !== 1 ||
    typeof plan.actor_id !== "string"
  )
    throw new Error("Vista previa incompatible.");
  const requestId = "catalog-provision:" + sha256(JSON.stringify(plan));
  const connection = openAdministration(filename, { write: true });
  const database = connection.database;
  try {
    const before = transaction(database, () => {
      const context = readContext(database, connection.filename, plan.actor_id);
      if (plan.database !== connection.filename) throw new Error("La vista previa corresponde a otra base.");
      const receipt = database.prepare("SELECT data FROM audit WHERE id=?").get(requestId);
      if (receipt) {
        const audit = JSON.parse(receipt.data);
        if (
          audit.action !== "CATALOG_PROVISION" ||
          audit.request_id !== requestId ||
          audit.created_by !== plan.actor_id
        )
          throw new Error("Conflicto en el recibo de provisión.");
        return { alreadyApplied: true };
      }
      verifyPlan(plan, context.plan);
      return {
        alreadyApplied: false,
        changes: Object.values(plan.summary).reduce((sum, count) => sum + count, 0),
      };
    });
    if (before.alreadyApplied || !before.changes)
      return {
        status: "unchanged",
        revision: previewCompanyCatalog(filename, plan.actor_id).revision,
        summary: before.alreadyApplied ? {} : plan.summary,
      };

    // The consistent backup must match the reviewed state, including records outside the catalog.
    const backup = await backupDatabase(filename, backupFile);
    const manifest = verifyBackup(backup.backup);
    if (sha256(JSON.stringify(manifest.snapshot)) !== plan.snapshot_hash)
      throw new Error("La base cambió durante el respaldo. Conserve la copia y revise otra vista previa.");

    return transaction(
      database,
      () => {
        const context = readContext(database, connection.filename, plan.actor_id);
        verifyPlan(plan, context.plan);
        for (const table of catalogTables) {
          const columns = ["id", "data", ...(RELATIONS[table] ?? [])];
          const statement = database.prepare(
            `INSERT INTO ${SQL_NAMES[table]} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          );
          for (const row of plan.inserts[table])
            statement.run(
              row.id,
              JSON.stringify(row),
              ...(RELATIONS[table] ?? []).map((column) => row[column]),
            );
        }
        const audit = {
          id: requestId,
          request_id: requestId,
          action: "CATALOG_PROVISION",
          entity_id: "nutrequine-original-catalog-v1",
          created_at: new Date().toISOString(),
          created_by: context.actor.id,
          actor_name: context.actor.name,
          actor_role: context.actor.role,
          payload: {
            catalog_hash: plan.catalog_hash,
            snapshot_hash: plan.snapshot_hash,
            inserted: plan.summary,
            operation_id: randomUUID(),
          },
        };
        database.prepare("INSERT INTO audit(id,data) VALUES (?,?)").run(audit.id, JSON.stringify(audit));
        const updated = database
          .prepare("UPDATE settings SET revision=revision+1 WHERE id='company' AND revision=?")
          .run(plan.revision);
        if (updated.changes !== 1) throw new Error("Revisión comercial obsoleta.");
        databaseSnapshot(database, migrationCatalog());
        return {
          status: "applied",
          revision: plan.revision + 1,
          summary: plan.summary,
          backup: backup.backup,
          audit_id: audit.id,
        };
      },
      true,
    );
  } finally {
    database.close();
  }
}
