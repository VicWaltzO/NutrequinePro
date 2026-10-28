import { test } from "node:test";
import assert from "node:assert/strict";
import { saleFormPreview, saleLineSubtotal } from "../features/ventas/hooks/sale-form-preview.ts";
import { createSaleLine, addSaleProduct } from "../features/ventas/hooks/sale-lines.ts";

const state = { inventoryMovements: [], saleItems: [], sales: [] };
const product = { id: "synthetic", default_sale_price: 7301, unit_weight_grams: 25000 };

test("NQP26-03: cero filas o fila sin producto no aportan importe ni faltante", () => {
  for (const rows of [[], [createSaleLine()], [{ ...createSaleLine(), quantity: 9, unit_price: 80 }]]) {
    assert.deepEqual(saleFormPreview(state, rows, [], false), { missing: [], total: 0 });
    assert.deepEqual(saleFormPreview(state, rows, [], true), { missing: [], total: 0 });
  }
  for (const unit_price of ["invalid", Infinity, "-5"])
    assert.equal(saleLineSubtotal({ ...createSaleLine(product), unit_price }), 0);
});

test("NQP26-03: eliminar recalcula solo las restantes; reañadir crea línea sin snapshot anterior", () => {
  const historical = {
    ...createSaleLine(product),
    original_item_id: "old",
    quantity: 9,
    unit_price: 70,
    unit_weight_kg: 17,
  };
  const other = createSaleLine({ ...product, id: "other", default_sale_price: 1000 });
  const rows = [historical, other];
  const remaining = rows.filter((_, index) => index !== 0);
  assert.deepEqual(remaining, [other]);
  assert.equal(saleFormPreview(state, remaining, [], false).total, 1000);
  assert.deepEqual(
    saleFormPreview(state, remaining, [], false).missing.map(([id]) => id),
    ["other"],
  );
  const restored = addSaleProduct([], product);
  assert.deepEqual(restored, [createSaleLine(product)]);
  assert.equal(restored[0].original_item_id, undefined);
  assert.equal(saleFormPreview(state, restored, [], false).total, 7301);
  assert.deepEqual(rows, [historical, other]);
});
