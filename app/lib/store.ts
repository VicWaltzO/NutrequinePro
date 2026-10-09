import { env } from "cloudflare:workers";
import { TABLES, SQL_NAMES, seedState, executeCommand, DomainError } from "./domain.mjs";
import { writePlan } from "./persistence.mjs";
import type { AppState, Command, CommandResult } from "./domain-types";

interface Identity {
  userId: string;
  displayName: string;
}
function db(): D1Database {
  if (!env.DB) throw new Error("La base de datos no está disponible.");
  return env.DB as D1Database;
}
export async function loadState(): Promise<AppState | null> {
  const binding = db();
  const result = await binding.batch<{ data: string; revision: number }>([
    binding.prepare("SELECT * FROM settings WHERE id = 'company'"),
    ...TABLES.map((t) => binding.prepare(`SELECT data FROM ${SQL_NAMES[t]}`)),
  ]);
  const row = result[0].results[0];
  if (!row) return null;
  // These documents are written by the validated domain commands and migrations.
  return {
    config: JSON.parse(row.data),
    revision: row.revision,
    ...Object.fromEntries(TABLES.map((t, i) => [t, result[i + 1].results.map((r) => JSON.parse(r.data))])),
  } as AppState;
}
export async function persistState(before: AppState | null, after: AppState) {
  const binding = db();
  const statements = writePlan(before, after).map((x) => binding.prepare(x.sql).bind(...x.args));
  try {
    await binding.batch(statements);
  } catch (error) {
    if (/guard_accepted|CHECK constraint/.test(String(error)))
      throw new DomainError("Otra operación actualizó los datos. Recargue y vuelva a intentar.");
    throw error;
  }
}
export async function ensureState(identity: Identity): Promise<AppState> {
  let state = await loadState();
  if (!state) {
    const initial = seedState();
    initial.users.push({
      id: identity.userId,
      name: identity.displayName,
      role: "ADMIN",
      is_active: true,
      created_at: new Date().toISOString(),
      created_by: identity.userId,
    });
    try {
      await persistState(null, initial);
    } catch (error) {
      if (!(await loadState())) throw error;
    }
    state = await loadState();
  }
  if (!state) throw new Error("No se pudo inicializar la base de datos.");
  return state;
}
export async function runCommand(input: unknown, identity: Identity): Promise<CommandResult> {
  const before = await ensureState(identity);
  const actor = before.users.find((x) => x.id === identity.userId && x.is_active);
  if (!actor)
    throw new DomainError("Usuario sin acceso. Solicite al administrador que registre su ID autenticado.");
  if (
    !input ||
    typeof input !== "object" ||
    !("request_id" in input) ||
    typeof input.request_id !== "string" ||
    !input.request_id ||
    input.request_id.length > 100
  )
    throw new DomainError("Falta identificador de operación.");
  if (!("type" in input) || typeof input.type !== "string") throw new DomainError("Operación desconocida.");
  if (
    "payload" in input &&
    (input.payload === null || typeof input.payload !== "object" || Array.isArray(input.payload))
  )
    throw new DomainError("Datos de operación inválidos.");
  const command = input as Command;
  const duplicate = before.audit.find(
    (x) => x.request_id === command.request_id && x.created_by === actor.id,
  );
  if (duplicate) return { state: before, result: duplicate.entity_id };
  const outcome = executeCommand(before, command, actor);
  const audit = outcome.state.audit.at(-1);
  if (!audit) throw new Error("La operación no generó auditoría.");
  audit.request_id = command.request_id;
  await persistState(before, outcome.state);
  return outcome;
}
