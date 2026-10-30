import { customerDuplicateReview } from "../features/clientes/domain/name-matches.mjs";
import { persistenceTest as test } from "./helpers/persistence-fixtures.mjs";
import assert from "node:assert/strict";
import { createStore } from "../lib/application-store.mjs";
import { saleSummary, productionSummary, stock, balanceSummary, paymentSummary } from "../lib/domain.mjs";
import {
  regressionFixture,
  scenarioSession,
  scenarioDate,
  adminIdentity,
  salePayload,
  productionPayload,
  paymentPayload,
  rejectsWithoutChange,
  cashCreditScenario,
} from "./helpers/regression-scenarios.mjs";

test("R01: céntimos y gramos extraordinarios sobreviven al store sin redondeos monetarios dobles", async (t) => {
  const f = await regressionFixture(t);
  const id = await f.run(
    "SALE_SAVE",
    salePayload(f.customer, {
      payment_condition: "CASH",
      payment_method: "TRANSFER",
      paid_amount: "0.30",
      items: [
        {
          product_id: "prod-1",
          quantity: 3,
          unit_price: "0.29",
          unit_weight_kg: "17.001",
          subtotal: 1,
          total_weight_kg: 1,
        },
      ],
    }),
  );
  const state = await f.state();
  const summary = saleSummary(state, { id });
  assert.equal(summary.total, 87);
  assert.equal(summary.paid, 30);
  assert.equal(summary.balance, 57);
  assert.equal(summary.financial_status, "PARTIAL");
  assert.equal(summary.items[0].total_weight_kg, 51003);
  assert.equal(summary.items[0].reference_unit_weight_kg, 25000);
  assert.equal(state.sales[0].financial_status, "PARTIAL");
});

test("R02: costo por gramos redondea medio céntimo una vez y congela el precio de insumo", async (t) => {
  const f = await regressionFixture(t);
  await f.run("INGREDIENT_SAVE", { id: "ing-1", name: "Insumo sintético", current_price_per_kg: "0.01" });
  await f.run("FORMULA_SAVE", {
    product_id: "prod-1",
    valid_from: scenarioDate,
    ingredients: [{ ingredient_id: "ing-1", kg_per_nucleus: "0.500" }],
  });
  const id = await f.run("PRODUCTION_SAVE", productionPayload());
  const before = productionSummary(await f.state(), { id });
  assert.equal(before.ingredients[0].total_kg, 500);
  assert.equal(before.ingredients[0].theoretical_gross_cost, 1);
  await f.run("INGREDIENT_SAVE", { id: "ing-1", name: "Insumo sintético", current_price_per_kg: "99.99" });
  assert.deepEqual(productionSummary(await f.state(), { id }), before);
});

test("R03: fechas imposibles, fracciones de saco y exceso de decimales rechazan sin efectos", async (t) => {
  const f = await regressionFixture(t);
  for (const extra of [
    { sale_date: "2026-02-30" },
    { items: [{ product_id: "prod-1", quantity: 1.5 }] },
    { items: [{ product_id: "prod-1", quantity: 1, unit_price: "1.001" }] },
    { items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: "25.0001" }] },
    { items: [{ product_id: "prod-1", quantity: 10000000, unit_price: "10000000000.00" }] },
  ])
    await rejectsWithoutChange(
      f,
      () => f.run("SALE_SAVE", salePayload(f.customer, extra)),
      /Fecha|entero|decimales|rango/,
    );
});

test("R04: duplicados normalizados requieren confirmación y sedes se reasocian sin borrar historia", async (t) => {
  const f = await regressionFixture(t);
  await rejectsWithoutChange(
    f,
    () => f.run("CUSTOMER_SAVE", { name: "  CLIENTE   SINTETICO 02 " }),
    /duplicado/,
  );
  const duplicate = await f.run("CUSTOMER_SAVE", {
    name: "Cliente sintetico 02",
    confirm_duplicate: true,
    duplicate_review: customerDuplicateReview((await f.state()).customers, "Cliente sintetico 02"),
  });
  assert.notEqual(duplicate, f.customer);
  const site = await f.run("SITE_SAVE", { name: "Sede sintética nueva" });
  await f.run("CUSTOMER_SAVE", {
    id: f.customer,
    name: "Cliente sintético 02",
    site_ids: [site],
    confirm_duplicate: true,
    duplicate_review: customerDuplicateReview(
      (await f.state()).customers,
      "Cliente sintético 02",
      f.customer,
    ),
  });
  const state = await f.state();
  const links = state.customerSites.filter((row) => row.customer_id === f.customer);
  assert.equal(links.length, 2);
  assert.equal(links.find((row) => row.site_id === "site-1").is_active, false);
  assert.equal(links.find((row) => row.site_id === site).is_default, true);
  assert.ok(state.corrections.some((row) => row.entity_id === f.customer));
});

test("R05: retirar cliente bloquea ventas nuevas y permite cobrar deuda conservando vínculos", async (t) => {
  const f = await regressionFixture(t);
  const sale = await f.run("SALE_SAVE", salePayload(f.customer));
  const before = await f.state();
  await f.run("CUSTOMER_DELETE", { id: f.customer });
  await rejectsWithoutChange(f, () => f.run("SALE_SAVE", salePayload(f.customer)), /activos/);
  await f.run("PAYMENT_CREATE", paymentPayload(f.customer, sale));
  const state = await f.state();
  assert.deepEqual(state.customerSites, before.customerSites);
  assert.equal(state.sales[0].customer_id, f.customer);
  assert.equal(saleSummary(state, { id: sale }).balance, 28203);
  assert.equal(state.customers[0].deleted_by, adminIdentity.userId);
  await rejectsWithoutChange(f, () => f.run("CUSTOMER_DELETE", { id: f.customer }), /retirado/);
});

test("R06: producto no vendible y sede inactiva no crean venta, pago o auditoría", async (t) => {
  const f = await regressionFixture(t);
  await rejectsWithoutChange(
    f,
    () =>
      f.run(
        "SALE_SAVE",
        salePayload(f.customer, {
          items: [{ product_id: "prod-4", quantity: 1 }],
        }),
      ),
    /habilitado para venta/,
  );
  await f.run("SITE_SAVE", { id: "site-1", name: "Sede sintética", is_active: false });
  await rejectsWithoutChange(f, () => f.run("SALE_SAVE", salePayload(f.customer)), /activos/);
});

test("R07: borrador editado confirma una sola vez y conserva sus líneas anteriores", async (t) => {
  const f = await regressionFixture(t);
  const id = await f.run("SALE_SAVE", salePayload(f.customer, { confirm: false, payment_condition: "CASH" }));
  assert.equal((await f.state()).payments.length, 0);
  assert.equal(balanceSummary(await f.state()).receivable, 0);
  await f.run("SALE_SAVE", salePayload(f.customer, { id, payment_condition: "CASH", paid_amount: "0" }));
  const state = await f.state();
  assert.equal(state.sales.length, 1);
  assert.equal(state.sales[0].commercial_status, "CONFIRMED");
  assert.equal(state.saleItems.length, 2);
  assert.equal(state.saleItems.filter((row) => row.is_current !== false).length, 1);
  assert.equal(balanceSummary(state).receivable, 29204);
  await rejectsWithoutChange(f, () => f.run("SALE_SAVE", salePayload(f.customer, { id })), /rectificación/);
});

test("R08: ajustes validan sacos y gramos por separado y no permiten stock negativo", async (t) => {
  const f = await regressionFixture(t);
  const adjust = {
    product_id: "prod-1",
    quantity: 2,
    weight_kg: "0.003",
    date: scenarioDate,
    reason: "Ensayo gramos",
  };
  await f.run("INVENTORY_ADJUST", { ...adjust, direction: "IN" });
  await rejectsWithoutChange(
    f,
    () => f.run("INVENTORY_ADJUST", { ...adjust, direction: "OUT", weight_kg: "0.004" }),
    /insuficiente/,
  );
  await f.run("INVENTORY_ADJUST", { ...adjust, direction: "OUT", quantity: 1, weight_kg: "0.001" });
  assert.equal(stock(await f.state(), "prod-1").quantity, 1);
  assert.equal(stock(await f.state(), "prod-1").weight_kg, 2);
  await rejectsWithoutChange(
    f,
    () => f.run("INVENTORY_ADJUST", { ...adjust, direction: "OUT", quantity: 2 }),
    /insuficiente/,
  );
});

test("R09: devolución acumulada, reducción económica y anulación restituyen solo el remanente", async (t) => {
  const f = await regressionFixture(t);
  await f.run("PRODUCTION_SAVE", productionPayload());
  const sale = await f.run(
    "SALE_SAVE",
    salePayload(f.customer, {
      deliver: true,
      items: [{ product_id: "prod-1", quantity: 4, unit_price: "73.01", unit_weight_kg: "17.001" }],
    }),
  );
  const item = saleSummary(await f.state(), { id: sale }).items[0];
  const payload = {
    sale_id: sale,
    return_date: scenarioDate,
    reason: "Retorno sintético",
    items: [{ sale_item_id: item.id, quantity: 1 }],
    economic_amount: "0.01",
  };
  await f.run("RETURN_CREATE", payload);
  await f.run("RETURN_CREATE", {
    ...payload,
    economic_amount: "0",
    items: [{ sale_item_id: item.id, quantity: 2 }],
  });
  assert.equal(saleSummary(await f.state(), { id: sale }).total, 29203);
  assert.equal(stock(await f.state(), "prod-1").weight_kg, 982999);
  await rejectsWithoutChange(
    f,
    () => f.run("RETURN_CREATE", { ...payload, items: [{ sale_item_id: item.id, quantity: 2 }] }),
    /excede cantidad/,
  );
  await rejectsWithoutChange(
    f,
    () => f.run("SALE_CORRECT", { id: sale, reason: "Ensayo", items: [item] }),
    /devoluciones/,
  );
  await f.run("SALE_CANCEL", { id: sale, reason: "Anulación sintética", date: scenarioDate });
  const state = await f.state();
  assert.equal(stock(state, "prod-1").quantity, 40);
  assert.equal(stock(state, "prod-1").weight_kg, 1000000);
  assert.equal(saleSummary(state, state.sales[0]).financial_status, "CANCELLED");
  assert.equal(state.returns.length, 2);
  assert.equal(state.saleItems.length, 1);
  await rejectsWithoutChange(f, () => f.run("SALE_CANCEL", { id: sale, reason: "Repetida" }), /anulada/);
});

test("R10: devolución inválida tras una línea válida y rebaja excesiva no dejan movimientos", async (t) => {
  const f = await regressionFixture(t);
  await f.run("PRODUCTION_SAVE", productionPayload());
  const id = await f.run(
    "SALE_SAVE",
    salePayload(f.customer, { deliver: true, items: [{ product_id: "prod-1", quantity: 4 }] }),
  );
  const item = saleSummary(await f.state(), { id }).items[0];
  const payload = { sale_id: id, return_date: scenarioDate, reason: "Devolución sintética" };
  await rejectsWithoutChange(
    f,
    () =>
      f.run("RETURN_CREATE", {
        ...payload,
        items: [
          { sale_item_id: item.id, quantity: 1 },
          { sale_item_id: "missing-item", quantity: 1 },
        ],
      }),
    /no encontrado/,
  );
  await rejectsWithoutChange(
    f,
    () =>
      f.run("RETURN_CREATE", {
        ...payload,
        economic_amount: "292.01",
        items: [{ sale_item_id: item.id, quantity: 1 }],
      }),
    /excede el saldo/,
  );
});

test("R11: rectificación conserva referencia, líneas anteriores y snapshots y compensa gramos exactos", async (t) => {
  const f = await regressionFixture(t);
  await f.run("PRODUCTION_SAVE", productionPayload());
  const id = await f.run("SALE_SAVE", salePayload(f.customer, { deliver: true }));
  const original = saleSummary(await f.state(), { id }).items[0];
  await f.run("SALE_CORRECT", {
    id,
    reason: "Corrección sintética de peso y precio",
    items: [
      {
        original_item_id: original.id,
        product_id: "prod-1",
        quantity: 3,
        unit_price: "72.99",
        unit_weight_kg: "17.001",
      },
    ],
  });
  const state = await f.state();
  const summary = saleSummary(state, { id });
  assert.equal(summary.total, 21897);
  assert.equal(summary.items[0].reference_unit_price, original.reference_unit_price);
  assert.equal(state.saleItems.find((row) => row.id === original.id).is_current, false);
  assert.equal(stock(state, "prod-1").quantity, 37);
  assert.equal(stock(state, "prod-1").weight_kg, 948997);
  assert.equal(state.corrections.at(-1).old_snapshot.summary.total, 29204);
  assert.equal(state.corrections.at(-1).new_snapshot.summary.total, 21897);
  assert.ok(state.correctionFields.some((row) => row.correction_id === state.corrections.at(-1).id));
});

test("R12: producción pasa DRAFT a CONFIRMED a CLOSED y no duplica consumos al reconfirmar", async (t) => {
  const f = await regressionFixture(t);
  const id = await f.run("PRODUCTION_SAVE", productionPayload({ confirm: false }));
  assert.equal(stock(await f.state(), "prod-1").quantity, 0);
  await rejectsWithoutChange(f, () => f.run("PRODUCTION_CLOSE", { id }), /confirmada/);
  await f.run("PRODUCTION_CONFIRM", { id });
  await rejectsWithoutChange(f, () => f.run("PRODUCTION_CONFIRM", { id }), /confirmada/);
  const summary = productionSummary(await f.state(), { id });
  await f.run("PRODUCTION_RECONCILE", {
    id,
    reason: "Cobros sintéticos completos",
    ingredients: summary.ingredients.map((row) => ({
      id: row.id,
      actual_charge: (row.theoretical_net_cost / 100).toFixed(2),
      is_paid: true,
    })),
  });
  await f.run("PRODUCTION_CLOSE", { id });
  const state = await f.state();
  assert.equal(state.productions[0].status, "CLOSED");
  assert.equal(state.productions[0].closed_by, adminIdentity.userId);
  assert.equal(productionSummary(state, { id }).reconciled, true);
  assert.equal(stock(state, "prod-1").quantity, 40);
  await rejectsWithoutChange(
    f,
    () =>
      f.run("PRODUCTION_RECONCILE", {
        id,
        reason: "No perder conciliación",
        ingredients: [{ id: summary.ingredients[0].id, actual_charge: null }],
      }),
    /conciliación completa/,
  );
});

test("R13: producción consumida no se anula ni rectifica a cero y conserva el stock", async (t) => {
  const f = await regressionFixture(t);
  const id = await f.run("PRODUCTION_SAVE", productionPayload());
  await f.run("SALE_SAVE", salePayload(f.customer, { deliver: true }));
  await rejectsWithoutChange(
    f,
    () => f.run("PRODUCTION_CANCEL", { id, reason: "Ensayo consumido" }),
    /consumió/,
  );
  await rejectsWithoutChange(
    f,
    () =>
      f.run("PRODUCTION_CORRECT_QUANTITIES", {
        id,
        reason: "Ensayo cero",
        products: [{ product_id: "prod-1", nuclei_count: 0 }],
      }),
    /stock físico|al menos un núcleo/,
  );
});

test("R14: pago OTHER exige descripción y conserva centavos sin aplicar y reversiones en su fecha", async (t) => {
  const f = await regressionFixture(t);
  const id = await f.run("SALE_SAVE", salePayload(f.customer));
  await rejectsWithoutChange(
    f,
    () => f.run("PAYMENT_CREATE", paymentPayload(f.customer, id, { payment_method: "OTHER" })),
    /Otro método/,
  );
  const payment = await f.run(
    "PAYMENT_CREATE",
    paymentPayload(f.customer, id, {
      payment_method: "OTHER",
      other_method: "Método sintético",
      total_amount: "10.02",
    }),
  );
  let state = await f.state();
  assert.equal(
    paymentSummary(
      state,
      state.payments.find((row) => row.id === payment),
    ).available,
    1,
  );
  await f.run("PAYMENT_REVERSE", { id: payment, date: "2026-10-15", reason: "Reversión sintética" });
  state = await f.state();
  assert.equal(balanceSummary(state, scenarioDate, scenarioDate).collections, 1002);
  assert.equal(balanceSummary(state, "2026-10-15", "2026-10-15").collections, -1002);
  assert.equal(balanceSummary(state).collections, 0);
  assert.equal(saleSummary(state, { id }).paid, 0);
  assert.equal(state.paymentApplications.length, 1);
  await rejectsWithoutChange(f, () => f.run("PAYMENT_REVERSE", { id: payment, reason: "Otra" }), /revertido/);
  await rejectsWithoutChange(
    f,
    () =>
      f.run("PAYMENT_APPLY_CREDIT", {
        payment_id: payment,
        applications: [{ sale_id: id, applied_amount: "0.01" }],
      }),
    /revertido/,
  );
});

test("R15: desactivación bloquea reintento y degradación a VIEWER bloquea comandos nuevos", async (t) => {
  const f = await regressionFixture(t);
  const identity = { userId: "operator-synthetic", displayName: "Operador sintético" };
  await f.run("USER_SAVE", { id: identity.userId, name: identity.displayName, role: "OPERATOR" });
  const operator = scenarioSession(f.store, identity);
  await operator.run("CUSTOMER_SAVE", { name: "Cliente del operador" }, "operator-retry");
  await f.run("USER_SAVE", {
    id: identity.userId,
    name: identity.displayName,
    role: "OPERATOR",
    is_active: false,
  });
  await rejectsWithoutChange(
    f,
    () => operator.run("CUSTOMER_SAVE", { name: "Cliente del operador" }, "operator-retry"),
    /sin acceso/,
  );
  await f.run("USER_SAVE", { id: identity.userId, name: identity.displayName, role: "VIEWER" });
  await rejectsWithoutChange(f, () => operator.run("CUSTOMER_SAVE", { name: "Nuevo cliente" }), /consultar/);
});

test("R16: mismo request_id de actores activos distintos mantiene autoría y resultados separados", async (t) => {
  const f = await regressionFixture(t);
  const identity = { userId: "operator-synthetic", displayName: "Operador sintético" };
  await f.run("USER_SAVE", { id: identity.userId, name: identity.displayName, role: "OPERATOR" });
  const first = await f.run("CUSTOMER_SAVE", { name: "Solicitud del administrador" }, "shared-request");
  const second = await scenarioSession(f.store, identity).run(
    "CUSTOMER_SAVE",
    { name: "Solicitud del operador" },
    "shared-request",
  );
  assert.notEqual(first, second);
  const audit = (await f.state()).audit.filter((row) => row.request_id === "shared-request");
  assert.deepEqual(audit.map((row) => row.created_by).sort(), [adminIdentity.userId, identity.userId].sort());
});

test("R17: escenario portable de contado, crédito y entrega conserva caja e idempotencia", async (t) => {
  const f = await regressionFixture(t);
  await cashCreditScenario(f);
});

test("R18: lote de venta contado con segunda línea inválida revierte venta, caja, stock y auditoría", async (t) => {
  const f = await regressionFixture(t);
  await f.run("PRODUCTION_SAVE", productionPayload());
  await rejectsWithoutChange(
    f,
    () =>
      f.run(
        "SALE_SAVE",
        salePayload(f.customer, {
          payment_condition: "CASH",
          payment_method: "TRANSFER",
          deliver: true,
          items: [
            { product_id: "prod-1", quantity: 1 },
            { product_id: "prod-2", quantity: 1 },
          ],
        }),
      ),
    /insuficiente/,
  );
});

test("R19: fallo SQL tras venta, pago y stock planeados revierte el batch completo y permite reintento", async (t) => {
  const f = await regressionFixture(t);
  await f.run("PRODUCTION_SAVE", productionPayload());
  const before = await f.state();
  // Fault injection at the persistence boundary: business execution still uses the real store.
  let injected = false;
  const faultyBinding = {
    ...f.database.binding,
    batch(statements) {
      if (!statements.some((statement) => statement.sql.startsWith("INSERT")))
        return f.database.binding.batch(statements);
      injected = true;
      return f.database.binding.batch([
        ...statements,
        f.database.binding
          .prepare("INSERT INTO customer_sites(id,data,customer_id,site_id) VALUES (?,?,?,?)")
          .bind("fault-injection", "{}", f.customer, "missing-site"),
      ]);
    },
  };
  const failing = scenarioSession(createStore(() => faultyBinding));
  const payload = salePayload(f.customer, {
    deliver: true,
    payment_condition: "CASH",
    payment_method: "TRANSFER",
  });
  await assert.rejects(failing.run("SALE_SAVE", payload, "sql-retry"), /FOREIGN KEY/);
  assert.equal(injected, true, "El fallo debe ocurrir en el batch de escritura, después de cargar el estado");
  assert.deepEqual(await f.state(), before);
  const result = await f.run("SALE_SAVE", payload, "sql-retry");
  const committed = await f.state();
  assert.equal(committed.sales[0].id, result);
  assert.equal(committed.payments.length, 1);
  assert.equal(committed.audit.filter((row) => row.request_id === "sql-retry").length, 1);
  assert.equal(f.database.database.prepare("SELECT count(*) AS n FROM transaction_guards").get().n, 0);
});

test("R20: entregas concurrentes generan una sola salida y rechazan la revisión obsoleta", async (t) => {
  const f = await regressionFixture(t);
  await f.run("PRODUCTION_SAVE", productionPayload());
  const sale = await f.run("SALE_SAVE", salePayload(f.customer));
  const results = await Promise.allSettled([
    f.run("SALE_DELIVER", { id: sale }, "delivery-a"),
    f.run("SALE_DELIVER", { id: sale }, "delivery-b"),
  ]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.match(results.find((row) => row.status === "rejected").reason.message, /Otra operación/);
  const state = await f.state();
  assert.equal(state.inventoryMovements.filter((row) => row.source_id === sale).length, 1);
  assert.equal(stock(state, "prod-1").quantity, 36);
  await rejectsWithoutChange(f, () => f.run("SALE_DELIVER", { id: sale }), /no puede entregarse/);
});
