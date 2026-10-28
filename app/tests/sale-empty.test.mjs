import { persistenceTest as test } from "./helpers/persistence-fixtures.mjs";
import assert from "node:assert/strict";
import { regressionFixture, salePayload, rejectsWithoutChange } from "./helpers/regression-scenarios.mjs";

test("NQP26-03: guardar o rectificar sin productos rechaza sin cambiar ninguna entidad", async (t) => {
  const f = await regressionFixture(t);
  await f.run("INVENTORY_ADJUST", {
    product_id: "prod-1",
    direction: "IN",
    quantity: 10,
    weight_kg: 250,
    date: "2026-10-28",
    reason: "Existencias sintéticas para comprobar compensaciones",
  });
  const id = await f.run(
    "SALE_SAVE",
    salePayload(f.customer, {
      deliver: true,
      payment_condition: "CASH",
      payment_method: "TRANSFER",
      paid_amount: 300,
    }),
  );
  const draft = await f.run("SALE_SAVE", salePayload(f.customer, { confirm: false }));
  for (const items of [
    [],
    [{ quantity: 1, unit_weight_kg: 25, unit_price: 73 }],
    [{ product_id: "", quantity: 1, unit_weight_kg: 25, unit_price: 73 }],
    [
      { product_id: "prod-1", quantity: 1, unit_weight_kg: 25, unit_price: 73 },
      { product_id: "", quantity: 1, unit_weight_kg: 25, unit_price: 73 },
    ],
  ]) {
    for (const confirm of [true, false]) {
      for (const existing of [undefined, draft]) {
        await rejectsWithoutChange(
          f,
          () =>
            f.run(
              "SALE_SAVE",
              salePayload(f.customer, {
                id: existing,
                items,
                confirm,
                deliver: true,
                create_production: true,
                payment_condition: "CASH",
                payment_method: "TRANSFER",
                paid_amount: 300,
              }),
            ),
          items.length ? /Registro no encontrado/ : /al menos un producto/,
        );
      }
    }
    await rejectsWithoutChange(
      f,
      () =>
        f.run("SALE_CORRECT", {
          id,
          reason: "Rectificación vacía sintética",
          items,
        }),
      items.length ? /Registro no encontrado/ : /al menos un producto/,
    );
  }
  const state = await f.state();
  assert.equal(state.sales.find((sale) => sale.id === id).fulfillment_status, "DELIVERED");
  assert.ok(state.payments.length > 0);
});
