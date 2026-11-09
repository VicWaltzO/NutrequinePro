import { seedState } from "../../lib/domain.mjs";
export const actor = { id: "receipt-admin", name: "Administrador sintético", role: "ADMIN", is_active: true };
export const identity = { userId: actor.id, displayName: actor.name };
export function fixture() {
  const s = seedState();
  s.users = [actor];
  s.microIngredients = [1, 2].map((id) => ({
    id: `m${id}`,
    name: `Micro ficticio ${id}`,
    operational_id: id,
    is_active: true,
    unit: "KG",
    known_price_per_kg: null,
  }));
  s.microOpenings = s.microIngredients.map((m, i) => ({
    id: `o${i}`,
    micro_ingredient_id: m.id,
    quantity_grams: 5000,
    cutoff_date: i ? "2026-10-20" : "2026-10-30",
    unit_cost_cents: 200,
    valuation_cents: 1000,
    version: 1,
  }));
  s.inventoryMovements.push({
    id: "finished-stock",
    item_type: "PRODUCT",
    item_id: "prod-1",
    quantity: 3,
    weight_kg: 75000,
  });
  return s;
}
export const payload = (extra = {}) => ({
  status: "CONFIRMED",
  supplier: "Proveedor ficticio",
  reference: "OP-001",
  source: "Ensayo sintético",
  document_date: "2026-11-01",
  total: "28",
  discount: "0",
  currency: "PEN",
  payment_method: "CASH",
  reviewed_expenses: true,
  receive_confirmed: true,
  lines: [
    { micro_ingredient_id: "m1", quantity_kg: "5", unit_price: "4", amount: "20", discount: "0" },
    { micro_ingredient_id: "m2", quantity_kg: "2", unit_price: "4", amount: "8", discount: "0" },
  ],
  ...extra,
});
