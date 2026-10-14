import { sum } from "../../../shared/domain/core.mjs";
export function productionSummary(state, production) {
  const ingredients = state.productionIngredients.filter(
    (x) => x.production_id === production.id && x.is_current !== false,
  );
  const costs = state.productionCosts.filter(
    (x) => x.production_id === production.id && x.is_current !== false,
  );
  const products = state.productionProducts.filter(
    (x) => x.production_id === production.id && x.is_current !== false,
  );
  const additional = sum(costs, (x) => x.amount);
  const estimated = sum(ingredients, (x) => x.theoretical_net_cost) + additional;
  const real = sum(ingredients, (x) => x.actual_charge ?? x.theoretical_net_cost) + additional;
  return {
    ingredients,
    costs,
    products,
    estimated,
    real,
    reconciled: ingredients.length > 0 && ingredients.every((x) => x.actual_charge !== null),
    variation: real - estimated,
    bags: sum(products, (x) => x.bags_produced),
    weight: sum(products, (x) => x.commercial_weight_kg),
  };
}
