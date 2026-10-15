"use client";
import { useState } from "react";
import type { CostInput, IngredientInput, NumericInput } from "@/lib/domain-types";
import type { ProductionValues, FormProps } from "@/shared/types/forms";
import { day } from "@/shared/lib/format";
import { productionFormPreview } from "./production-form-preview";

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
  const { bags, weight, nuclei, ingredients, estimated, real } = productionFormPreview(
    state,
    counts,
    adjust,
    costs,
    values,
  );
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
