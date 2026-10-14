import type { FormProps, SimpleFields } from "@/shared/types/forms";
import { day } from "@/shared/lib/format";
export function simpleFormInitial({ s, record, kind }: Pick<FormProps, "s" | "record" | "kind">) {
  const defaults: Record<string, SimpleFields> = {
    customer: { name: "", is_active: true, site_ids: [] },
    site: { name: "", is_active: true },
    ingredient: { name: "", is_active: true, current_price_per_kg: 0 },
    product: {
      name: "",
      category: "PREMIUM",
      default_sale_price: 0,
      standard_bag_weight_kg: 25,
      bags_per_nucleus: 40,
      commercial_weight_per_nucleus_kg: 1000,
      is_active: true,
      is_sellable: true,
    },
    expense: {
      date: day(),
      category: s.config.default_expense_category ?? s.config.expense_categories[0],
      description: "",
      amount: "",
      production_id: "",
      sale_id: "",
      site_id: "",
      ingredient_id: "",
      notes: "",
    },
    adjust: { date: day(), product_id: "", quantity: "", weight_kg: "", direction: "IN", reason: "" },
    config: {
      ...s.config,
      default_payment_condition: s.config.default_payment_condition ?? "CREDIT",
      default_payment_method: s.config.default_payment_method ?? "",
      default_expense_category: s.config.default_expense_category ?? s.config.expense_categories[0],
      default_nucleus_cost: s.config.default_nucleus_cost / 100,
      default_packaging_cost: s.config.default_packaging_cost / 100,
      categories_text: s.config.expense_categories.join(", "),
    },
    user: { id: "", name: "", role: "VIEWER", is_active: true },
    reason: { reason: "", date: day() },
  };
  const initial = { ...defaults[kind ?? "reason"], ...record };
  if (kind === "product" && record) {
    initial.default_sale_price = (record.default_sale_price ?? 0) / 100;
    for (const k of ["standard_bag_weight_kg", "commercial_weight_per_nucleus_kg"] as const)
      initial[k] = (record[k] ?? 0) / 1000;
  }
  if (kind === "ingredient" && record)
    initial.current_price_per_kg = (record.current_price_per_kg ?? 0) / 100;
  if (kind === "customer" && record)
    initial.site_ids = s.customerSites
      .filter((x) => x.customer_id === record.id && x.is_active !== false)
      .map((x) => x.site_id);
  return initial;
}
