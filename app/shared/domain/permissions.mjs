import { requireValue } from "./core.mjs";

// Explicit command roles preserve the approved policy and existing domain guards.
// A role never replaces recipe authorization, consent, version or balance checks.
export const COMMAND_ROLES = Object.freeze({
  MICRO_RECEIPT_RECTIFY: Object.freeze(["ADMIN"]),
  MICRO_PREPARATION_RECTIFY: Object.freeze(["ADMIN", "OPERATOR"]),
  COST_START: Object.freeze(["ADMIN"]),
  COST_RECOGNIZE: Object.freeze(["ADMIN"]),
  COST_SETTLE: Object.freeze(["ADMIN"]),
  COST_ADJUST: Object.freeze(["ADMIN"]),
  MILL_COST_INPUT: Object.freeze(["ADMIN", "OPERATOR"]),
  MILL_RECONCILE: Object.freeze(["ADMIN", "OPERATOR"]),
  MILL_CLOSE: Object.freeze(["ADMIN", "OPERATOR"]),
  JOURNEY_CREATE: Object.freeze(["ADMIN", "OPERATOR"]),
  JOURNEY_LINK: Object.freeze(["ADMIN", "OPERATOR"]),
  MICRO_SUBSTITUTE: Object.freeze(["ADMIN", "OPERATOR"]),
  MICRO_ADOPT: Object.freeze(["ADMIN", "OPERATOR"]),
  MICRO_GROUP_LINK: Object.freeze(["ADMIN", "OPERATOR"]),
  MICRO_PREPARATION_CONFIRM: Object.freeze(["ADMIN", "OPERATOR"]),
  MICRO_ASSIGN: Object.freeze(["ADMIN", "OPERATOR"]),
  MICRO_ASSIGNMENT_REVERSE: Object.freeze(["ADMIN", "OPERATOR"]),
  MICRO_PREPARATION_CREATE: Object.freeze(["ADMIN", "OPERATOR"]),
  MICRO_FORMULA_SAVE: Object.freeze(["ADMIN"]),
  MICRO_FORMULA_ACTIVATE: Object.freeze(["ADMIN"]),
  MICRO_RECEIPT_SAVE: Object.freeze(["ADMIN"]),
  MICRO_PURCHASE_SAVE: Object.freeze(["ADMIN"]),
  MICRO_PURCHASE_CANCEL: Object.freeze(["ADMIN"]),
  MICRO_SAVE: Object.freeze(["ADMIN"]),
  MICRO_OPEN: Object.freeze(["ADMIN"]),
  MICRO_CORRECT: Object.freeze(["ADMIN"]),
  SALE_COVERAGE_ADOPT: Object.freeze(["ADMIN"]),
  SALE_DELIVERY_DATE_UPDATE: Object.freeze(["ADMIN"]),
  CUSTOMER_SAVE: Object.freeze(["ADMIN", "OPERATOR"]),
  CUSTOMER_SITES_SAVE: Object.freeze(["ADMIN", "OPERATOR"]),
  SITE_SAVE: Object.freeze(["ADMIN", "OPERATOR"]),
  PRODUCT_SAVE: Object.freeze(["ADMIN"]),
  INGREDIENT_SAVE: Object.freeze(["ADMIN"]),
  CUSTOMER_DELETE: Object.freeze(["ADMIN", "OPERATOR"]),
  FORMULA_SAVE: Object.freeze(["ADMIN", "OPERATOR"]),
  PRODUCTION_SAVE: Object.freeze(["ADMIN", "OPERATOR"]),
  PRODUCTION_CONFIRM: Object.freeze(["ADMIN"]),
  PRODUCTION_RECONCILE: Object.freeze(["ADMIN"]),
  PRODUCTION_CORRECT: Object.freeze(["ADMIN"]),
  PRODUCTION_CORRECT_QUANTITIES: Object.freeze(["ADMIN"]),
  PRODUCTION_CLOSE: Object.freeze(["ADMIN"]),
  PRODUCTION_CANCEL: Object.freeze(["ADMIN"]),
  SALE_SAVE: Object.freeze(["ADMIN", "OPERATOR"]),
  SALE_DELIVER: Object.freeze(["ADMIN", "OPERATOR"]),
  PAYMENT_CREATE: Object.freeze(["ADMIN", "OPERATOR"]),
  PAYMENT_APPLY_CREDIT: Object.freeze(["ADMIN", "OPERATOR"]),
  PAYMENT_REVERSE: Object.freeze(["ADMIN"]),
  SALE_CORRECT: Object.freeze(["ADMIN"]),
  SALE_CANCEL: Object.freeze(["ADMIN"]),
  RETURN_CREATE: Object.freeze(["ADMIN", "OPERATOR"]),
  EXPENSE_CREATE: Object.freeze(["ADMIN", "OPERATOR"]),
  EXPENSE_CANCEL: Object.freeze(["ADMIN"]),
  INVENTORY_ADJUST: Object.freeze(["ADMIN"]),
  CONFIG_SAVE: Object.freeze(["ADMIN"]),
  USER_SAVE: Object.freeze(["ADMIN"]),
});

export function assertCommandPermission(actor, type) {
  requireValue(actor && actor.is_active !== false, "Usuario no autorizado.");
  requireValue(["ADMIN", "OPERATOR", "VIEWER"].includes(actor.role), "Rol inválido.");
  requireValue(actor.role !== "VIEWER", "Este usuario solo puede consultar.");
  requireValue(Object.hasOwn(COMMAND_ROLES, type), "Operación desconocida.");
  requireValue(COMMAND_ROLES[type].includes(actor.role), "Esta acción requiere administrador.");
}
