import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seedState,
  executeCommand,
  saleSummary,
  productionSummary,
  stock,
  balanceSummary,
  scaled,
  normalize,
} from "../lib/domain.mjs";
const actor = { id: "admin", name: "Administrador", role: "ADMIN", is_active: true };
function fixture() {
  let s = seedState();
  s.users.push(actor);
  const run = (type, payload) => {
    const out = executeCommand(s, { type, payload }, actor, "2026-10-06T15:00:00Z");
    s = out.state;
    return out.result;
  };
  const customer = run("CUSTOMER_SAVE", { name: "Cliente de prueba", is_active: true });
  return { run, customer, state: () => s };
}
const production = (products, more = {}) => ({
  production_date: "2026-10-06",
  products: products.map(([product_id, nuclei_count]) => ({ product_id, nuclei_count })),
  confirm: true,
  ...more,
});
const sale = (customer, items, more = {}) => ({
  customer_id: customer,
  site_id: "site-1",
  sale_date: "2026-10-06",
  payment_condition: "CREDIT",
  items: items.map(([product_id, quantity, unit_price = 73, unit_weight_kg = 25]) => ({
    product_id,
    quantity,
    unit_price,
    unit_weight_kg,
  })),
  confirm: true,
  deliver: false,
  ...more,
});
const payment = (customer, apps, more = {}) => ({
  customer_id: customer,
  payment_date: "2026-10-06",
  payment_method: "TRANSFER",
  total_amount: apps.reduce((n, [, amount]) => n + amount, 0),
  applications: apps.map(([sale_id, applied_amount]) => ({ sale_id, applied_amount })),
  ...more,
});
test("A: 8/4/3 núcleos, 600 sacos, fórmula separada, descuentos, costos reales e inventario", () => {
  const f = fixture();
  const id = f.run(
    "PRODUCTION_SAVE",
    production(
      [
        ["prod-1", 8],
        ["prod-2", 4],
        ["prod-3", 3],
      ],
      {
        ingredients: [{ ingredient_id: "ing-1", discount_amount: "100", actual_charge: "2360" }],
        costs: [
          { category: "FREIGHT", description: "Flete", amount: "200", is_paid: true },
          {
            category: "INGREDIENT_EXTRA",
            ingredient_id: "ing-6",
            description: "Traslado melaza",
            amount: "80",
          },
        ],
      },
    ),
  );
  const s = f.state(),
    p = s.productions.find((x) => x.id === id),
    a = productionSummary(s, p);
  assert.deepEqual(
    a.products.map((x) => x.bags_produced),
    [320, 160, 120],
  );
  assert.equal(a.bags, 600);
  assert.equal(a.weight, 15000000);
  assert.deepEqual(
    a.products.map((x) => x.formula_weight_kg),
    [7904000, 3940000, 2973000],
  );
  assert.equal(a.ingredients.find((x) => x.ingredient_id === "ing-1").total_kg, 1136000);
  assert.equal(a.ingredients.find((x) => x.ingredient_id === "ing-1").theoretical_gross_cost, 238560);
  assert.equal(a.ingredients.find((x) => x.ingredient_id === "ing-1").theoretical_net_cost, 228560);
  assert.equal(a.ingredients.find((x) => x.ingredient_id === "ing-1").difference, 7440);
  assert.equal(stock(s, "prod-1").quantity, 320);
  assert.equal(s.inventoryMovements.filter((x) => x.item_type === "INGREDIENT").length, 10);
  assert.equal(a.costs.find((x) => x.category === "NUCLEUS").amount, 375000);
  assert.equal(a.costs.find((x) => x.category === "PACKAGING").amount, 66000);
});
test("B: contado atómico, varios productos, precio especial y salida física", () => {
  const f = fixture();
  f.run(
    "PRODUCTION_SAVE",
    production([
      ["prod-1", 2],
      ["prod-2", 1],
    ]),
  );
  const before = structuredClone(f.state());
  assert.throws(
    () => f.run("SALE_SAVE", sale(f.customer, [["prod-1", 5]], { payment_condition: "CASH", deliver: true })),
    /método/,
  );
  assert.deepEqual(f.state(), before);
  const id = f.run(
    "SALE_SAVE",
    sale(
      f.customer,
      [
        ["prod-1", 5, 70],
        ["prod-2", 3, 67],
      ],
      { payment_condition: "CASH", payment_method: "TRANSFER", payment_date: "2026-10-06", deliver: true },
    ),
  );
  const s = f.state(),
    a = saleSummary(
      s,
      s.sales.find((x) => x.id === id),
    );
  assert.equal(a.total, 55100);
  assert.equal(a.items[0].reference_unit_price, 7300);
  assert.equal(a.items[0].unit_price, 7000);
  assert.equal(a.financial_status, "PAID");
  assert.equal(s.payments.length, 1);
  assert.equal(s.paymentApplications.length, 1);
  assert.equal(stock(s, "prod-1").quantity, 75);
  assert.equal(stock(s, "prod-2").quantity, 37);
});
test("C: crédito, parcial, pagada, saldo cero e historial", () => {
  const f = fixture();
  const id = f.run("SALE_SAVE", sale(f.customer, [["prod-1", 10]]));
  f.run("PAYMENT_CREATE", payment(f.customer, [[id, 300]]));
  let a = saleSummary(
    f.state(),
    f.state().sales.find((x) => x.id === id),
  );
  assert.equal(a.balance, 43000);
  assert.equal(a.financial_status, "PARTIAL");
  f.run("PAYMENT_CREATE", payment(f.customer, [[id, 430]]));
  a = saleSummary(
    f.state(),
    f.state().sales.find((x) => x.id === id),
  );
  assert.equal(a.balance, 0);
  assert.equal(a.financial_status, "PAID");
  assert.equal(f.state().payments.length, 2);
});
test("D: una transferencia y tres aplicaciones", () => {
  const f = fixture();
  const ids = [
    f.run("SALE_SAVE", sale(f.customer, [["prod-1", 20]])),
    f.run("SALE_SAVE", sale(f.customer, [["prod-2", 4, 67]])),
    f.run("SALE_SAVE", sale(f.customer, [["prod-3", 2, 69]])),
  ];
  f.run(
    "PAYMENT_CREATE",
    payment(f.customer, [
      [ids[0], 1460],
      [ids[1], 268],
      [ids[2], 138],
    ]),
  );
  const s = f.state();
  assert.equal(s.payments.length, 1);
  assert.equal(s.payments[0].total_amount, 186600);
  assert.equal(s.paymentApplications.length, 3);
  assert.ok(s.sales.every((x) => saleSummary(s, x).balance === 0));
});
test("E: stock 80, venta 120, lote DRAFT, confirmación y entrega posterior", () => {
  const f = fixture();
  f.run("PRODUCTION_SAVE", production([["prod-1", 2]]));
  const before = structuredClone(f.state());
  assert.throws(
    () => f.run("SALE_SAVE", sale(f.customer, [["prod-1", 120]], { deliver: true })),
    /Stock físico/,
  );
  assert.deepEqual(f.state(), before);
  const id = f.run("SALE_SAVE", sale(f.customer, [["prod-1", 120]], { create_production: true }));
  let s = f.state();
  assert.equal(stock(s, "prod-1").quantity, 80);
  assert.equal(stock(s, "prod-1").committed, 120);
  const draft = s.productions.find((x) => x.status === "DRAFT");
  assert.equal(s.saleProductionLinks.length, 1);
  f.run("PRODUCTION_CONFIRM", { id: draft.id });
  assert.equal(stock(f.state(), "prod-1").quantity, 120);
  f.run("SALE_DELIVER", { id });
  assert.equal(stock(f.state(), "prod-1").quantity, 0);
  assert.equal(stock(f.state(), "prod-1").committed, 0);
  assert.throws(() => f.run("SALE_DELIVER", { id }), /no puede entregarse/);
});
test("F: rectificación de cantidad entregada, snapshot y compensación", () => {
  const f = fixture();
  f.run("PRODUCTION_SAVE", production([["prod-1", 3]]));
  const id = f.run("SALE_SAVE", sale(f.customer, [["prod-1", 100]], { deliver: true }));
  f.run("SALE_CORRECT", {
    id,
    reason: "Cantidad tipeada erróneamente",
    items: [{ product_id: "prod-1", quantity: 10, unit_price: 73, unit_weight_kg: 25 }],
  });
  const s = f.state(),
    a = saleSummary(
      s,
      s.sales.find((x) => x.id === id),
    );
  assert.equal(a.total, 73000);
  assert.equal(a.balance, 73000);
  assert.equal(stock(s, "prod-1").quantity, 110);
  assert.equal(s.corrections[0].old_snapshot.summary.total, 730000);
  assert.equal(s.saleItems.length, 2);
  assert.equal(s.saleItems[0].is_current, false);
  assert.equal(s.inventoryMovements.filter((x) => x.source_id === id).length, 3);
});
test("BASE utiliza parámetros: 30 sacos de 50kg y fórmula de 1501kg", () => {
  const f = fixture();
  const id = f.run("PRODUCTION_SAVE", production([["prod-4", 1]]));
  const a = productionSummary(
    f.state(),
    f.state().productions.find((x) => x.id === id),
  );
  assert.equal(a.bags, 30);
  assert.equal(a.weight, 1500000);
  assert.equal(a.products[0].formula_weight_kg, 1501000);
  assert.throws(() => f.run("SALE_SAVE", sale(f.customer, [["prod-4", 1, 50, 50]])), /habilitado/);
});
test("snapshots no cambian con precios o fórmula posteriores", () => {
  const f = fixture();
  const id = f.run("PRODUCTION_SAVE", production([["prod-1", 1]]));
  const original = productionSummary(
    f.state(),
    f.state().productions.find((x) => x.id === id),
  );
  f.run("INGREDIENT_SAVE", { ...f.state().ingredients[0], current_price_per_kg: "9.00" });
  f.run("FORMULA_SAVE", {
    product_id: "prod-1",
    valid_from: "2026-10-06",
    ingredients: [{ ingredient_id: "ing-1", kg_per_nucleus: 500 }],
  });
  const after = productionSummary(
    f.state(),
    f.state().productions.find((x) => x.id === id),
  );
  assert.deepEqual(after, original);
  assert.equal(f.state().formulas.filter((x) => x.product_id === "prod-1").length, 2);
});
test("pago excedente bloquea rectificación y anulación hasta reversión explícita", () => {
  const f = fixture();
  const id = f.run("SALE_SAVE", sale(f.customer, [["prod-1", 100, 100]]));
  const pay = f.run("PAYMENT_CREATE", payment(f.customer, [[id, 6000]]));
  assert.throws(
    () =>
      f.run("SALE_CORRECT", {
        id,
        reason: "Error",
        items: [{ product_id: "prod-1", quantity: 55, unit_price: 100, unit_weight_kg: 25 }],
      }),
    /excedente/,
  );
  assert.throws(() => f.run("SALE_CANCEL", { id, reason: "Error" }), /Revierta/);
  f.run("PAYMENT_REVERSE", { id: pay, reason: "Exceso", date: "2026-10-06" });
  f.run("SALE_CORRECT", {
    id,
    reason: "Error",
    items: [{ product_id: "prod-1", quantity: 55, unit_price: 100, unit_weight_kg: 25 }],
  });
  f.run("SALE_CANCEL", { id, reason: "Anulación administrativa" });
  assert.equal(f.state().payments.length, 1);
  assert.equal(f.state().paymentReversals.length, 1);
  assert.equal(balanceSummary(f.state()).collections, 0);
});
test("validaciones de pago: cliente, saldo, suma, aplicación duplicada y anulada", () => {
  const f = fixture();
  const id = f.run("SALE_SAVE", sale(f.customer, [["prod-1", 2]]));
  const other = f.run("CUSTOMER_SAVE", { name: "Otro cliente" });
  assert.throws(() => f.run("PAYMENT_CREATE", payment(other, [[id, 1]])), /coincidir/);
  assert.throws(() => f.run("PAYMENT_CREATE", payment(f.customer, [[id, 200]])), /saldo/);
  assert.throws(
    () =>
      f.run(
        "PAYMENT_CREATE",
        payment(f.customer, [
          [id, 1],
          [id, 1],
        ]),
      ),
    /repetirse/,
  );
  assert.throws(() => f.run("PAYMENT_CREATE", payment(f.customer, [[id, 1]], { total_amount: 0.5 })), /suma/);
  f.run("SALE_CANCEL", { id, reason: "Prueba" });
  assert.throws(() => f.run("PAYMENT_CREATE", payment(f.customer, [[id, 1]])), /pagar esta/);
});
test("devolución física sin descuento automático y anulación sin doble entrada", () => {
  const f = fixture();
  f.run("PRODUCTION_SAVE", production([["prod-1", 1]]));
  const id = f.run("SALE_SAVE", sale(f.customer, [["prod-1", 10]], { deliver: true }));
  const item = saleSummary(
    f.state(),
    f.state().sales.find((x) => x.id === id),
  ).items[0];
  f.run("RETURN_CREATE", {
    sale_id: id,
    return_date: "2026-10-06",
    reason: "Producto retornó",
    items: [{ sale_item_id: item.id, quantity: 2 }],
    economic_amount: 0,
  });
  assert.equal(stock(f.state(), "prod-1").quantity, 32);
  assert.equal(
    saleSummary(
      f.state(),
      f.state().sales.find((x) => x.id === id),
    ).total,
    73000,
  );
  assert.throws(
    () =>
      f.run("RETURN_CREATE", {
        sale_id: id,
        return_date: "2026-10-06",
        reason: "Demasiado",
        items: [{ sale_item_id: item.id, quantity: 9 }],
      }),
    /excede/,
  );
  f.run("SALE_CANCEL", { id, reason: "Anulación" });
  assert.equal(stock(f.state(), "prod-1").quantity, 40);
});
test("un gasto vinculado entra una sola vez al costo y al balance", () => {
  const f = fixture();
  const id = f.run("PRODUCTION_SAVE", production([["prod-1", 1]]));
  const before = balanceSummary(f.state());
  f.run("EXPENSE_CREATE", {
    production_id: id,
    date: "2026-10-06",
    category: "LOGISTICS",
    description: "Transporte",
    amount: 100,
  });
  const after = balanceSummary(f.state());
  assert.equal(after.costs - before.costs, 10000);
  assert.equal(after.logistics, 0);
  assert.equal(after.paidCosts - before.paidCosts, 10000);
  assert.equal(after.cash_result - before.cash_result, -10000);
});
test("cierre requiere cobros reales y confirmado, anulaciones preservan consumo", () => {
  const f = fixture();
  const id = f.run("PRODUCTION_SAVE", production([["prod-1", 1]]));
  assert.throws(() => f.run("PRODUCTION_CLOSE", { id }), /cobros reales/);
  const a = productionSummary(
    f.state(),
    f.state().productions.find((x) => x.id === id),
  );
  f.run("PRODUCTION_RECONCILE", {
    id,
    reason: "Cobro molino",
    ingredients: a.ingredients.map((x) => ({
      id: x.id,
      actual_charge: x.theoretical_net_cost / 100,
      discount_amount: x.discount_amount / 100,
      is_paid: true,
    })),
  });
  f.run("PRODUCTION_CLOSE", { id });
  assert.equal(f.state().productions.find((x) => x.id === id).status, "CLOSED");
  f.run("PRODUCTION_CANCEL", { id, reason: "Producción incorrecta" });
  assert.equal(stock(f.state(), "prod-1").quantity, 0);
  assert.ok(
    f
      .state()
      .inventoryMovements.some(
        (x) => x.movement_type === "CANCELLATION_REVERSAL" && x.item_type === "INGREDIENT",
      ),
  );
});
test("precisión monetaria y búsqueda normalizada", () => {
  assert.equal(scaled("0.10") + scaled("0.20"), 30);
  assert.equal(scaled("1.234", 3), 1234);
  assert.throws(() => scaled("1.001"), /decimales/);
  assert.throws(() => scaled("-1"), /válido/);
  assert.equal(normalize("  JOSÉ   Pérez "), "jose perez");
});
test("roles y último administrador", () => {
  const f = fixture();
  assert.throws(
    () =>
      executeCommand(
        f.state(),
        { type: "CUSTOMER_SAVE", payload: { name: "x" } },
        { ...actor, role: "VIEWER" },
      ),
    /consultar/,
  );
  assert.throws(
    () =>
      executeCommand(f.state(), { type: "INVENTORY_ADJUST", payload: {} }, { ...actor, role: "OPERATOR" }),
    /administrador/,
  );
  assert.throws(
    () => f.run("USER_SAVE", { id: actor.id, name: "Admin", role: "VIEWER", is_active: true }),
    /al menos un/,
  );
});
test("borradores no generan cuenta por cobrar ni stock", () => {
  const f = fixture();
  f.run("SALE_SAVE", sale(f.customer, [["prod-1", 10]], { confirm: false }));
  assert.equal(balanceSummary(f.state()).sales, 0);
  assert.equal(balanceSummary(f.state()).receivable, 0);
  assert.equal(stock(f.state(), "prod-1").committed, 0);
});
test("gasto pagado de lote borrador se conserva al editar y confirmar", () => {
  const f = fixture();
  const id = f.run("PRODUCTION_SAVE", production([["prod-1", 1]], { confirm: false }));
  f.run("EXPENSE_CREATE", {
    production_id: id,
    date: "2026-10-06",
    category: "LOGISTICS",
    description: "Flete anticipado",
    amount: 50,
  });
  assert.equal(balanceSummary(f.state()).paidCosts, 5000);
  f.run("PRODUCTION_SAVE", production([["prod-1", 2]], { id, confirm: false }));
  f.run("PRODUCTION_CONFIRM", { id });
  assert.equal(
    productionSummary(
      f.state(),
      f.state().productions.find((x) => x.id === id),
    ).costs.filter((x) => x.description === "Flete anticipado").length,
    1,
  );
  assert.equal(balanceSummary(f.state()).paidCosts, 5000);
});
test("anular producción no hace desaparecer egresos ya registrados", () => {
  const f = fixture();
  const id = f.run(
    "PRODUCTION_SAVE",
    production([["prod-1", 1]], { nucleus_paid: true, packaging_paid: true }),
  );
  const before = balanceSummary(f.state());
  f.run("PRODUCTION_CANCEL", { id, reason: "Ajuste administrativo" });
  assert.equal(balanceSummary(f.state()).paidCosts, before.paidCosts);
  assert.equal(balanceSummary(f.state()).cash_result, before.cash_result);
});
test("cantidades e importes extremos no pierden precisión silenciosamente", () => {
  const f = fixture();
  assert.throws(
    () => f.run("SALE_SAVE", sale(f.customer, [["prod-1", 10000000, "10000000000"]])),
    /rango|precisión/,
  );
  assert.throws(
    () => f.run("SALE_SAVE", sale(f.customer, [["prod-1", 1]], { sale_date: "2026-02-30" })),
    /Fecha inválida/,
  );
});
test("rectificación de producción usa snapshots y compensa stock y consumo", () => {
  const f = fixture();
  const id = f.run("PRODUCTION_SAVE", production([["prod-1", 2]]));
  f.run("INGREDIENT_SAVE", { ...f.state().ingredients[0], current_price_per_kg: 9 });
  f.run("PRODUCTION_CORRECT_QUANTITIES", {
    id,
    reason: "Error al registrar núcleos",
    products: [{ product_id: "prod-1", nuclei_count: 1 }],
    costs: [],
  });
  const a = productionSummary(
    f.state(),
    f.state().productions.find((x) => x.id === id),
  );
  assert.equal(a.bags, 40);
  assert.equal(a.ingredients.find((x) => x.ingredient_id === "ing-1").historical_price_per_kg, 210);
  assert.equal(a.ingredients.find((x) => x.ingredient_id === "ing-1").theoretical_gross_cost, 25620);
  assert.equal(stock(f.state(), "prod-1").quantity, 40);
  assert.equal(
    f
      .state()
      .inventoryMovements.filter((x) => x.item_id === "ing-1")
      .reduce((n, x) => n + x.weight_kg, 0),
    -122000,
  );
  assert.equal(f.state().corrections.find((x) => x.entity_type === "PRODUCTION").old_snapshot.bags, 80);
});
test("rectificación no reduce producción por debajo de stock consumido", () => {
  const f = fixture();
  const id = f.run("PRODUCTION_SAVE", production([["prod-1", 2]]));
  f.run("SALE_SAVE", sale(f.customer, [["prod-1", 70]], { deliver: true }));
  assert.throws(
    () =>
      f.run("PRODUCTION_CORRECT_QUANTITIES", {
        id,
        reason: "Error",
        products: [{ product_id: "prod-1", nuclei_count: 1 }],
      }),
    /stock físico/,
  );
});

test("operador edita fórmula mediante versión; lector rechazado; snapshots intactos", () => {
  const f = fixture();
  const id = f.run("PRODUCTION_SAVE", production([["prod-1", 1]]));
  const before = productionSummary(
    f.state(),
    f.state().productions.find((x) => x.id === id),
  );
  const command = {
    type: "FORMULA_SAVE",
    payload: {
      product_id: "prod-1",
      valid_from: "2026-10-07",
      ingredients: [{ ingredient_id: "ing-1", kg_per_nucleus: 123 }],
    },
  };
  assert.throws(() => executeCommand(f.state(), command, { ...actor, role: "VIEWER" }), /consultar/);
  const { state: s } = executeCommand(f.state(), command, { ...actor, role: "OPERATOR" });
  assert.equal(s.formulas.find((x) => x.product_id === "prod-1" && x.is_active).version, 2);
  assert.equal(s.formulaIngredients.find((x) => x.formula_id === "formula-1-1").kg_per_nucleus, 122000);
  assert.deepEqual(
    productionSummary(
      s,
      s.productions.find((x) => x.id === id),
    ),
    before,
  );
});
test("eliminar cliente conserva deuda, pagos, vínculos e historial", () => {
  const f = fixture();
  const id = f.run("SALE_SAVE", sale(f.customer, [["prod-1", 2]]));
  f.run("PAYMENT_CREATE", payment(f.customer, [[id, 20]]));
  const before = balanceSummary(f.state()),
    sales = structuredClone(f.state().sales),
    payments = structuredClone(f.state().payments);
  assert.throws(
    () =>
      executeCommand(
        f.state(),
        { type: "CUSTOMER_DELETE", payload: { id: f.customer } },
        { ...actor, role: "VIEWER" },
      ),
    /consultar/,
  );
  f.run("CUSTOMER_DELETE", { id: f.customer });
  const s = f.state();
  assert.equal(s.customers.find((x) => x.id === f.customer).is_active, false);
  assert.ok(s.customers.find((x) => x.id === f.customer).deleted_at);
  assert.deepEqual(s.sales, sales);
  assert.deepEqual(s.payments, payments);
  assert.deepEqual(balanceSummary(s), before);
  assert.ok(s.audit.some((x) => x.action === "CUSTOMER_DELETE"));
  assert.ok(s.corrections.some((x) => x.entity_id === f.customer));
});
