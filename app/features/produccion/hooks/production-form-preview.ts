import type { AppState, NumericInput, IngredientInput, CostInput } from "@/lib/domain-types";
import type { ProductionValues } from "@/shared/types/forms";

// These estimates mirror editable input, not the confirmed historical snapshot.
export function productionFormPreview(
  state: AppState,
  counts: Record<string, NumericInput>,
  adjust: Record<string, IngredientInput>,
  costs: CostInput[],
  values: ProductionValues,
) {
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
      const ingredient = state.ingredients.find((ingredient) => ingredient.id === id);
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

  return { bags, weight, nuclei, ingredients, estimated, real };
}
