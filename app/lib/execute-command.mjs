import { fail, safe, scaled } from "../shared/domain/core.mjs";
import { nucleusHundredths } from "../shared/domain/production-quantities.mjs";
import { saleSummary } from "../features/ventas/domain/summary.mjs";
import { TABLES } from "./state-schema.mjs";
import { customerSave, configSave, userSave } from "../features/configuracion/domain/commands.mjs";
import { customerDelete } from "../features/clientes/domain/commands.mjs";
import { customerSitesSave } from "../features/clientes/domain/sites.mjs";
import {
  formulaSave,
  productionSave,
  productionConfirm,
  productionReconcile,
  productionCorrectQuantities,
  productionClose,
  productionCancel,
} from "../features/produccion/domain/commands.mjs";
import {
  saleSave,
  saleDeliver,
  saleCorrect,
  saleCancel,
  returnCreate,
} from "../features/ventas/domain/commands.mjs";
import { paymentCreate, paymentApplyCredit, paymentReverse } from "../features/cobranza/domain/commands.mjs";
import { expenseCreate, expenseCancel } from "../features/gastos/domain/commands.mjs";
import { inventoryAdjust } from "../features/inventario/domain/commands.mjs";
import { createPaymentOperations } from "../features/cobranza/domain/operations.mjs";
import { createSaleOperations } from "../features/ventas/domain/operations.mjs";
import { createProductionOperations } from "../features/produccion/domain/operations.mjs";
import { createCommandContext } from "./command-context.mjs";
import { assertCommandPermission } from "../shared/domain/permissions.mjs";
import { validateMasterCommand } from "./master-command-contracts.mjs";
import { guardCoverageMode } from "../features/ventas/domain/coverage.mjs";
import { saleDeliveryDateUpdate } from "../features/ventas/domain/update-delivery-date.mjs";
const handlers = {
  SALE_DELIVERY_DATE_UPDATE: saleDeliveryDateUpdate,
  CUSTOMER_SAVE: customerSave,
  CUSTOMER_SITES_SAVE: customerSitesSave,
  SITE_SAVE: customerSave,
  PRODUCT_SAVE: customerSave,
  INGREDIENT_SAVE: customerSave,
  CUSTOMER_DELETE: customerDelete,
  FORMULA_SAVE: formulaSave,
  PRODUCTION_SAVE: productionSave,
  PRODUCTION_CONFIRM: productionConfirm,
  PRODUCTION_RECONCILE: productionReconcile,
  PRODUCTION_CORRECT: productionReconcile,
  PRODUCTION_CORRECT_QUANTITIES: productionCorrectQuantities,
  PRODUCTION_CLOSE: productionClose,
  PRODUCTION_CANCEL: productionCancel,
  SALE_SAVE: saleSave,
  SALE_DELIVER: saleDeliver,
  PAYMENT_CREATE: paymentCreate,
  PAYMENT_APPLY_CREDIT: paymentApplyCredit,
  PAYMENT_REVERSE: paymentReverse,
  SALE_CORRECT: saleCorrect,
  SALE_CANCEL: saleCancel,
  RETURN_CREATE: returnCreate,
  EXPENSE_CREATE: expenseCreate,
  EXPENSE_CANCEL: expenseCancel,
  INVENTORY_ADJUST: inventoryAdjust,
  CONFIG_SAVE: configSave,
  USER_SAVE: userSave,
};
export function executeCommand(original, command, actor, clock = new Date().toISOString(), options = {}) {
  const state = structuredClone(original);
  const { type, payload: payload = {} } = command;
  assertCommandPermission(actor, type);
  guardCoverageMode(state, type, options.partialReservations === true);
  validateMasterCommand(state, type, payload);
  const context = createCommandContext(state, type, payload, actor, clock, options);
  Object.assign(
    context,
    createPaymentOperations(context),
    createSaleOperations(context),
    createProductionOperations(context),
  );
  const { add } = context;
  const refresh = () => {
    for (const sale of state.sales) {
      sale.financial_status = saleSummary(state, sale).financial_status;
    }
  };
  const handler = Object.hasOwn(handlers, type) ? handlers[type] : null;
  if (!handler) fail("Operación desconocida.");
  const result = handler(context);
  for (const table of TABLES)
    for (const row of state[table])
      for (const [field, value] of Object.entries(row)) {
        if (typeof value !== "number") continue;
        if (table === "productionProducts" && field === "nuclei_count") nucleusHundredths(value);
        else if (table === "productionCosts" && row.category === "NUCLEUS" && field === "quantity")
          scaled(value);
        else safe(value);
      }
  refresh();
  add("audit", {
    action: type,
    entity_id: result,
    payload: structuredClone(payload),
    actor_name: actor.name,
    actor_role: actor.role,
  });
  state.revision++;
  return { state: state, result };
}
