// Read-only summaries and previews; command execution remains exclusively on the server.
export { normalize, scaled } from "../shared/domain/core.mjs";
export { saleSummary } from "../features/ventas/domain/summary.mjs";
export { paymentSummary } from "../features/cobranza/domain/summary.mjs";
export { customerSummary } from "../features/clientes/domain/summary.mjs";
export { stock, deliveryAvailability } from "../features/inventario/domain/stock.mjs";
export { productionSummary } from "../features/produccion/domain/summary.mjs";
export { balanceSummary } from "../features/balance/domain/summary.mjs";
