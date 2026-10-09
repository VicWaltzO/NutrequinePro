import type { AppState } from "@/lib/domain-types";
import type { Searchable } from "@/shared/types/admin";
import { saleSummary } from "@/lib/domain.mjs";
import { normalize } from "@/lib/domain.mjs";
import { find } from "@/shared/lib/find";
export function adminSelectors(
  s: AppState,
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
    const d =
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
            find(s, x.item_type === "INGREDIENT" ? "ingredients" : "products", x.item_id)?.name,
            find(s, "customers", x.customer_id)?.name,
            find(s, "sites", x.site_id)?.name,
          ].join(" "),
        ).includes(normalize(q))) &&
      (!from || !d || d >= from) &&
      (!to || !d || d <= to) &&
      (!client || x.customer_id === client) &&
      (!site || x.site_id === site)
    );
  };
  const sales = s.sales
    .filter(
      (x) =>
        match(x) &&
        (!filter ||
          [x.commercial_status, x.fulfillment_status, saleSummary(s, x).financial_status].includes(filter)) &&
        (tab === "all" ||
          (tab === "future" &&
            x.fulfillment_status === "PENDING" &&
            !["DRAFT", "CANCELLED"].includes(x.commercial_status)) ||
          (tab === "draft" && x.commercial_status === "DRAFT") ||
          (tab === "cancelled" && x.commercial_status === "CANCELLED")),
    )
    .slice()
    .reverse();
  const pending = s.sales.filter(
    (x) =>
      !["DRAFT", "CANCELLED"].includes(x.commercial_status) &&
      saleSummary(s, x).balance > 0 &&
      match(x) &&
      (!filter || saleSummary(s, x).financial_status === filter),
  );
  const productions = s.productions
    .filter((x) => match(x) && (!filter || x.status === filter) && (tab !== "draft" || x.status === "DRAFT"))
    .slice()
    .reverse();
  const primary: Record<string, [string, string]> = {
    sales: ["sale", "Nueva venta"],
    collections: ["payment", "Registrar pago"],
    customers: tab === "sites" ? ["site", "Nueva sede"] : ["customer", "Nuevo cliente"],
    ...(tab === "products" ? { config: ["product", "Nuevo producto"] as [string, string] } : {}),
    productions: [
      tab === "ingredients" ? "ingredient" : tab === "formulas" ? "formula" : "production",
      tab === "ingredients" ? "Nuevo insumo" : tab === "formulas" ? "Nueva fórmula" : "Nueva producción",
    ],
    inventory: ["adjust", "Ajustar inventario"],
    expenses: ["expense", "Registrar gasto"],
  };
  return { match, sales, pending, productions, primary };
}
