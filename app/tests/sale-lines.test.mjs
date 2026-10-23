import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaleLine, selectSaleProduct, addSaleProduct } from "../features/ventas/hooks/sale-lines.ts";

const product = { id: "synthetic-product", default_sale_price: 7301, standard_bag_weight_kg: 50000 };
test("líneas nuevas de venta usan el peso maestro; la misma presentación conserva el peso editado", () => {
  assert.equal(createSaleLine().unit_weight_kg, 25);
  const selected = selectSaleProduct(createSaleLine(), product.id, product);
  assert.equal(selected.unit_weight_kg, 50);
  assert.equal(selected.unit_price, 73.01);
  assert.equal(
    selectSaleProduct({ ...selected, unit_weight_kg: "17.001" }, product.id, product).unit_weight_kg,
    "17.001",
  );
});
test("selector visual completa la línea vacía y añade sin sobrescribir precios, pesos o cantidades anteriores", () => {
  const blank = { ...createSaleLine(), quantity: 3, unit_weight_kg: "24.500" };
  const filled = addSaleProduct([blank], product);
  assert.equal(filled.length, 1);
  assert.equal(filled[0].quantity, 3);
  assert.equal(filled[0].unit_weight_kg, 50);
  const existing = { ...filled[0], unit_price: "65.22", original_item_id: "historical-line" };
  const added = addSaleProduct([existing], product);
  assert.equal(added.length, 2);
  assert.equal(added[1].unit_weight_kg, 50);
  assert.deepEqual(added[0], existing);
  assert.notEqual(added[0], added[1]);
});
test("cambiar producto conserva el snapshot de peso e identidad de una rectificación", () => {
  const historical = {
    original_item_id: "historical-line",
    product_id: product.id,
    quantity: 4,
    unit_weight_kg: 50,
    unit_price: 10,
  };
  assert.equal(selectSaleProduct(historical, product.id, product).unit_weight_kg, 50);
  assert.equal(
    selectSaleProduct(historical, product.id, product).original_item_id,
    historical.original_item_id,
  );
  assert.equal(
    selectSaleProduct({ ...createSaleLine(), unit_weight_kg: "" }, product.id, product).unit_weight_kg,
    50,
  );
  assert.equal(historical.unit_price, 10);
});

test("cambiar saco por frasco fijo reinicia a 2,2 kg sin arrastrar identidad histórica; volver usa el peso del saco", () => {
  const bottle = {
    id: "bottle",
    presentation_unit: "BOTTLE",
    weight_policy: "FIXED",
    unit_weight_grams: 2200,
    default_sale_price: null,
  };
  const historical = {
    ...createSaleLine(product),
    original_item_id: "old-line",
    quantity: 3,
    unit_weight_kg: "17.001",
  };
  const selected = selectSaleProduct(historical, bottle.id, bottle);
  assert.equal(selected.unit_weight_kg, 2.2);
  assert.equal(selected.unit_price, "");
  assert.equal(selected.original_item_id, undefined);
  assert.equal(selectSaleProduct(selected, product.id, product).unit_weight_kg, 50);
  assert.deepEqual(historical, {
    ...createSaleLine(product),
    original_item_id: "old-line",
    quantity: 3,
    unit_weight_kg: "17.001",
  });
});
