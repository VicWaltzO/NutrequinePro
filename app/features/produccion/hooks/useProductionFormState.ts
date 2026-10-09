"use client";
import { useState } from "react";
import type { CostInput } from "@/lib/domain-types";
import type { IngredientInput } from "@/lib/domain-types";
import type { NumericInput } from "@/lib/domain-types";
import type { ProductionValues } from "@/shared/types/forms";
import { day } from "@/shared/ui";
import { find } from "@/shared/ui";
import type { FormProps } from "@/shared/types/forms";
export function useProductionFormState({ s, record }: Pick<FormProps, "s" | "record">) {
  const snapshot = record?.input_snapshot;
  const [v, setV] = useState<ProductionValues>({
    production_date: record?.production_date ?? day(),
    notes: record?.notes ?? "",
    nucleus_cost: snapshot?.nucleus_cost ?? s.config.default_nucleus_cost / 100,
    packaging_cost: snapshot?.packaging_cost ?? s.config.default_packaging_cost / 100,
    nucleus_paid: !!snapshot?.nucleus_paid,
    packaging_paid: !!snapshot?.packaging_paid,
    confirm: false,
  });
  const set = (k: string, x: string | boolean) => setV((a) => ({ ...a, [k]: x }));
  const [counts, setCounts] = useState<Record<string, NumericInput>>(
      Object.fromEntries(
        s.products
          .filter((x) => x.is_active)
          .map((p) => [p.id, snapshot?.products?.find((x) => x.product_id === p.id)?.nuclei_count ?? 0]),
      ),
    ),
    [adjust, setAdjust] = useState<Record<string, IngredientInput>>(
      Object.fromEntries((snapshot?.ingredients ?? []).map((x) => [x.ingredient_id, x])),
    ),
    [costs, setCosts] = useState<CostInput[]>(snapshot?.costs ?? []);
  const consumption: Record<string, number> = {};
  let bags = 0,
    weight = 0,
    nuclei = 0;
  for (const prod of s.products) {
    const n = Number(counts[prod.id]) || 0;
    nuclei += n;
    bags += n * prod.bags_per_nucleus;
    weight += n * prod.commercial_weight_per_nucleus_kg;
    const f = s.formulas.find((x) => x.product_id === prod.id && x.is_active);
    s.formulaIngredients
      .filter((x) => x.formula_id === f?.id)
      .forEach(
        (x) => (consumption[x.ingredient_id] = (consumption[x.ingredient_id] ?? 0) + x.kg_per_nucleus * n),
      );
  }
  const ingredients = Object.entries(consumption)
    .filter(([, w]) => w > 0)
    .map(([id, w]) => {
      const ing = find(s, "ingredients", id);
      if (!ing) throw new Error("Insumo no encontrado.");
      const gross = Math.round((w * ing.current_price_per_kg) / 1000),
        a = adjust[id] ?? { ingredient_id: id };
      return { ing, w, gross, a, net: gross - Math.round(Number(a.discount_amount ?? 0) * 100) };
    });
  const extra =
      costs.reduce((a, c) => a + Math.round(Number(c.amount ?? 0) * 100), 0) +
      Math.round(Number(v.nucleus_cost) * 100) * nuclei +
      Math.round(Number(v.packaging_cost) * 100) * bags,
    estimated = ingredients.reduce((a, x) => a + x.net, 0) + extra,
    real =
      ingredients.reduce(
        (a, x) =>
          a +
          (x.a.actual_charge !== undefined && x.a.actual_charge !== ""
            ? Math.round(Number(x.a.actual_charge) * 100)
            : x.net),
        0,
      ) + extra;
  const adj = (id: string, k: string, x: string | boolean) =>
    setAdjust((a) => ({ ...a, [id]: { ...a[id], ingredient_id: id, [k]: x } }));
  return {
    v,
    set,
    counts,
    setCounts,
    adjust,
    costs,
    setCosts,
    bags,
    weight,
    nuclei,
    ingredients,
    estimated,
    real,
    adj,
  };
}
