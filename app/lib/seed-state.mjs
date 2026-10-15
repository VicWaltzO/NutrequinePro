import { TABLES } from "./state-schema.mjs";
export function emptyState() {
  return {
    revision: 0,
    config: {
      company_name: "Nutrequine Pro",
      currency: "PEN",
      timezone: "America/Lima",
      default_nucleus_cost: 25000,
      default_packaging_cost: 110,
      expense_categories: ["LOGISTICS", "OPERATING", "ADMINISTRATIVE", "OTHER"],
    },
    ...Object.fromEntries(TABLES.map((t) => [t, []])),
  };
}
export function seedState() {
  const state = emptyState();
  const stamp = "2026-10-06T00:00:00-05:00";
  const names = [
    "Torta soya HiPro",
    "HNA integral soya extruida",
    "Maíz nacional Perú",
    "Subproducto trigo molido",
    "Aceite premium",
    "Melaza de caña",
    "Heno alfalfa molida",
    "Carbonato calcio fino",
    "Sal común",
    "Silvafeed Gunny",
  ];
  const prices = [210, 220, 140, 100, 650, 120, 160, 30, 60, 374];
  state.ingredients = names.map((name, i) => ({
    id: `ing-${i + 1}`,
    name,
    current_price_per_kg: prices[i],
    is_active: true,
    created_at: stamp,
    updated_at: stamp,
  }));
  const products = [
    ["Potripregnant", 7300, 25, 40, 1000, true, "potripregnant"],
    ["Hi-Performance", 6700, 25, 40, 1000, true, "hi-performance"],
    ["Nutrelin Adulto", 6900, 25, 40, 1000, true, "nutrelin"],
    ["BASE", 0, 50, 30, 1500, false, null],
  ];
  const formulas = [
    [122, 75, 100, 580, 15, 25, 50, 12, 8, 1],
    [10, 64, 100, 700, 15, 25, 50, 12, 8, 1],
    [40, 20, 0, 840, 15, 25, 30, 12, 8, 1],
    [200, 150, 150, 850, 20, 30, 75, 15, 10, 1],
  ];
  state.products = products.map(([name, price, weight, bags, commercial, sellable, image], i) => ({
    id: `prod-${i + 1}`,
    name,
    category: i === 3 ? "STANDARD" : "PREMIUM",
    default_sale_price: price,
    standard_bag_weight_kg: weight * 1000,
    bags_per_nucleus: bags,
    commercial_weight_per_nucleus_kg: commercial * 1000,
    is_sellable: sellable,
    is_active: true,
    image,
    created_at: stamp,
    updated_at: stamp,
  }));
  products.forEach((_, i) => {
    state.formulas.push({
      id: `formula-${i + 1}-1`,
      product_id: `prod-${i + 1}`,
      version: 1,
      valid_from: "2026-10-06",
      valid_to: null,
      is_active: true,
      created_at: stamp,
    });
    formulas[i].forEach((kg, j) =>
      state.formulaIngredients.push({
        id: `fi-${i + 1}-${j + 1}`,
        formula_id: `formula-${i + 1}-1`,
        ingredient_id: `ing-${j + 1}`,
        kg_per_nucleus: kg * 1000,
      }),
    );
  });
  // Historical destinations are reference master data, never logic branches.
  state.sites = ["Lima Polo Club", "Quilmaná", "Club Hípico Villa", "Hipódromo", "Rancho Los Caballos"].map(
    (name, i) => ({ id: `site-${i + 1}`, name, is_active: true, created_at: stamp, updated_at: stamp }),
  );
  return state;
}
