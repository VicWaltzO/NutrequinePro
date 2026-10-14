import { TABLES, SQL_NAMES, seedState, executeCommand, DomainError } from "./domain.mjs";
import { writePlan } from "./persistence.mjs";
export function createStore(getDatabase) {
  async function loadState() {
    const binding = getDatabase();
    const results = await binding.batch([
      binding.prepare("SELECT * FROM settings WHERE id = 'company'"),
      ...TABLES.map((table) => binding.prepare(`SELECT data FROM ${SQL_NAMES[table]}`)),
    ]);
    const settings = results[0].results[0];
    if (!settings) return null;
    // These documents are written by the validated domain commands and migrations.
    return {
      config: JSON.parse(settings.data),
      revision: settings.revision,
      ...Object.fromEntries(
        TABLES.map((table, index) => [table, results[index + 1].results.map((row) => JSON.parse(row.data))]),
      ),
    };
  }
  async function persistState(before, after) {
    const binding = getDatabase();
    const statements = writePlan(before, after).map((statement) =>
      binding.prepare(statement.sql).bind(...statement.args),
    );
    try {
      await binding.batch(statements);
    } catch (error) {
      if (/guard_accepted|CHECK constraint/.test(String(error)))
        throw new DomainError("Otra operación actualizó los datos. Recargue y vuelva a intentar.");
      throw error;
    }
  }
  async function ensureState(identity) {
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
  async function runCommand(input, identity) {
    const before = await ensureState(identity);
    const actor = before.users.find((user) => user.id === identity.userId && user.is_active);
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
    const command = input;
    const duplicate = before.audit.find(
      (entry) => entry.request_id === command.request_id && entry.created_by === actor.id,
    );
    if (duplicate) return { state: before, result: duplicate.entity_id };
    const outcome = executeCommand(before, command, actor);
    const audit = outcome.state.audit.at(-1);
    if (!audit) throw new Error("La operación no generó auditoría.");
    audit.request_id = command.request_id;
    await persistState(before, outcome.state);
    return outcome;
  }
  return { loadState, persistState, ensureState, runCommand };
}
