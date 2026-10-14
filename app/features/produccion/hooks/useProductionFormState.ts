"use client";
import { useState } from "react";
import type { CostInput, IngredientInput, NumericInput } from "@/lib/domain-types";
import type { ProductionValues, FormProps } from "@/shared/types/forms";
import { day, find } from "@/shared/ui";

export function useProductionFormState({ s: state, record }: Pick<FormProps, "s" | "record">) {
  const snapshot = record?.input_snapshot;
  const [values, setValues] = useState<ProductionValues>({
    production_date: record?.production_date ?? day(),
    notes: record?.notes ?? "",
    nucleus_cost: snapshot?.nucleus_cost ?? state.config.default_nucleus_cost / 100,
    packaging_cost: snapshot?.packaging_cost ?? state.config.default_packaging_cost / 100,
    nucleus_paid: !!snapshot?.nucleus_paid,
    packaging_paid: !!snapshot?.packaging_paid,
    confirm: false,
  });
  const set = (k: string, x: string | boolean) => setValues((a) => ({ ...a, [k]: x }));
  const [counts, setCounts] = useState<Record<string, NumericInput>>(
    Object.fromEntries(
      state.products
        .filter((x) => x.is_active)
        .map((p) => [p.id, snapshot?.products?.find((x) => x.product_id === p.id)?.nuclei_count ?? 0]),
    ),
  );
  const [adjust, setAdjust] = useState<Record<string, IngredientInput>>(
    Object.fromEntries((snapshot?.ingredients ?? []).map((x) => [x.ingredient_id, x])),
  );
  const [costs, setCosts] = useState<CostInput[]>(snapshot?.costs ?? []);
  const consumption: Record<string, number> = {};
  let bags = 0;
  let weight = 0;
  let nuclei = 0;
  for (const product of state.products) {
    const nucleiCount = Number(counts[product.id]) || 0;
    nuclei += nucleiCount;
    bags += nucleiCount * product.bags_per_nucleus;
    weight += nucleiCount * product.commercial_weight_per_nucleus_kg;
    const formula = state.formulas.find((x) => x.product_id === product.id && x.is_active);
    state.formulaIngredients
      .filter((x) => x.formula_id === formula?.id)
      .forEach(
        (x) =>
          (consumption[x.ingredient_id] =
            (consumption[x.ingredient_id] ?? 0) + x.kg_per_nucleus * nucleiCount),
      );
  }
  const ingredients = Object.entries(consumption)
    .filter(([, w]) => w > 0)
    .map(([id, w]) => {
      const ingredient = find(state, "ingredients", id);
      if (!ingredient) throw new Error("Insumo no encontrado.");
      const gross = Math.round((w * ingredient.current_price_per_kg) / 1000);
      const a = adjust[id] ?? { ingredient_id: id };
      return { ing: ingredient, w, gross, a, net: gross - Math.round(Number(a.discount_amount ?? 0) * 100) };
    });
  const extra =
    costs.reduce((a, c) => a + Math.round(Number(c.amount ?? 0) * 100), 0) +
    Math.round(Number(values.nucleus_cost) * 100) * nuclei +
    Math.round(Number(values.packaging_cost) * 100) * bags;
  const estimated = ingredients.reduce((a, x) => a + x.net, 0) + extra;
  const real =
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
    v: values,
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
