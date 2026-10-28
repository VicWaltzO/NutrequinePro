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
  assert.equal(filled[0].quantity, 1);
  assert.equal(filled[0].unit_weight_kg, 50);
  const existing = { ...filled[0], unit_price: "65.22", original_item_id: "historical-line" };
  const added = addSaleProduct([existing], product);
  assert.equal(added.length, 1);
  assert.equal(added[0].unit_weight_kg, 50);
  assert.deepEqual(added[0], { ...existing, quantity: 2 });
  assert.equal(existing.quantity, 1);
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

test("cinco clics, cantidad manual y campos editados conservan una sola línea", () => {
  let rows = [createSaleLine()];
  for (let i = 0; i < 5; i++) rows = addSaleProduct(rows, product);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 5);
  const manual = { ...rows[0], quantity: "7", unit_price: "65.22", unit_weight_kg: "17.001" };
  const next = addSaleProduct([manual], product);
  assert.deepEqual(next, [{ ...manual, quantity: 8 }]);
  assert.deepEqual(selectSaleProduct(manual, product.id, product), manual);
});

test("frasco fijo y otros productos no mezclan cantidades ni pesos", () => {
  const bottle = {
    id: "bottle",
    default_sale_price: 9900,
    presentation_unit: "BOTTLE",
    weight_policy: "FIXED",
    unit_weight_grams: 2200,
  };
  let rows = [];
  for (let i = 0; i < 3; i++) rows = addSaleProduct(rows, bottle);
  rows = addSaleProduct(rows, product);
  rows = addSaleProduct(rows, { ...product, id: "third" });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].quantity, 3);
  assert.equal(rows[0].unit_weight_kg, 2.2);
  assert.equal(rows[1].unit_weight_kg, 50);
});

test("varias variantes requieren elección; el helper no adivina una línea", async () => {
  const { incrementSaleLine, saleProductCandidates } = await import("../features/ventas/hooks/sale-lines.ts");
  const rows = [
    createSaleLine(product),
    { ...createSaleLine(product), unit_price: "60", unit_weight_kg: "25" },
  ];
  assert.deepEqual(saleProductCandidates(rows, product), [0, 1]);
  assert.equal(addSaleProduct(rows, product), rows);
  assert.deepEqual(incrementSaleLine(rows, 1, product), [rows[0], { ...rows[1], quantity: 2 }]);
  assert.equal(rows[1].quantity, 1);
});

test("cantidad transitoria inválida o límite no producen NaN ni duplicados", () => {
  for (const quantity of ["", "-1", "1.5", "invalid", 1e7, Infinity]) {
    const rows = [{ ...createSaleLine(product), quantity }];
    assert.equal(addSaleProduct(rows, product), rows);
  }
});
