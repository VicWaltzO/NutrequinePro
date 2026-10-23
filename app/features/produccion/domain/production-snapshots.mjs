import { requireValue, scaled, pick, sum, roundedProduct } from "../../../shared/domain/core.mjs";
import { isNucleusProduct, validateNucleusWeight } from "../../../shared/domain/presentation.mjs";

import {
  nucleusHundredths,
  perNucleusAmount,
  productionYield,
} from "../../../shared/domain/production-quantities.mjs";

export function buildProductionProduct(state, productionId, row) {
  const product = pick(state, "products", row.product_id);
  requireValue(product.is_active, "Producto inactivo.");
  requireValue(
    isNucleusProduct(product),
    "El producto requiere ingreso directo al inventario; no admite producción por núcleos.",
  );
  const hundredths = nucleusHundredths(row.nuclei_count);
  requireValue(hundredths > 0, "Núcleos debe ser mayor que cero.");
  const nucleiCount = hundredths / 100;
  validateNucleusWeight(product);
  const formula = state.formulas.find((x) => x.product_id === product.id && x.is_active);
  requireValue(formula, "Fórmula activa no disponible.");
  const formulaIngredients = state.formulaIngredients.filter((x) => x.formula_id === formula.id);
  requireValue(formulaIngredients.length > 0, "Fórmula sin insumos.");
  const formulaWeight = sum(formulaIngredients, (x) => perNucleusAmount(x.kg_per_nucleus, hundredths));
  const output = productionYield(
    hundredths,
    product.bags_per_nucleus,
    product.commercial_weight_per_nucleus_kg,
  );
  return {
    production_id: productionId,
    product_id: product.id,
    formula_id: formula.id,
    formula_snapshot: structuredClone(formulaIngredients),
    nuclei_count: nucleiCount,
    bags_per_nucleus_snapshot: product.bags_per_nucleus,
    bags_produced: output.bags,
    commercial_weight_per_nucleus_snapshot: product.commercial_weight_per_nucleus_kg,
    commercial_weight_kg: output.weight,
    formula_weight_kg: formulaWeight,
    is_current: true,
  };
}

export function buildProductionIngredient(state, productionId, ingredient_id, total_kg, adjustments) {
  const ingredient = pick(state, "ingredients", ingredient_id);
  const adjustment = (adjustments ?? []).find((x) => x.ingredient_id === ingredient_id) ?? {};
  const price =
    adjustment.price_per_kg === undefined ? ingredient.current_price_per_kg : scaled(adjustment.price_per_kg);
  const gross = roundedProduct(total_kg, price, 1000);
  const discount = scaled(adjustment.discount_amount ?? 0);
  requireValue(discount <= gross, "Descuento supera costo del insumo.");
  requireValue(
    adjustment.actual_charge_mode === undefined || ["auto", "manual"].includes(adjustment.actual_charge_mode),
    "Modo de cobro real inválido.",
  );
  let actual = null;
  if (adjustment.actual_charge_mode === "auto") actual = gross - discount;
  else if (adjustment.actual_charge !== "" && adjustment.actual_charge != null)
    actual = scaled(adjustment.actual_charge);
  return {
    production_id: productionId,
    ingredient_id,
    total_kg,
    historical_price_per_kg: price,
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
