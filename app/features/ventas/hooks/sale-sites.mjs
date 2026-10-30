const collator = new Intl.Collator("es-PE", { sensitivity: "base", numeric: true });

export function saleSiteContext(state, customerId, siteId) {
  const links = state.customerSites.filter((row) => row.customer_id === customerId);
  const active = new Set(links.filter((row) => row.is_active !== false).map((row) => row.site_id));
  const sites = state.sites.filter((row) => row.is_active).sort((a, b) => collator.compare(a.name, b.name));
  const linked = sites.filter((row) => active.has(row.id));
  const other = sites.filter((row) => !active.has(row.id));
  const principal = links.find(
    (row) => row.is_default && row.is_active !== false && sites.some((site) => site.id === row.site_id),
  );
  const customer = state.customers.find((row) => row.id === customerId);
  const site = sites.find((row) => row.id === siteId);
  const needsChoice = !!(customer?.is_active && !customer.deleted_at && site && !active.has(siteId));
  const key = JSON.stringify([
    customerId,
    siteId,
    customer?.is_active,
    customer?.deleted_at,
    site?.id,
    links.filter((row) => row.site_id === siteId).map((row) => [row.id, row.is_active]),
  ]);
  return { linked, other, principal: principal?.site_id, customer, site, needsChoice, key };
}

export function changeSaleParty(values, field, value, state) {
  const next = { ...values, [field]: value, site_link_mode: "ONE_TIME", confirm_site_link: false };
  if (field === "customer_id") {
    const { principal } = saleSiteContext(state, value, values.site_id);
    if (principal) next.site_id = principal;
  }
  return next;
}
