import {
  requireValue,
  scaled,
  positiveInt,
  text,
  pick,
  sum,
  roundedProduct,
} from "../../../shared/domain/core.mjs";
import { productionSummary } from "./summary.mjs";
export function createProductionOperations(context) {
  const { add, movement, s: state, actor, clock } = context;
  const productionRows = (production, input) => {
    requireValue(input.products?.length > 0, "Agregue productos a producir.");
    requireValue(
      new Set(input.products.map((x) => x.product_id)).size === input.products.length,
      "Producto repetido en producción.",
    );
    const totals = {};
    const nucleusCost = scaled(input.nucleus_cost ?? state.config.default_nucleus_cost / 100);
    const bagCost = scaled(input.packaging_cost ?? state.config.default_packaging_cost / 100);
    let nuclei = 0;
    let bags = 0;
    for (const row of input.products) {
      const product = pick(state, "products", row.product_id);
      requireValue(product.is_active, "Producto inactivo.");
      const nucleiCount = positiveInt(row.nuclei_count, "Núcleos");
      const formula = state.formulas.find((x) => x.product_id === product.id && x.is_active);
      requireValue(formula, "Fórmula activa no disponible.");
      const formulaIngredients = state.formulaIngredients.filter((x) => x.formula_id === formula.id);
      requireValue(formulaIngredients.length > 0, "Fórmula sin insumos.");
      const formulaWeight = sum(formulaIngredients, (x) => x.kg_per_nucleus) * nucleiCount;
      add("productionProducts", {
        production_id: production.id,
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
      });
      nuclei += nucleiCount;
      bags += nucleiCount * product.bags_per_nucleus;
      formulaIngredients.forEach(
        (x) => (totals[x.ingredient_id] = (totals[x.ingredient_id] ?? 0) + x.kg_per_nucleus * nucleiCount),
      );
    }
    for (const [ingredient_id, total_kg] of Object.entries(totals)) {
      const ingredient = pick(state, "ingredients", ingredient_id);
      const adjustment = (input.ingredients ?? []).find((x) => x.ingredient_id === ingredient_id) ?? {};
      const gross = roundedProduct(total_kg, ingredient.current_price_per_kg, 1000);
      const discount = scaled(adjustment.discount_amount ?? 0);
      requireValue(discount <= gross, "Descuento supera costo del insumo.");
      const actual =
        adjustment.actual_charge === "" || adjustment.actual_charge == null
          ? null
          : scaled(adjustment.actual_charge);
      add("productionIngredients", {
        production_id: production.id,
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
      });
    }
    add("productionCosts", {
      production_id: production.id,
      category: "NUCLEUS",
      description: "Núcleos",
      quantity: nuclei,
      unit_cost: nucleusCost,
      amount: nuclei * nucleusCost,
      is_paid: !!input.nucleus_paid,
      is_current: true,
    });
    add("productionCosts", {
      production_id: production.id,
      category: "PACKAGING",
      description: "Sacos / envases",
      quantity: bags,
      unit_cost: bagCost,
      amount: bags * bagCost,
      is_paid: !!input.packaging_paid,
      is_current: true,
    });
    for (const c of input.costs ?? []) {
      requireValue(
        ["FREIGHT", "HANDLING", "PERSONNEL", "SERVICE", "INGREDIENT_EXTRA", "OTHER"].includes(c.category),
        "Categoría de costo inválida.",
      );
      if (c.ingredient_id) pick(state, "ingredients", c.ingredient_id);
      if (c.category === "INGREDIENT_EXTRA")
        requireValue(c.ingredient_id, "Seleccione insumo para costo extraordinario.");
      const amount = scaled(c.amount);
      requireValue(amount > 0, "Costo adicional debe ser mayor que cero.");
      add("productionCosts", {
        production_id: production.id,
        category: c.category,
        description: text(c.description, "Descripción"),
        amount,
        ingredient_id: c.ingredient_id || null,
        notes: c.notes ?? "",
        is_paid: !!c.is_paid,
        is_current: true,
      });
    }
    production.input_snapshot = structuredClone(input);
    production.nucleus_cost_snapshot = nucleusCost;
    production.packaging_cost_snapshot = bagCost;
  };
  const confirmProduction = (production) => {
    requireValue(production.status === "DRAFT", "Solo puede confirmar un borrador.");
    const summary = productionSummary(state, production);
    requireValue(summary.products.length > 0, "Producción vacía.");
    production.status = "CONFIRMED";
    production.confirmed_at = clock;
    production.confirmed_by = actor.id;
    for (const x of summary.products)
      movement({
        item_type: "PRODUCT",
        item_id: x.product_id,
        movement_type: "PRODUCTION_IN",
        quantity: x.bags_produced,
        weight_kg: x.commercial_weight_kg,
        source_type: "PRODUCTION",
        source_id: production.id,
        notes: production.code,
      });
    for (const x of summary.ingredients)
      movement({
        item_type: "INGREDIENT",
        item_id: x.ingredient_id,
        movement_type: "CONSUMPTION_OUT",
        quantity: 0,
        weight_kg: -x.total_kg,
        source_type: "PRODUCTION",
        source_id: production.id,
        notes: production.code,
      });
  };
  return { productionRows, confirmProduction };
}
