import { requireValue } from "./core.mjs";
export function assertCommandPermission(actor, type) {
  requireValue(actor && actor.is_active !== false, "Usuario no autorizado.");
  requireValue(["ADMIN", "OPERATOR", "VIEWER"].includes(actor.role), "Rol inválido.");
  requireValue(actor.role !== "VIEWER", "Este usuario solo puede consultar.");
  const adminTypes = [
    "CONFIG_SAVE",
    "USER_SAVE",
    "SALE_CORRECT",
    "SALE_CANCEL",
    "PAYMENT_REVERSE",
    "PRODUCTION_CONFIRM",
    "PRODUCTION_CLOSE",
    "PRODUCTION_CANCEL",
    "PRODUCTION_CORRECT",
    "PRODUCTION_CORRECT_QUANTITIES",
    "INVENTORY_ADJUST",
    "EXPENSE_CANCEL",
  ];
  if (adminTypes.includes(type)) requireValue(actor.role === "ADMIN", "Esta acción requiere administrador.");
}
