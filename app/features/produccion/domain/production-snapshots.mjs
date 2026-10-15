import {
  requireValue,
  positiveInt,
  scaled,
  pick,
  sum,
  roundedProduct,
} from "../../../shared/domain/core.mjs";

export function buildProductionProduct(state, productionId, row) {
  const product = pick(state, "products", row.product_id);
  requireValue(product.is_active, "Producto inactivo.");
  const nucleiCount = positiveInt(row.nuclei_count, "Núcleos");
  const formula = state.formulas.find((x) => x.product_id === product.id && x.is_active);
  requireValue(formula, "Fórmula activa no disponible.");
  const formulaIngredients = state.formulaIngredients.filter((x) => x.formula_id === formula.id);
  requireValue(formulaIngredients.length > 0, "Fórmula sin insumos.");
  const formulaWeight = sum(formulaIngredients, (x) => x.kg_per_nucleus) * nucleiCount;
  return {
    production_id: productionId,
    product_id: product.id,
    formula_id: formula.id,
    formula_snapshot: structuredClone(formulaIngredients),
    nuclei_count: nucleiCount,
    bags_per_nucleus_snapshot: product.bags_per_nucleus,
    bags_produced: nucleiCount * product.bags_per_nucleus,
    commercial_weight_per_nucleus_snapshot: product.commercial_weight_per_nucleus_kg,
    commercial_weight_kg: nucleiCount * product.commercial_weight_per_nucleus_kg,
    formula_weight_kg: formulaWeight,
    is_current: true,
  };
}

export function buildProductionIngredient(state, productionId, ingredient_id, total_kg, adjustments) {
  const ingredient = pick(state, "ingredients", ingredient_id);
  const adjustment = (adjustments ?? []).find((x) => x.ingredient_id === ingredient_id) ?? {};
  const gross = roundedProduct(total_kg, ingredient.current_price_per_kg, 1000);
  const discount = scaled(adjustment.discount_amount ?? 0);
  requireValue(discount <= gross, "Descuento supera costo del insumo.");
  const actual =
    adjustment.actual_charge === "" || adjustment.actual_charge == null
      ? null
      : scaled(adjustment.actual_charge);
  return {
    production_id: productionId,
    ingredient_id,
    total_kg,
    historical_price_per_kg: ingredient.current_price_per_kg,
    theoretical_gross_cost: gross,
    discount_amount: discount,
    theoretical_net_cost: gross - discount,
    actual_charge: actual,
    difference: actual === null ? null : actual - (gross - discount),
    notes: adjustment.notes ?? "",
    is_paid: !!adjustment.is_paid,
    is_current: true,
  };
}
