import { requireValue, scaled, text, pick } from "../../../shared/domain/core.mjs";
import { productionSummary } from "./summary.mjs";
import { buildProductionProduct, buildProductionIngredient } from "./production-snapshots.mjs";
import { nucleusHundredths, perNucleusAmount } from "../../../shared/domain/production-quantities.mjs";
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
    let totalNucleusHundredths = 0;
    let bags = 0;
    for (const row of input.products) {
      const snapshot = buildProductionProduct(state, production.id, row);
      add("productionProducts", snapshot);
      totalNucleusHundredths += nucleusHundredths(snapshot.nuclei_count);
      bags += snapshot.bags_produced;
      snapshot.formula_snapshot.forEach(
        (ingredient) =>
          (totals[ingredient.ingredient_id] =
            (totals[ingredient.ingredient_id] ?? 0) +
            perNucleusAmount(ingredient.kg_per_nucleus, nucleusHundredths(snapshot.nuclei_count))),
      );
    }
    for (const [ingredient_id, total_kg] of Object.entries(totals)) {
      add(
        "productionIngredients",
        buildProductionIngredient(state, production.id, ingredient_id, total_kg, input.ingredients),
      );
    }
    add("productionCosts", {
      production_id: production.id,
      category: "NUCLEUS",
      description: "Núcleos",
      quantity: totalNucleusHundredths / 100,
      unit_cost: nucleusCost,
      amount: perNucleusAmount(nucleusCost, totalNucleusHundredths),
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
