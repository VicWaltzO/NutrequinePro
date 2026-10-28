import { DomainError } from "../shared/domain/core.mjs";

export class CommandConflictError extends DomainError {}

// Object key order is immaterial; array order, JSON types and values are significant.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

export function assertEquivalentReplay(entry, command) {
  if (
    typeof entry.action !== "string" ||
    !entry.payload ||
    typeof entry.payload !== "object" ||
    Array.isArray(entry.payload) ||
    entry.action !== command.type ||
    JSON.stringify(canonical(entry.payload)) !== JSON.stringify(canonical(command.payload ?? {}))
  )
    throw new CommandConflictError(
      "El identificador de operación ya se usó con otros datos o no permite verificar el reintento. Recargue y use una operación nueva.",
    );
}
