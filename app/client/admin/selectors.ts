import type { AppState } from "@/lib/domain-types";
import type { Searchable } from "@/shared/types/admin";
import { saleSummary, normalize } from "@/lib/domain-preview.mjs";
import { find } from "@/shared/lib/find";
export function adminSelectors(
  state: AppState,
  {
    q,
    filter,
    client,
    site,
    from,
    to,
    tab,
  }: { q: string; filter: string; client: string; site: string; from: string; to: string; tab: string },
) {
  const match = (x: Searchable) => {
    const recordDate =
      x.sale_date ??
      x.production_date ??
      x.payment_date ??
      x.return_date ??
      x.date ??
      x.created_at?.slice(0, 10) ??
      "";
    return (
      (!q ||
        normalize(
          [
            x.code,
            x.name,
            x.description,
            x.reason,
            x.reference,
            find(state, x.item_type === "INGREDIENT" ? "ingredients" : "products", x.item_id)?.name,
            find(state, "customers", x.customer_id)?.name,
            find(state, "sites", x.site_id)?.name,
          ].join(" "),
        ).includes(normalize(q))) &&
      (!from || !recordDate || recordDate >= from) &&
      (!to || !recordDate || recordDate <= to) &&
      (!client || x.customer_id === client) &&
      (!site || x.site_id === site)
    );
  };
  const sales = state.sales
    .filter(
      (x) =>
        match(x) &&
        (!filter ||
          [x.commercial_status, x.fulfillment_status, saleSummary(state, x).financial_status].includes(
            filter,
          )) &&
        (tab === "all" ||
          (tab === "future" &&
            x.fulfillment_status === "PENDING" &&
            !["DRAFT", "CANCELLED"].includes(x.commercial_status)) ||
          (tab === "draft" && x.commercial_status === "DRAFT") ||
          (tab === "cancelled" && x.commercial_status === "CANCELLED")),
    )
    .slice()
    .reverse();
  const pending = state.sales.filter(
    (x) =>
      !["DRAFT", "CANCELLED"].includes(x.commercial_status) &&
      saleSummary(state, x).balance > 0 &&
      match(x) &&
      (!filter || saleSummary(state, x).financial_status === filter),
  );
  const productions = state.productions
    .filter((x) => match(x) && (!filter || x.status === filter) && (tab !== "draft" || x.status === "DRAFT"))
    .slice()
    .reverse();
  let productionAction: [string, string] = ["production", "Nueva producción"];
  if (tab === "ingredients") productionAction = ["ingredient", "Nuevo insumo"];
  else if (tab === "formulas") productionAction = ["formula", "Nueva fórmula"];

  const primary: Record<string, [string, string]> = {
    sales: ["sale", "Nueva venta"],
    collections: ["payment", "Registrar pago"],
    customers: tab === "sites" ? ["site", "Nueva sede"] : ["customer", "Nuevo cliente"],
    ...(tab === "products" ? { config: ["product", "Nuevo producto"] as [string, string] } : {}),
    productions: productionAction,
    inventory: ["adjust", "Ajustar inventario"],
    expenses: ["expense", "Registrar gasto"],
  };
  return { match, sales, pending, productions, primary };
}
