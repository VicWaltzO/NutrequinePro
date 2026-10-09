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
  const { add, movement, s, actor, clock } = context;
  const productionRows = (pr, input) => {
    requireValue(input.products?.length > 0, "Agregue productos a producir.");
    requireValue(
      new Set(input.products.map((x) => x.product_id)).size === input.products.length,
      "Producto repetido en producción.",
    );
    const totals = {};
    const nucleusCost = scaled(input.nucleus_cost ?? s.config.default_nucleus_cost / 100),
      bagCost = scaled(input.packaging_cost ?? s.config.default_packaging_cost / 100);
    let nuclei = 0,
      bags = 0;
    for (const row of input.products) {
      const prod = pick(s, "products", row.product_id);
      requireValue(prod.is_active, "Producto inactivo.");
      const n = positiveInt(row.nuclei_count, "Núcleos");
      const formula = s.formulas.find((x) => x.product_id === prod.id && x.is_active);
      requireValue(formula, "Fórmula activa no disponible.");
      const fi = s.formulaIngredients.filter((x) => x.formula_id === formula.id);
      requireValue(fi.length > 0, "Fórmula sin insumos.");
      const fw = sum(fi, (x) => x.kg_per_nucleus) * n;
      add("productionProducts", {
        production_id: pr.id,
        product_id: prod.id,
        formula_id: formula.id,
        formula_snapshot: structuredClone(fi),
        nuclei_count: n,
        bags_per_nucleus_snapshot: prod.bags_per_nucleus,
        bags_produced: n * prod.bags_per_nucleus,
        commercial_weight_per_nucleus_snapshot: prod.commercial_weight_per_nucleus_kg,
        commercial_weight_kg: n * prod.commercial_weight_per_nucleus_kg,
        formula_weight_kg: fw,
        is_current: true,
      });
      nuclei += n;
      bags += n * prod.bags_per_nucleus;
      fi.forEach((x) => (totals[x.ingredient_id] = (totals[x.ingredient_id] ?? 0) + x.kg_per_nucleus * n));
    }
    for (const [ingredient_id, total_kg] of Object.entries(totals)) {
      const ing = pick(s, "ingredients", ingredient_id);
      const adj = (input.ingredients ?? []).find((x) => x.ingredient_id === ingredient_id) ?? {};
      const gross = roundedProduct(total_kg, ing.current_price_per_kg, 1000);
      const discount = scaled(adj.discount_amount ?? 0);
      requireValue(discount <= gross, "Descuento supera costo del insumo.");
      const actual = adj.actual_charge === "" || adj.actual_charge == null ? null : scaled(adj.actual_charge);
      add("productionIngredients", {
        production_id: pr.id,
        ingredient_id,
        total_kg,
        historical_price_per_kg: ing.current_price_per_kg,
        theoretical_gross_cost: gross,
        discount_amount: discount,
        theoretical_net_cost: gross - discount,
        actual_charge: actual,
        difference: actual === null ? null : actual - (gross - discount),
        notes: adj.notes ?? "",
        is_paid: !!adj.is_paid,
        is_current: true,
      });
    }
    add("productionCosts", {
      production_id: pr.id,
      category: "NUCLEUS",
      description: "Núcleos",
      quantity: nuclei,
      unit_cost: nucleusCost,
      amount: nuclei * nucleusCost,
      is_paid: !!input.nucleus_paid,
      is_current: true,
    });
    add("productionCosts", {
      production_id: pr.id,
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
      if (c.ingredient_id) pick(s, "ingredients", c.ingredient_id);
      if (c.category === "INGREDIENT_EXTRA")
        requireValue(c.ingredient_id, "Seleccione insumo para costo extraordinario.");
      const amount = scaled(c.amount);
      requireValue(amount > 0, "Costo adicional debe ser mayor que cero.");
      add("productionCosts", {
        production_id: pr.id,
        category: c.category,
        description: text(c.description, "Descripción"),
        amount,
        ingredient_id: c.ingredient_id || null,
        notes: c.notes ?? "",
        is_paid: !!c.is_paid,
        is_current: true,
      });
    }
    pr.input_snapshot = structuredClone(input);
    pr.nucleus_cost_snapshot = nucleusCost;
    pr.packaging_cost_snapshot = bagCost;
  };
  const confirmProduction = (pr) => {
    requireValue(pr.status === "DRAFT", "Solo puede confirmar un borrador.");
    const a = productionSummary(s, pr);
    requireValue(a.products.length > 0, "Producción vacía.");
    pr.status = "CONFIRMED";
    pr.confirmed_at = clock;
    pr.confirmed_by = actor.id;
    for (const x of a.products)
      movement({
        item_type: "PRODUCT",
        item_id: x.product_id,
        movement_type: "PRODUCTION_IN",
        quantity: x.bags_produced,
        weight_kg: x.commercial_weight_kg,
        source_type: "PRODUCTION",
        source_id: pr.id,
        notes: pr.code,
      });
    for (const x of a.ingredients)
      movement({
        item_type: "INGREDIENT",
        item_id: x.ingredient_id,
        movement_type: "CONSUMPTION_OUT",
        quantity: 0,
        weight_kg: -x.total_kg,
        source_type: "PRODUCTION",
        source_id: pr.id,
        notes: pr.code,
      });
  };
  return { productionRows, confirmProduction };
}
