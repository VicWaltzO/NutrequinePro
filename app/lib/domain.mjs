// Stable public API: integer cents/grams, immutable history and cloned command execution.
export { TABLES, SQL_NAMES, RELATIONS } from "./state-schema.mjs";
export { DomainError, normalize, scaled } from "../shared/domain/core.mjs";
export { emptyState, seedState } from "./seed-state.mjs";
export { saleSummary } from "../features/ventas/domain/summary.mjs";
export { paymentSummary } from "../features/cobranza/domain/summary.mjs";
export { customerSummary } from "../features/clientes/domain/summary.mjs";
export { stock, deliveryAvailability } from "../features/inventario/domain/stock.mjs";
export { productionSummary } from "../features/produccion/domain/summary.mjs";
export { balanceSummary } from "../features/balance/domain/summary.mjs";
export { executeCommand } from "./execute-command.mjs";
