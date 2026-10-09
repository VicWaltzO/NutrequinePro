import { requireValue, pick } from "../../../shared/domain/core.mjs";
export function customerDelete(context) {
  const { s, p, actor, clock, correction } = context;
  let result = null;
  const customer = pick(s, "customers", p.id);
  requireValue(!customer.deleted_at, "El cliente ya fue retirado de la lista.");
  const old = structuredClone(customer);
  Object.assign(customer, {
    is_active: false,
    deleted_at: clock,
    deleted_by: actor.id,
    updated_at: clock,
  });
  correction("customers", customer.id, old, structuredClone(customer), "Cliente retirado de la lista");
  result = customer.id;
  return result;
}
