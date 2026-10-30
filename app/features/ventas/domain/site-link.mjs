import { requireValue } from "../../../shared/domain/core.mjs";

/** Legacy callers default to a one-time destination. Validate before any mutation. */
export function validateSaleSiteLink(payload) {
  for (const field of ["confirm", "deliver", "create_production", "confirm_site_link"])
    if (Object.hasOwn(payload, field))
      requireValue(typeof payload[field] === "boolean", "Indicador inválido: " + field + ".");
  const mode = Object.hasOwn(payload, "site_link_mode") ? payload.site_link_mode : "ONE_TIME";
  requireValue(["ONE_TIME", "LINK"].includes(mode), "Modo de vínculo de sede inválido.");
  if (mode === "LINK") {
    requireValue(
      payload.confirm === true && payload.confirm_site_link === true,
      "Vincular sede requiere confirmar expresamente el vínculo y la venta.",
    );
  } else {
    requireValue(
      payload.confirm_site_link !== true,
      "Confirmación de vínculo incompatible con solo esta venta.",
    );
  }
  return mode;
}

/** Runs in the same cloned state and SQLite batch as the confirmed sale. */
export function linkConfirmedSaleSite(context, customerId, siteId) {
  const link = context.s.customerSites.find(
    (row) => row.customer_id === customerId && row.site_id === siteId,
  );
  if (link) link.is_active = true;
  else
    context.add("customerSites", {
      customer_id: customerId,
      site_id: siteId,
      is_default: false,
      is_active: true,
    });
}
