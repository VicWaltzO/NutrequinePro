import { openAdministration, selectedFile, sqliteUri, transaction } from "../lib/sqlite/files.mjs";
import { databaseSnapshot, migrationCatalog } from "../lib/sqlite/schema.mjs";
import { emptyState } from "../lib/domain.mjs";
import { writePlan } from "../lib/persistence.mjs";
import type { User } from "../shared/types/domain.ts";
import { createAuthSchema } from "./auth-database.mts";
import { hashPassword, loginName } from "./passwords.mts";

export interface ProvisionInput {
  user_id: string;
  login: string;
  password: string;
  name?: string;
}

/** Offline filesystem-owner operation. Stop the server and back up before authorizing historical linkage. */
export async function provisionAuthentication(
  businessFile: string,
  authFile: string,
  mode: "new" | "link",
  input: ProvisionInput,
) {
  const login = loginName(input.login);
  if (typeof input.user_id !== "string" || !input.user_id.trim() || input.user_id.length > 100)
    throw new Error("Seleccione un ID comercial válido.");
  if (!["new", "link"].includes(mode)) throw new Error("Seleccione new o link explícitamente.");
  const password = await hashPassword(input.password);
  const { database, filename } = openAdministration(businessFile, { write: true });
  try {
    const before = databaseSnapshot(database, migrationCatalog());
    if (before.status !== "managed" || before.pending.length)
      throw new Error("Prepare y adopte la base comercial antes de vincular credenciales.");
    const auth = selectedFile(authFile, { create: true });
    database.prepare("ATTACH DATABASE ? AS auth").run(sqliteUri(auth));
    // Atomic commits spanning both files require rollback journals, never a WAL bootstrap.
    if (
      database.prepare("PRAGMA main.journal_mode").get()?.journal_mode !== "delete" ||
      database.prepare("PRAGMA auth.journal_mode").get()?.journal_mode !== "delete"
    )
      throw new Error("La provisión exige ambos journals DELETE y el servidor detenido.");
    return transaction(
      database,
      () => {
        const snapshot = databaseSnapshot(database, migrationCatalog());
        if (snapshot.status !== "managed" || snapshot.pending.length)
          throw new Error("La preparación cambió.");
        let actor: User;
        if (mode === "new") {
          if (
            snapshot.tables.some(
              (table: { name: string; count: number }) =>
                table.name !== "nutrequine_migrations" && table.name !== "d1_migrations" && table.count,
            )
          )
            throw new Error(
              "La base contiene registros; requiere vinculación histórica, no un administrador nuevo.",
            );
          if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 200)
            throw new Error("Seleccione el nombre del administrador.");
          const state = emptyState();
          actor = {
            id: input.user_id,
            name: input.name.trim(),
            role: "ADMIN",
            is_active: true,
            created_by: input.user_id,
            created_at: new Date().toISOString(),
          };
          state.users.push(actor);
          for (const statement of writePlan(null, state))
            database.prepare(statement.sql).run(...statement.args);
        } else {
          const row = database.prepare("SELECT data FROM users WHERE id=?").get(input.user_id);
          if (!row) throw new Error("Identidad administrativa histórica inexistente.");
          actor = JSON.parse(String(row.data)) as User;
          if (!actor.is_active || actor.role !== "ADMIN")
            throw new Error("La vinculación inicial exige un ADMIN histórico activo.");
        }
        createAuthSchema(database, filename);
        database
          .prepare("INSERT INTO auth.credentials VALUES (?,?,?,?,?,1)")
          .run(actor.id, login, password.salt, password.hash, password.algorithm);
        database
          .prepare("INSERT INTO auth.security_events(event,actor_id,target_id,created_at) VALUES (?,?,?,?)")
          .run("INITIAL_" + mode.toUpperCase(), actor.id, actor.id, Date.now());
        const after = databaseSnapshot(database, migrationCatalog());
        if (mode === "link" && JSON.stringify(after) !== JSON.stringify(snapshot))
          throw new Error("La vinculación alteró información comercial.");
        return { user_id: actor.id, mode, business_file: filename, auth_file: auth };
      },
      true,
    );
  } finally {
    database.close();
  }
}
