import { normalize, pick, requireValue, text } from "../../../shared/domain/core.mjs";

/** Called inside executeCommand's cloned state and the store's single SQLite batch. */
export function saveCustomerSites(context, customerId) {
  const { s: state, p: payload, add } = context;
  if (payload.site_ids === undefined && payload.new_sites === undefined) return;
  const ids = payload.site_ids ?? [];
  const names = payload.new_sites ?? [];
  requireValue(Array.isArray(ids) && Array.isArray(names), "Sedes inválidas.");
  requireValue(new Set(ids).size === ids.length, "No repita sedes vinculadas.");
  const previous = state.customerSites.filter((link) => link.customer_id === customerId);
  for (const id of ids) {
    const site = pick(state, "sites", id);
    requireValue(
      site.is_active || previous.some((link) => link.site_id === id && link.is_active),
      "La sede está inactiva.",
    );
  }
  const created = names.map((name) => {
    requireValue(typeof name === "string", "Nombre de sede inválido.");
    const value = text(name, "Nombre de sede");
    requireValue(
      !state.sites.some((site) => normalize(site.name) === normalize(value)),
      "Ya existe una sede con ese nombre. Vincule la sede existente.",
    );
    return add("sites", { name: value, is_active: true }).id;
  });
  const all = [...ids, ...created];
  const selected = payload.default_site_id;
  let principal = selected || all[0];
  if (typeof selected === "string" && /^new:\d+$/.test(selected))
    principal = created[Number(selected.slice(4))];
  requireValue(!selected || all.includes(principal), "La sede principal debe estar vinculada al cliente.");
  for (const link of previous) Object.assign(link, { is_active: false, is_default: false });
  for (const id of all) {
    const values = { is_active: true, is_default: id === principal };
    const link = previous.find((row) => row.site_id === id);
    if (link) Object.assign(link, values);
    else add("customerSites", { customer_id: customerId, site_id: id, ...values });
  }
}

export function customerSitesSave(context) {
  const customer = pick(context.s, "customers", context.p.id);
  requireValue(!customer.deleted_at, "El cliente fue retirado de la lista.");
  saveCustomerSites(context, customer.id);
  customer.updated_at = context.clock;
  return customer.id;
}
