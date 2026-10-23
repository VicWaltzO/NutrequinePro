import type { AppState, NumericInput, CostInput } from "@/lib/domain-types";
import type { ProductionValues } from "@/shared/types/forms";
import { resolveProductionIngredient } from "./production-ingredient-input.ts";
import type { ProductionIngredientDraft } from "./production-ingredient-input";
import { isNucleusProduct } from "../../../shared/domain/presentation.mjs";

import {
  nucleusHundredths,
  perNucleusAmount,
  productionYield,
} from "../../../shared/domain/production-quantities.mjs";

// These estimates mirror editable input, not the confirmed historical snapshot.
export function productionFormPreview(
  state: AppState,
  counts: Record<string, NumericInput>,
  adjust: Record<string, ProductionIngredientDraft>,
  costs: CostInput[],
  values: ProductionValues,
) {
  const consumption: Record<string, number> = {};
  let bags = 0;
  let weight = 0;
  let nonCommercialWeight = 0;
  let totalNucleusHundredths = 0;
  let quantityError = "";
  for (const product of state.products) {
    if (!isNucleusProduct(product)) continue;
    let hundredths;
    try {
      hundredths = nucleusHundredths(counts[product.id] || 0);
    } catch {
      quantityError = "Usa núcleos entre 0 y 10 000 000, con hasta 2 decimales (coma o punto).";
      continue;
    }
    const nucleiCount = hundredths / 100;
    if (nucleiCount <= 0) continue;
    totalNucleusHundredths += hundredths;
    let output;
    try {
      output = productionYield(
        hundredths,
        product.bags_per_nucleus,
        product.commercial_weight_per_nucleus_kg,
      );
    } catch {
      quantityError = "La cantidad excede el rango de cálculo permitido.";
      continue;
    }
    bags += output.bags;
    weight += output.weight;
    nonCommercialWeight += output.nonCommercialWeight;
    const formula = state.formulas.find((x) => x.product_id === product.id && x.is_active);
    try {
      state.formulaIngredients
        .filter((x) => x.formula_id === formula?.id)
        .forEach(
          (x) =>
            (consumption[x.ingredient_id] =
              (consumption[x.ingredient_id] ?? 0) + perNucleusAmount(x.kg_per_nucleus, hundredths)),
        );
    } catch {
      quantityError = "La cantidad excede el rango de cálculo permitido.";
    }
  }
  const allIngredients = Object.entries(consumption).map(([id, w]) => {
    const ingredient = state.ingredients.find((ingredient) => ingredient.id === id);
    if (!ingredient) throw new Error("Insumo no encontrado.");
    const resolved = resolveProductionIngredient(ingredient, w, adjust[id]);
    return { ing: ingredient, w, ...resolved, a: resolved.input };
  });
  let costError = "";
  let extra = 0;
  try {
    extra =
      costs.reduce((a, c) => a + Math.round(Number(c.amount ?? 0) * 100), 0) +
      perNucleusAmount(Math.round(Number(values.nucleus_cost) * 100), totalNucleusHundredths) +
      Math.round(Number(values.packaging_cost) * 100) * bags;
  } catch {
    costError = "El costo excede el rango de cálculo permitido.";
  }
  const ingredients = allIngredients.filter((row) => row.w > 0);
  const estimated = allIngredients.reduce((a, x) => a + x.net, 0) + extra;
  const real =
    allIngredients.reduce(
      (a, x) =>
        a +
        (x.a.actual_charge != null && x.a.actual_charge !== ""
          ? Math.round(Number(x.a.actual_charge) * 100)
          : x.net),
      0,
    ) + extra;

  return {
    bags,
    weight,
    nonCommercialWeight,
    nuclei: totalNucleusHundredths / 100,
    ingredients,
    estimated,
    real,
    ingredientInputs: allIngredients.map((row) => row.a),
    errors: [
      ...(quantityError ? [quantityError] : []),
      ...(costError ? [costError] : []),
      ...allIngredients.filter((row) => row.error).map((row) => row.error),
    ],
    quantityError,
  };
}
