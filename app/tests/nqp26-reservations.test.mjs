import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createStore } from "../lib/application-store.mjs";
import { stock, saleSummary } from "../lib/domain.mjs";
import { persistenceTest, testDatabase, diskFixture } from "./helpers/persistence-fixtures.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { salePayload, paymentPayload, productionPayload } from "./helpers/regression-scenarios.mjs";

const identity = { userId: "nqp04-admin", displayName: "Admin sintético 04" };
const options = { partialReservations: true };
async function fixture(t, database = testDatabase(t)) {
  const store = createStore(() => database.binding, options);
  await store.ensureState(identity);
  const run = async (type, payload, request_id = randomUUID(), actor = identity) =>
    (await store.runCommand({ type, payload, request_id }, actor)).result;
  const customer = await run("CUSTOMER_SAVE", { name: "Cliente sintético 04" });
  const adjust = (quantity, weight = quantity * 25, product_id = "prod-1", direction = "IN") =>
    run("INVENTORY_ADJUST", {
      product_id,
      quantity,
      weight_kg: weight,
      direction,
      date: "2026-10-28",
      reason: "Prueba sintética",
    });
  const sell = (quantity, extra = {}, request) =>
    run(
      "SALE_SAVE",
      salePayload(customer, {
        items: [{ product_id: "prod-1", quantity, unit_weight_kg: 25, unit_price: 73 }],
        ...extra,
      }),
      request,
    );
  return { store, run, customer, adjust, sell, database, state: () => store.loadState() };
}
const rows = (s, id) => s.saleItems.filter((x) => x.sale_id === id && x.is_current !== false);
async function rejected(f, action, pattern) {
  const before = await f.state();
  await assert.rejects(action, pattern);
  assert.deepEqual(await f.state(), before);
}

for (const pending of [false, true])
  persistenceTest(`NQP26: anular producción reducida con saldo libre (faltante: ${pending})`, async (t) => {
    const f = await fixture(t);
    const id = await f.run(
      "PRODUCTION_SAVE",
      productionPayload({
        products: [{ product_id: "prod-1", nuclei_count: 2 }],
      }),
    );
    await f.run("PRODUCTION_CORRECT_QUANTITIES", {
      id,
      reason: "Reducir producción sintética",
      products: [{ product_id: "prod-1", nuclei_count: 1 }],
    });
    if (pending) await f.sell(1, { items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 50 }] });
    const before = await f.state();
    const history = before.inventoryMovements.filter((x) => x.source_id === id);
    await f.run("PRODUCTION_CANCEL", { id, reason: "Anular saldo libre" }, "cancel-reduced");
    const after = await f.state();
    assert.equal(after.productions.find((x) => x.id === id).status, "CANCELLED");
    assert.equal(stock(after, "prod-1").quantity, 0);
    assert.equal(stock(after, "prod-1").weight_kg, 0);
    assert.deepEqual(after.saleItems, before.saleItems);
    const reversals = after.inventoryMovements.filter((x) => x.source_id === id).slice(history.length);
    assert.equal(reversals.length, history.length);
    for (const [i, move] of history.entries()) {
      assert.equal(reversals[i].quantity + move.quantity, 0);
      assert.equal(reversals[i].weight_kg + move.weight_kg, 0);
      assert.equal(reversals[i].item_id, move.item_id);
    }
    await f.run("PRODUCTION_CANCEL", { id, reason: "Anular saldo libre" }, "cancel-reduced");
    assert.deepEqual(await f.state(), after);
    assert.deepEqual(await createStore(() => f.database.binding, options).loadState(), after);
  });

persistenceTest("NQP26: anular rectificaciones sucesivas de varios productos", async (t) => {
  const f = await fixture(t);
  const products = (count) => ["prod-1", "prod-2"].map((product_id) => ({ product_id, nuclei_count: count }));
  const id = await f.run("PRODUCTION_SAVE", productionPayload({ products: products(2) }));
  for (const count of [3, 1])
    await f.run("PRODUCTION_CORRECT_QUANTITIES", {
      id,
      reason: "Rectificar ambos productos",
      products: products(count),
    });
  await f.run("PRODUCTION_CANCEL", { id, reason: "Anular rectificaciones sucesivas" });
  const state = await f.state();
  for (const productId of ["prod-1", "prod-2"]) {
    assert.equal(stock(state, productId).quantity, 0);
    assert.equal(stock(state, productId).weight_kg, 0);
  }
});

persistenceTest("NQP26: anular producción reducida no consume reservas ni pesos incompatibles", async (t) => {
  const f = await fixture(t);
  const id = await f.run(
    "PRODUCTION_SAVE",
    productionPayload({
      products: [{ product_id: "prod-1", nuclei_count: 2 }],
    }),
  );
  await f.run("PRODUCTION_CORRECT_QUANTITIES", {
    id,
    reason: "Reducir producción sintética",
    products: [{ product_id: "prod-1", nuclei_count: 1 }],
  });
  await f.sell(1);
  await rejected(f, () => f.run("PRODUCTION_CANCEL", { id, reason: "Saldo reservado" }), /consumió/);
  await f.adjust(20, 480);
  await rejected(
    f,
    () => f.run("PRODUCTION_CANCEL", { id, reason: "Peso incompatible" }),
    /compatible insuficiente/,
  );
});

persistenceTest("NQP26 I01/I02: 35/40 y segundo pedido conservan K/N, gramos y replay", async (t) => {
  const f = await fixture(t);
  await f.adjust(35);
  const a = await f.sell(40, {}, "sale-a");
  let s = await f.state();
  assert.equal(s.sales.find((x) => x.id === a).coverage_version, 1);
  assert.equal(rows(s, a)[0].coverage.quantity, 35);
  assert.equal(rows(s, a)[0].coverage.weight_grams, 875000);
  assert.equal(rows(s, a)[0].quantity - rows(s, a)[0].coverage.quantity, 5);
  assert.equal(
    saleSummary(
      s,
      s.sales.find((x) => x.id === a),
    ).coverage_label,
    "Pendiente por stock",
  );
  assert.equal(
    saleSummary(
      s,
      s.sales.find((x) => x.id === a),
    ).missing_quantity,
    5,
  );
  const b = await f.sell(35);
  s = await f.state();
  assert.equal(rows(s, b)[0].coverage.quantity, 0);
  assert.equal(stock(s, "prod-1").quantity, 0);
  assert.equal(stock(s, "prod-1").weight_kg, 0);
  assert.equal(s.inventoryMovements.filter((x) => x.source_id === a).length, 1);
  const move = s.inventoryMovements.find((x) => x.id === rows(s, a)[0].coverage.movement_id);
  assert.equal(move.sale_item_id, rows(s, a)[0].id);
  assert.equal(move.quantity, -35);
  assert.equal(move.weight_kg, -875000);
  assert.equal(s.sales.find((x) => x.id === a).fulfillment_status, "PENDING");
  assert.equal(await f.sell(40, {}, "sale-a"), a);
  assert.deepEqual(await f.state(), s);
  assert.deepEqual(await createStore(() => f.database.binding, options).loadState(), s);
  for (const [id, amount] of [
    [a, 10],
    [a, 2910],
    [b, 2555],
  ]) {
    const before = await f.state();
    await f.run(
      "PAYMENT_CREATE",
      paymentPayload(f.customer, id, {
        total_amount: amount,
        applications: [{ sale_id: id, applied_amount: amount }],
      }),
    );
    const after = await f.state();
    assert.deepEqual(after.inventoryMovements, before.inventoryMovements);
    assert.deepEqual(after.saleItems, before.saleItems);
    assert.equal(after.sales.find((x) => x.id === id).fulfillment_status, "PENDING");
  }
  assert.equal(saleSummary(await f.state(), { id: a }).balance, 0);
  await rejected(f, () => f.run("SALE_DELIVER", { id: a }), /pendiente por stock/i);
  await f.adjust(10);
  assert.equal(rows(await f.state(), a)[0].coverage.quantity, 40);
  assert.equal(rows(await f.state(), b)[0].coverage.quantity, 5);
  await f.run("PRODUCTION_SAVE", productionPayload());
  await rejected(f, () => f.run("SALE_CANCEL", { id: a, reason: "Prueba" }), /pagos/);
  await rejected(
    f,
    () => f.run("SALE_CORRECT", { id: a, reason: "Prueba", items: [{ product_id: "prod-1", quantity: 2 }] }),
    /pago excedente/,
  );
});

persistenceTest(
  "NQP26 I10: suficiente, entrega explícita, reapertura y rectificación idéntica sin cargo",
  async (t) => {
    const f = await fixture(t);
    await f.adjust(3);
    const id = await f.sell(2, {
      payment_condition: "CASH",
      payment_method: "TRANSFER",
      paid_amount: 146,
      deliver: true,
    });
    let s = await f.state();
    assert.equal(s.sales.find((x) => x.id === id).fulfillment_status, "PENDING");
    assert.equal(rows(s, id)[0].coverage.quantity, 2);
    assert.equal(
      saleSummary(
        s,
        s.sales.find((x) => x.id === id),
      ).coverage_label,
      "Listo por stock",
    );
    assert.equal(saleSummary(s, { id }).paid, 14600);
    const item = rows(s, id)[0];
    await f.run("SALE_CORRECT", {
      id,
      reason: "Sin cambios",
      items: [
        {
          product_id: item.product_id,
          original_item_id: item.id,
          quantity: 2,
          unit_weight_kg: 25,
          unit_price: 73,
        },
      ],
    });
    const reopened = await f.state();
    assert.deepEqual({ ...reopened, audit: s.audit, revision: s.revision }, s);
    await f.run("SALE_DELIVER", { id }, "delivery");
    const after = await f.state();
    assert.deepEqual(after.inventoryMovements, s.inventoryMovements);
    assert.deepEqual(after.saleItems, s.saleItems);
    assert.deepEqual(after.payments, s.payments);
    assert.equal(after.sales.find((x) => x.id === id).fulfillment_status, "DELIVERED");
    await f.run("SALE_DELIVER", { id }, "delivery");
    assert.deepEqual(await f.state(), after);
    await rejected(f, () => f.run("SALE_CANCEL", { id, reason: "Sin retiro probado" }), /devolución física/);
    await rejected(f, () => f.adjust(2, 50, "prod-1", "OUT"), /insuficiente/i);
  },
);

persistenceTest("NQP26 R04-05/17: cero saldo, cobro, crédito, borrador y múltiples productos", async (t) => {
  const f = await fixture(t);
  await f.adjust(2);
  const draft = await f.sell(1, { confirm: false });
  await rejected(f, () => f.sell(80, { create_production: true }), /planificación automática/);
  let s = await f.state();
  assert.equal(rows(s, draft)[0].coverage, undefined);
  assert.equal(stock(s, "prod-1").quantity, 2);
  const id = await f.sell(2, {
    items: [
      { product_id: "prod-1", quantity: 2, unit_price: 73 },
      { product_id: "prod-2", quantity: 3, unit_price: 67 },
    ],
    payment_condition: "CASH",
    payment_method: "TRANSFER",
    paid_amount: 400,
  });
  s = await f.state();
  assert.deepEqual(
    rows(s, id).map((x) => x.coverage.quantity),
    [2, 0],
  );
  assert.equal(s.sales.find((x) => x.id === id).fulfillment_status, "PENDING");
  const zero = await f.sell(1);
  s = await f.state();
  assert.equal(rows(s, zero)[0].coverage.quantity, 0);
  const payment = s.payments[0];
  const before = structuredClone(s.saleItems);
  await f.run("PAYMENT_APPLY_CREDIT", {
    payment_id: payment.id,
    applications: [{ sale_id: zero, applied_amount: 53 }],
  });
  assert.deepEqual((await f.state()).saleItems, before);
});

persistenceTest("NQP26 I12: variantes 25/50/24 kg, frascos 2,2 y BASE no intercambiables", async (t) => {
  const f = await fixture(t);
  await f.adjust(3);
  const a = await f.sell(1, {
    items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 50, unit_price: 90 }],
  });
  assert.equal(rows(await f.state(), a)[0].coverage.quantity, 0);
  // 05 permite asignación compatible sin consumir la presentación de 50 kg pendiente.
  const compatible = await f.sell(1);
  assert.equal(rows(await f.state(), compatible)[0].coverage.quantity, 1);
  assert.equal(rows(await f.state(), a)[0].coverage.quantity, 0);
  const bottle = await f.run("PRODUCT_SAVE", {
    name: "Frasco sintético",
    presentation_unit: "BOTTLE",
    unit_weight_grams: 2200,
    weight_policy: "FIXED",
    stock_entry_mode: "DIRECT_STOCK",
    default_sale_price: 10,
    is_sellable: true,
  });
  await f.adjust(2, 4.4, bottle);
  const b = await f.sell(1, {
    items: [{ product_id: bottle, quantity: 2, unit_weight_kg: 2.2, unit_price: 12 }],
  });
  assert.equal(rows(await f.state(), b)[0].coverage.weight_grams, 4400);
  await rejected(f, () => f.sell(1, { items: [{ product_id: "prod-4", quantity: 1 }] }), /habilitado/);
  await f.adjust(2, 48, "prod-2");
  const v = await f.sell(1, {
    items: [
      { product_id: "prod-2", quantity: 1, unit_weight_kg: 24, unit_price: 77 },
      { product_id: "prod-2", quantity: 1, unit_weight_kg: 24, unit_price: 78 },
    ],
  });
  const vr = rows(await f.state(), v);
  assert.deepEqual(
    vr.map((x) => x.coverage.quantity),
    [1, 1],
  );
  assert.deepEqual(
    vr.map((x) => x.unit_price),
    [7700, 7800],
  );
  assert.equal(stock(await f.state(), "prod-2").weight_kg, 0);
});

persistenceTest(
  "NQP26 I13 / R04-18/19: legacy inmutable, adopción explícita y motor deshabilitado",
  async (t) => {
    const f = await fixture(t);
    const legacy = createStore(() => f.database.binding);
    await f.adjust(4);
    const old = await legacy.runCommand(
      {
        type: "SALE_SAVE",
        payload: salePayload(f.customer, {
          deliver: true,
          items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 25 }],
        }),
        request_id: "legacy",
      },
      identity,
    );
    const historic = JSON.stringify({
      sale: old.state.sales,
      items: old.state.saleItems,
      moves: old.state.inventoryMovements,
    });
    const legacyPending = await legacy.runCommand(
      {
        type: "SALE_SAVE",
        payload: salePayload(f.customer, {
          items: [{ product_id: "prod-2", quantity: 1, unit_weight_kg: 25 }],
        }),
        request_id: "legacy-pending",
      },
      identity,
    );
    await rejected(f, () => f.run("SALE_DELIVER", { id: legacyPending.result }), /adopción explícita/);
    await f.sell(1);
    const s = await f.state();
    assert.equal(
      JSON.stringify({
        sale: s.sales.filter((x) => x.id === old.result),
        items: s.saleItems.filter((x) => x.sale_id === old.result),
        moves: s.inventoryMovements.filter((x) => old.state.inventoryMovements.some((m) => m.id === x.id)),
      }),
      historic,
    );
    await assert.rejects(
      legacy.runCommand(
        {
          type: "INVENTORY_ADJUST",
          payload: {
            product_id: "prod-1",
            quantity: 1,
            weight_kg: 25,
            direction: "IN",
            reason: "Bypass",
            date: "2026-10-28",
          },
          request_id: "bypass",
        },
        identity,
      ),
      /aislado/,
    );
    assert.deepEqual(await f.state(), s);
  },
);

persistenceTest("NQP26 R04-09: 50 kg y gramos sobrantes no se transforman en unidades de 25", async (t) => {
  const f = await fixture(t);
  await f.adjust(2, 100, "prod-3");
  const id = await f.sell(1, {
    items: [{ product_id: "prod-3", quantity: 1, unit_weight_kg: 50, unit_price: 90 }],
  });
  let s = await f.state();
  assert.equal(rows(s, id)[0].coverage.quantity, 1);
  assert.equal(rows(s, id)[0].coverage.weight_grams, 50000);
  const incompatible = await f.sell(1, {
    items: [{ product_id: "prod-3", quantity: 1, unit_weight_kg: 25, unit_price: 73 }],
  });
  s = await f.state();
  assert.equal(rows(s, incompatible)[0].coverage.quantity, 0);
  assert.equal(stock(s, "prod-3").quantity, 1);
  assert.equal(stock(s, "prod-3").weight_kg, 50000);
  await f.adjust(2, 49, "prod-2");
  const odd = await f.sell(2, {
    items: [{ product_id: "prod-2", quantity: 2, unit_weight_kg: 25, unit_price: 73 }],
  });
  s = await f.state();
  assert.equal(rows(s, odd)[0].coverage.quantity, 0);
  assert.equal(stock(s, "prod-2").quantity, 2);
  assert.equal(stock(s, "prod-2").weight_kg, 49000);
});

persistenceTest("NQP26 R04-20: rollback de cobertura/cobro/auditoría y reintento íntegro", async (t) => {
  const f = await fixture(t);
  await f.adjust(2);
  const before = await f.state();
  let injected = false;
  const binding = {
    ...f.database.binding,
    batch(statements) {
      const i = statements.findIndex((x) => x.sql.startsWith("INSERT INTO audit"));
      if (i < 0) return f.database.binding.batch(statements);
      injected = true;
      return f.database.binding.batch([
        ...statements.slice(0, i),
        f.database.binding
          .prepare("INSERT INTO customer_sites(id,data,customer_id,site_id) VALUES (?,?,?,?)")
          .bind("fault", "{}", f.customer, "missing"),
        ...statements.slice(i),
      ]);
    },
  };
  const command = {
    type: "SALE_SAVE",
    payload: salePayload(f.customer, {
      items: [{ product_id: "prod-1", quantity: 3, unit_weight_kg: 25 }],
      payment_condition: "CASH",
      payment_method: "TRANSFER",
      paid_amount: 10,
    }),
    request_id: "atomic04",
  };
  await assert.rejects(createStore(() => binding, options).runCommand(command, identity), /FOREIGN KEY/);
  assert.ok(injected);
  assert.deepEqual(await f.state(), before);
  const result = await f.store.runCommand(command, identity);
  assert.equal(rows(result.state, result.result)[0].coverage.quantity, 2);
  assert.equal(result.state.payments.length, 1);
});

test("NQP26 R04-08: dos conexiones SQLite y actores, revisión obsoleta y reinicio", async (t) => {
  const connections = [];
  t.after(() => connections.forEach((x) => x.close()));
  const db = diskFixture(t);
  const f = await fixture(t, db);
  await f.adjust(1);
  await f.run("USER_SAVE", { id: "operator-a", name: "A sintético", role: "OPERATOR" });
  await f.run("USER_SAVE", { id: "operator-b", name: "B sintético", role: "OPERATOR" });
  const second = openSqliteDatabase(db.filename);
  connections.push(second);
  const commands = ["operator-a", "operator-b"].map((userId) => ({
    actor: { userId, displayName: userId },
    command: {
      type: "SALE_SAVE",
      payload: salePayload(f.customer, {
        items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 25 }],
      }),
      request_id: userId,
    },
  }));
  const stores = [f.store, createStore(() => second, options)];
  const results = await Promise.allSettled(commands.map((x, i) => stores[i].runCommand(x.command, x.actor)));
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const failed = results.findIndex((x) => x.status === "rejected");
  assert.match(results[failed].reason.message, /Otra operación/);
  await stores[failed].runCommand(commands[failed].command, commands[failed].actor);
  const s = await f.state();
  assert.deepEqual(s.saleItems.map((x) => x.coverage.quantity).sort(), [0, 1]);
  assert.equal(stock(s, "prod-1").quantity, 0);
  assert.equal(db.database.prepare("SELECT count(*) AS n FROM transaction_guards").get().n, 0);
  second.close();
  const reopened = openSqliteDatabase(db.filename);
  connections.push(reopened);
  assert.deepEqual(await createStore(() => reopened, options).loadState(), s);
});
