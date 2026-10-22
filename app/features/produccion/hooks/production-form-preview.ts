import type { AppState, NumericInput, CostInput } from "@/lib/domain-types";
import type { ProductionValues } from "@/shared/types/forms";
import { resolveProductionIngredient } from "./production-ingredient-input.ts";
import type { ProductionIngredientDraft } from "./production-ingredient-input";

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
  let nuclei = 0;
  let quantityError = "";
  for (const product of state.products) {
    const nucleiCount = Number(counts[product.id] ?? 0);
    if (!Number.isSafeInteger(nucleiCount) || nucleiCount < 0 || nucleiCount > 1e7) {
      quantityError = "Los núcleos deben ser cantidades enteras entre 0 y 10 000 000.";
      continue;
    }
    if (nucleiCount <= 0) continue;
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
  const allIngredients = Object.entries(consumption).map(([id, w]) => {
    const ingredient = state.ingredients.find((ingredient) => ingredient.id === id);
    if (!ingredient) throw new Error("Insumo no encontrado.");
    const resolved = resolveProductionIngredient(ingredient, w, adjust[id]);
    return { ing: ingredient, w, ...resolved, a: resolved.input };
  });
  const extra =
    costs.reduce((a, c) => a + Math.round(Number(c.amount ?? 0) * 100), 0) +
    Math.round(Number(values.nucleus_cost) * 100) * nuclei +
    Math.round(Number(values.packaging_cost) * 100) * bags;
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
    nuclei,
    ingredients,
    estimated,
    real,
    ingredientInputs: allIngredients.map((row) => row.a),
    errors: [
      ...(quantityError ? [quantityError] : []),
      ...allIngredients.filter((row) => row.error).map((row) => row.error),
    ],
    quantityError,
  };
}
