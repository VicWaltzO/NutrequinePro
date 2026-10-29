import assert from "node:assert/strict";
import { persistenceTest, diskFixture } from "./helpers/persistence-fixtures.mjs";
import { test } from "node:test";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { coverageFixture, currentRows } from "./helpers/coverage-fixtures.mjs";
import { stock, saleSummary } from "../lib/domain.mjs";
import { createStore } from "../lib/application-store.mjs";
import { coverageOptions, coverageIdentity } from "./helpers/coverage-fixtures.mjs";
import { salePayload, productionPayload, rejectsWithoutChange } from "./helpers/regression-scenarios.mjs";

persistenceTest(
  "R05-21/26: anular o rectificar entregada legacy no inventa stock para la cola",
  async (t) => {
    const f = await coverageFixture(t);
    await f.adjust(2);
    const legacy = createStore(() => f.database.binding);
    const id = (
      await legacy.runCommand(
        {
          type: "SALE_SAVE",
          request_id: "delivered-legacy",
          payload: salePayload(f.customer, {
            deliver: true,
            items: [{ product_id: "prod-1", quantity: 2, unit_weight_kg: 25 }],
          }),
        },
        coverageIdentity,
      )
    ).result;
    const pending = await f.sell(2);
    const row = currentRows(await f.state(), id)[0];
    await rejectsWithoutChange(
      f,
      () => f.run("SALE_CANCEL", { id, reason: "No acredita devolución" }),
      /devolución física/,
    );
    await rejectsWithoutChange(
      f,
      () =>
        f.run("SALE_CORRECT", {
          id,
          reason: "No acredita devolución",
          items: [
            {
              original_item_id: row.id,
              product_id: row.product_id,
              quantity: 1,
              unit_weight_kg: 25,
            },
          ],
        }),
      /devolución física/,
    );
    const s = await f.state();
    assert.equal(currentRows(s, pending)[0].coverage.quantity, 0);
    assert.equal(stock(s, "prod-1").quantity, 0);
  },
);

persistenceTest("R05-06/14: línea ordinal y reposición multiproducto conservan variantes", async (t) => {
  const f = await coverageFixture(t);
  const id = await f.sell(1, "2026-11-01", {
    items: [
      { product_id: "prod-1", quantity: 1, unit_weight_kg: 25, unit_price: 73 },
      { product_id: "prod-1", quantity: 1, unit_weight_kg: 25, unit_price: 74 },
      { product_id: "prod-2", quantity: 3, unit_weight_kg: 25, unit_price: 75 },
    ],
  });
  const old = currentRows(await f.state(), id);
  await f.adjust(1);
  let s = await f.state();
  const ordinal = old
    .filter((r) => r.product_id === "prod-1")
    .map((r) => r.id)
    .sort();
  assert.equal(s.saleItems.find((r) => r.id === ordinal[0]).coverage.quantity, 1);
  assert.equal(s.saleItems.find((r) => r.id === ordinal[1]).coverage.quantity, 0);
  await f.run(
    "PRODUCTION_SAVE",
    productionPayload({
      products: [
        { product_id: "prod-1", nuclei_count: 1 },
        { product_id: "prod-2", nuclei_count: 1 },
      ],
    }),
  );
  s = await f.state();
  assert.deepEqual(
    currentRows(s, id).map((r) => r.coverage.quantity),
    [1, 1, 3],
  );
  assert.deepEqual(
    currentRows(s, id).map((r) => r.unit_price),
    old.map((r) => r.unit_price),
  );
  assert.equal(s.inventoryMovements.filter((m) => m.movement_type === "PRODUCTION_IN").length, 2);
});

persistenceTest(
  "R05-18: revertir pago explícitamente permite cancelar y reasignar sin borrar cobro",
  async (t) => {
    const f = await coverageFixture(t);
    await f.adjust(2);
    const a = await f.sell(2, "2026-11-01", {
      payment_condition: "CASH",
      payment_method: "TRANSFER",
      paid_amount: 10,
    });
    const b = await f.sell(2);
    const before = await f.state();
    await rejectsWithoutChange(f, () => f.run("SALE_CANCEL", { id: a, reason: "No revertido" }), /pagos/);
    await f.run("PAYMENT_REVERSE", {
      id: before.payments[0].id,
      reason: "Reversión explícita",
      date: "2026-10-29",
    });
    await f.run("SALE_CANCEL", { id: a, reason: "Pedido cancelado con reversión previa" });
    const s = await f.state();
    assert.deepEqual(s.payments, before.payments);
    assert.equal(s.paymentReversals.length, 1);
    assert.equal(currentRows(s, b)[0].coverage.quantity, 2);
    assert.equal(stock(s, "prod-1").quantity, 0);
  },
);

persistenceTest(
  "R05-12: política fija y variable no intercambian existencias del mismo producto",
  async (t) => {
    const f = await coverageFixture(t);
    const id = await f.run("PRODUCT_SAVE", {
      name: "Saco fijo sintético",
      presentation_unit: "BAG",
      unit_weight_grams: 25000,
      weight_policy: "FIXED",
      stock_entry_mode: "DIRECT_STOCK",
      default_sale_price: 10,
      is_sellable: true,
    });
    await f.adjust(2, id);
    await rejectsWithoutChange(
      f,
      () => f.run("PRODUCT_SAVE", { id, name: "Saco ahora variable", weight_policy: "VARIABLE" }),
      /tiene historial/,
    );
    // Synthetic historical mixture: the current master cannot rewrite a fixed movement snapshot.
    const before = await f.state();
    const mixed = structuredClone(before);
    mixed.products.find((p) => p.id === id).weight_policy = "VARIABLE";
    await f.store.persistState(before, mixed);
    const sale = await f.sell(2, "2026-11-01", {
      items: [{ product_id: id, quantity: 2, unit_weight_kg: 25 }],
    });
    assert.equal(currentRows(await f.state(), sale)[0].coverage.quantity, 0);
    await f.adjust(1, id);
    const s = await f.state();
    assert.equal(currentRows(s, sale)[0].coverage.quantity, 1);
    assert.equal(stock(s, id).quantity, 2);
    assert.equal(stock(s, id).weight_kg, 50000);
  },
);

persistenceTest(
  "R05-15: conservación en 40 transiciones deterministas de entrada, reserva y liberación",
  async (t) => {
    const f = await coverageFixture(t);
    let seed = 2605;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed >>> 8;
    };
    let received = 0;
    for (let i = 0; i < 40; i++) {
      const state = await f.state();
      const pending = state.sales.filter((s) => s.commercial_status !== "CANCELLED");
      const choice = next() % 4;
      if (choice === 0 || !pending.length) {
        const quantity = 1 + (next() % 5);
        await f.adjust(quantity);
        received += quantity;
      } else if (choice === 1) {
        await f.sell(1 + (next() % 7), `2026-11-${String(1 + (next() % 9)).padStart(2, "0")}`);
      } else {
        const sale = pending[next() % pending.length];
        const row = currentRows(state, sale.id)[0];
        if (choice === 2 || row.quantity === 1)
          await f.run("SALE_CANCEL", { id: sale.id, reason: "Liberación sintética secuencia" });
        else
          await f.run("SALE_CORRECT", {
            id: sale.id,
            reason: "Reducción sintética secuencia",
            items: [
              {
                original_item_id: row.id,
                product_id: row.product_id,
                quantity: row.quantity - 1,
                unit_weight_kg: 25,
                unit_price: 73,
              },
            ],
          });
      }
      const after = await f.state();
      const active = after.saleItems.filter((r) => r.is_current !== false);
      const reserved = active.reduce((n, r) => n + r.coverage.quantity, 0);
      const balance = stock(after, "prod-1");
      assert.equal(balance.quantity + reserved, received, `unidades paso ${i}`);
      assert.equal(balance.weight_kg + reserved * 25000, received * 25000, `gramos paso ${i}`);
      assert.ok(balance.quantity >= 0 && balance.weight_kg >= 0);
      assert.ok(active.every((r) => r.coverage.quantity >= 0 && r.coverage.quantity <= r.quantity));
    }
  },
);

persistenceTest("R05-03/10: 35/40, entrada 10, múltiples enlaces y replay", async (t) => {
  const f = await coverageFixture(t);
  await f.adjust(35);
  const a = await f.sell(40);
  const b = await f.sell(35, "2026-11-02");
  const before = await f.state();
  const original = currentRows(before, a)[0].coverage.movement_id;
  await f.run("INVENTORY_ADJUST", f.adjustment(10), "entry-ten");
  let s = await f.state();
  assert.equal(currentRows(s, a)[0].coverage.quantity, 40);
  assert.equal(currentRows(s, b)[0].coverage.quantity, 5);
  assert.equal(currentRows(s, a)[0].coverage.movement_id, original);
  assert.equal(currentRows(s, a)[0].coverage.events.length, 2);
  assert.equal(stock(s, "prod-1").quantity, 0);
  assert.equal(stock(s, "prod-1").weight_kg, 0);
  assert.equal(saleSummary(s, { id: a, coverage_version: 1 }).coverage_status, "READY_BY_STOCK");
  assert.ok(s.sales.every((r) => r.fulfillment_status === "PENDING"));
  await f.run("INVENTORY_ADJUST", f.adjustment(10), "entry-ten");
  assert.deepEqual(await f.state(), s);
  await f.adjust(2);
  await f.adjust(3);
  s = await f.state();
  assert.equal(currentRows(s, b)[0].coverage.quantity, 10);
  assert.equal(currentRows(s, b)[0].coverage.events.length, 3);
  const moves = s.inventoryMovements;
  for (const row of currentRows(s, b)) {
    for (const event of row.coverage.events) {
      const move = moves.find((m) => m.id === event.movement_id);
      assert.equal(event.quantity, -move.quantity);
      assert.equal(event.weight_grams, -move.weight_kg);
      assert.ok(move.request_id);
    }
  }
});

for (const operation of ["INVENTORY_ADJUST", "SALE_CANCEL", "SALE_CORRECT"])
  persistenceTest(`R05-25: rollback FK de ${operation} revierte toda la redistribución`, async (t) => {
    const f = await coverageFixture(t);
    await f.adjust(2);
    const a = await f.sell(3);
    await f.sell(4, "2026-11-02");
    const before = await f.state();
    const row = currentRows(before, a)[0];
    const payloads = {
      INVENTORY_ADJUST: f.adjustment(3),
      SALE_CANCEL: { id: a, reason: "Ensayo rollback" },
      SALE_CORRECT: {
        id: a,
        reason: "Ensayo rollback",
        items: [
          {
            original_item_id: row.id,
            product_id: row.product_id,
            quantity: 1,
            unit_weight_kg: 25,
            unit_price: 73,
          },
        ],
      },
    };
    let injected = false;
    const binding = {
      ...f.database.binding,
      batch(statements) {
        const i = statements.findIndex((s) => s.sql.startsWith("INSERT INTO audit"));
        if (i < 0) return f.database.binding.batch(statements);
        injected = true;
        return f.database.binding.batch([
          ...statements.slice(0, i),
          f.database.binding
            .prepare("INSERT INTO customer_sites(id,data,customer_id,site_id) VALUES (?,?,?,?)")
            .bind("queue-fault", "{}", f.customer, "missing-site"),
          ...statements.slice(i),
        ]);
      },
    };
    const command = { type: operation, payload: payloads[operation], request_id: "queue-atomic" };
    await assert.rejects(
      createStore(() => binding, coverageOptions).runCommand(command, coverageIdentity),
      /FOREIGN KEY/,
    );
    assert.ok(injected);
    assert.deepEqual(await f.state(), before);
    await f.store.runCommand(command, coverageIdentity);
    const after = await f.state();
    await f.store.runCommand(command, coverageIdentity);
    assert.deepEqual(await f.state(), after);
  });

test("R05-24: entradas en dos conexiones, conflicto, reintento y reapertura SQLite", async (t) => {
  const connections = [];
  t.after(() => connections.forEach((c) => c.close()));
  const db = diskFixture(t);
  const f = await coverageFixture(t, db);
  const id = await f.sell(1);
  const second = openSqliteDatabase(db.filename);
  connections.push(second);
  const other = createStore(() => second, coverageOptions);
  const commands = ["entry-a", "entry-b"].map((request_id) => ({
    type: "INVENTORY_ADJUST",
    payload: f.adjustment(1),
    request_id,
  }));
  const stores = [f.store, other];
  const results = await Promise.allSettled(commands.map((c, i) => stores[i].runCommand(c, coverageIdentity)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failed = results.findIndex((r) => r.status === "rejected");
  assert.match(results[failed].reason.message, /Otra operación/);
  await stores[failed].runCommand(commands[failed], coverageIdentity);
  const state = await f.state();
  assert.equal(currentRows(state, id)[0].coverage.quantity, 1);
  assert.equal(stock(state, "prod-1").quantity, 1);
  assert.equal(state.inventoryMovements.filter((m) => m.coverage_action === "ASSIGN").length, 1);
  second.close();
  const reopened = openSqliteDatabase(db.filename);
  connections.push(reopened);
  assert.deepEqual(await createStore(() => reopened, coverageOptions).loadState(), state);
});

persistenceTest(
  "R05-02: cobertura anterior sin events conserva enlace inicial después de reposición",
  async (t) => {
    const f = await coverageFixture(t);
    await f.adjust(1);
    const id = await f.sell(3);
    const before = await f.state();
    const old = structuredClone(before);
    delete currentRows(old, id)[0].coverage.events;
    await f.store.persistState(before, old);
    const first = currentRows(old, id)[0].coverage.movement_id;
    await f.adjust(1);
    const s = await f.state();
    const row = currentRows(s, id)[0];
    assert.equal(row.coverage.movement_id, first);
    assert.equal(row.coverage.events.length, 2);
    assert.equal(row.coverage.events[0].movement_id, first);
    assert.deepEqual(s.inventoryMovements.slice(0, old.inventoryMovements.length), old.inventoryMovements);
    assert.deepEqual(await createStore(() => f.database.binding, coverageOptions).loadState(), s);
  },
);

persistenceTest(
  "R05-20: reducción bajo pago y duplicación de identidad se rechazan íntegramente",
  async (t) => {
    const f = await coverageFixture(t);
    await f.adjust(2);
    const id = await f.sell(2, "2026-11-01", {
      payment_condition: "CASH",
      payment_method: "TRANSFER",
      paid_amount: 146,
    });
    const row = currentRows(await f.state(), id)[0];
    const item = {
      original_item_id: row.id,
      product_id: row.product_id,
      quantity: 1,
      unit_weight_kg: 25,
      unit_price: 73,
    };
    await rejectsWithoutChange(
      f,
      () => f.run("SALE_CORRECT", { id, reason: "Reducir pagada", items: [item] }),
      /pago excedente/,
    );
    await rejectsWithoutChange(
      f,
      () =>
        f.run("SALE_CORRECT", {
          id,
          reason: "Identidad repetida",
          items: [item, { ...item, unit_price: 75 }],
        }),
      /repetida/,
    );
  },
);

persistenceTest("R05-27: cargos históricos o presentación incierta impiden adopción", async (t) => {
  const f = await coverageFixture(t);
  const legacy = createStore(() => f.database.binding);
  const id = (
    await legacy.runCommand(
      {
        type: "SALE_SAVE",
        request_id: "ambiguous-legacy",
        payload: salePayload(f.customer, {
          items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 25 }],
        }),
      },
      coverageIdentity,
    )
  ).result;
  const before = await f.state();
  const ambiguous = structuredClone(before);
  const row = currentRows(ambiguous, id)[0];
  delete row.presentation_unit_snapshot;
  await f.store.persistState(before, ambiguous);
  await rejectsWithoutChange(
    f,
    () => f.run("SALE_COVERAGE_ADOPT", { id, reason: "No adivinar", delivery_date: "2026-11-01" }),
    /ambigua/,
  );
  const fixed = structuredClone(ambiguous);
  currentRows(fixed, id)[0].presentation_unit_snapshot = "BAG";
  fixed.inventoryMovements.push({
    id: "historical-debit",
    item_type: "PRODUCT",
    item_id: "prod-1",
    quantity: -1,
    weight_kg: -25000,
    source_type: "SALE",
    source_id: id,
    movement_type: "SALE_OUT",
    date: "2026-10-14",
  });
  await f.store.persistState(ambiguous, fixed);
  await rejectsWithoutChange(
    f,
    () => f.run("SALE_COVERAGE_ADOPT", { id, reason: "Cargo sin conciliación", delivery_date: "2026-11-01" }),
    /Historial ambiguo/,
  );
});

persistenceTest("R05-04/07/09: prioridad inversa, pago y reprogramación solo afectan N", async (t) => {
  const f = await coverageFixture(t);
  await f.adjust(35);
  const a = await f.sell(40, "2026-11-03");
  const b = await f.sell(35, "2026-11-01", {
    payment_condition: "CASH",
    payment_method: "TRANSFER",
    paid_amount: 10,
  });
  const before = await f.state();
  await f.adjust(10);
  let s = await f.state();
  assert.deepEqual(
    [a, b].map((id) => currentRows(s, id)[0].coverage.quantity),
    [35, 10],
  );
  assert.deepEqual(s.payments, before.payments);
  const covered = structuredClone(s.saleItems);
  await f.run("SALE_DELIVERY_DATE_UPDATE", {
    id: a,
    delivery_date: "2026-10-30",
    reason: "Priorizar faltante",
  });
  assert.deepEqual((await f.state()).saleItems, covered);
  await f.adjust(6);
  s = await f.state();
  assert.deepEqual(
    [a, b].map((id) => currentRows(s, id)[0].coverage.quantity),
    [40, 11],
  );
  assert.deepEqual(s.payments, before.payments);
});

persistenceTest("R05-11/12/14/15: incompatibles, variantes, sobrante y consumos", async (t) => {
  const f = await coverageFixture(t);
  const a = await f.sell(3);
  await f.adjust(1, "prod-1", 50);
  await f.adjust(2, "prod-1", 48);
  assert.equal(currentRows(await f.state(), a)[0].coverage.quantity, 0);
  const v = await f.sell(2, "2026-10-30", {
    items: [
      { product_id: "prod-1", quantity: 1, unit_weight_kg: 24, unit_price: 77 },
      { product_id: "prod-1", quantity: 1, unit_weight_kg: 24, unit_price: 78 },
    ],
  });
  assert.deepEqual(
    currentRows(await f.state(), v).map((r) => r.coverage.quantity),
    [1, 1],
  );
  await f.adjust(5);
  let s = await f.state();
  assert.equal(currentRows(s, a)[0].coverage.quantity, 3);
  assert.equal(stock(s, "prod-1").quantity, 3);
  await rejectsWithoutChange(f, () => f.adjust(3, "prod-1", 75, "OUT"), /compatible insuficiente/);
  await f.adjust(2, "prod-1", 50, "OUT");
  s = await f.state();
  assert.equal(stock(s, "prod-1").quantity, 1);
  assert.equal(stock(s, "prod-1").weight_kg, 50000);
  const b = await f.sell(1, "2026-11-01", {
    items: [{ product_id: "prod-2", quantity: 1, unit_weight_kg: 25 }],
  });
  await f.adjust(1, "prod-2");
  s = await f.state();
  assert.equal(currentRows(s, b)[0].coverage.quantity, 1);
  assert.equal(stock(s, "prod-1").weight_kg, 50000);
});

persistenceTest("R05-16: PRODUCTION_IN vigente asigna una sola vez", async (t) => {
  const f = await coverageFixture(t);
  const sale = await f.sell(4);
  await f.run("PRODUCTION_SAVE", productionPayload(), "produce-once");
  const s = await f.state();
  assert.equal(currentRows(s, sale)[0].coverage.quantity, 4);
  assert.equal(s.inventoryMovements.filter((m) => m.movement_type === "PRODUCTION_IN").length, 1);
  await f.run("PRODUCTION_SAVE", productionPayload(), "produce-once");
  assert.deepEqual(await f.state(), s);
});

persistenceTest(
  "R05-18/21/22: pago bloquea anulación, entrega no retorna y devolución real asigna",
  async (t) => {
    const f = await coverageFixture(t);
    await f.adjust(2);
    const a = await f.sell(2, "2026-11-01", {
      payment_condition: "CASH",
      payment_method: "TRANSFER",
      paid_amount: 10,
    });
    const b = await f.sell(2);
    await rejectsWithoutChange(f, () => f.run("SALE_CANCEL", { id: a, reason: "Con pago" }), /pagos/);
    await f.run("SALE_DELIVER", { id: a });
    await rejectsWithoutChange(
      f,
      () => f.run("SALE_CANCEL", { id: a, reason: "Sin retorno" }),
      /devolución física/,
    );
    const before = await f.state();
    const payload = {
      sale_id: a,
      return_date: "2026-10-29",
      reason: "Recepción física sintética",
      economic_amount: 0,
      items: [{ sale_item_id: currentRows(before, a)[0].id, quantity: 1 }],
    };
    await f.run("RETURN_CREATE", payload, "return-one");
    const s = await f.state();
    assert.equal(currentRows(s, b)[0].coverage.quantity, 1);
    assert.equal(s.inventoryMovements.filter((m) => m.movement_type === "RETURN_IN").length, 1);
    assert.deepEqual(s.payments, before.payments);
    await f.run("RETURN_CREATE", payload, "return-one");
    assert.deepEqual(await f.state(), s);
  },
);

persistenceTest("R05-19/20/23: reducir, precio, peso y producto preservan snapshots y enlaces", async (t) => {
  const f = await coverageFixture(t);
  await f.adjust(8);
  const a = await f.sell(10);
  const b = await f.sell(4, "2026-11-02");
  const before = await f.state();
  const first = currentRows(before, a)[0];
  const payload = {
    id: a,
    reason: "Reducir a cinco",
    items: [
      { original_item_id: first.id, product_id: "prod-1", quantity: 5, unit_weight_kg: 25, unit_price: 73 },
    ],
  };
  await f.run("SALE_CORRECT", payload, "reduce-five");
  let s = await f.state();
  assert.equal(currentRows(s, a)[0].coverage.quantity, 5);
  assert.equal(currentRows(s, b)[0].coverage.quantity, 3);
  assert.deepEqual(
    s.saleItems.find((r) => r.id === first.id),
    { ...first, is_current: false },
  );
  const history = structuredClone(s.inventoryMovements);
  await f.run("SALE_CORRECT", payload, "reduce-five");
  assert.deepEqual(await f.state(), s);
  const priceRow = currentRows(s, a)[0];
  await f.run("SALE_CORRECT", {
    id: a,
    reason: "Solo precio",
    items: [
      {
        original_item_id: priceRow.id,
        product_id: "prod-1",
        quantity: 5,
        unit_weight_kg: 25,
        unit_price: 75,
      },
    ],
  });
  s = await f.state();
  assert.deepEqual(s.inventoryMovements, history);
  assert.equal(currentRows(s, a)[0].coverage.quantity, 5);
  const row = currentRows(s, a)[0];
  await f.run("SALE_CORRECT", {
    id: a,
    reason: "Presentación distinta",
    items: [
      { original_item_id: row.id, product_id: "prod-1", quantity: 1, unit_weight_kg: 50, unit_price: 90 },
    ],
  });
  s = await f.state();
  assert.equal(currentRows(s, a)[0].coverage.quantity, 0);
  assert.equal(
    saleSummary(
      s,
      s.sales.find((sale) => sale.id === a),
    ).coverage_status,
    "PENDING_STOCK",
  );
  assert.equal(currentRows(s, b)[0].coverage.quantity, 4);
  assert.equal(stock(s, "prod-1").quantity, 4);
  const replacement = currentRows(s, a)[0];
  await f.adjust(1, "prod-2");
  await f.run("SALE_CORRECT", {
    id: a,
    reason: "Producto distinto",
    items: [
      {
        original_item_id: replacement.id,
        product_id: "prod-2",
        quantity: 1,
        unit_weight_kg: 25,
        unit_price: 10,
      },
    ],
  });
  s = await f.state();
  assert.equal(currentRows(s, a)[0].coverage.quantity, 1);
  assert.equal(stock(s, "prod-2").quantity, 0);
  assert.deepEqual(await createStore(() => f.database.binding, coverageOptions).loadState(), s);
});

persistenceTest(
  "R05-26/27: legacy sin adopción automática; adopción expresa y rechazo ambiguo",
  async (t) => {
    const f = await coverageFixture(t);
    const ordinary = createStore(() => f.database.binding);
    const command = {
      type: "SALE_SAVE",
      payload: salePayload(f.customer, {
        items: [{ product_id: "prod-1", quantity: 3, unit_weight_kg: 25 }],
      }),
      request_id: "legacy-queue",
    };
    const id = (await ordinary.runCommand(command, coverageIdentity)).result;
    const before = await f.state();
    await f.adjust(2);
    const unadopted = await f.state();
    assert.deepEqual(unadopted.sales, before.sales);
    assert.deepEqual(unadopted.saleItems, before.saleItems);
    const payload = { id, delivery_date: "2026-11-01", reason: "Historial sin cargos conciliado" };
    await f.run("SALE_COVERAGE_ADOPT", payload, "adopt-one");
    const s = await f.state();
    assert.equal(currentRows(s, id)[0].coverage.quantity, 2);
    assert.equal(s.sales.find((r) => r.id === id).coverage_adoption_reason, payload.reason);
    await f.run("SALE_COVERAGE_ADOPT", payload, "adopt-one");
    assert.deepEqual(await f.state(), s);
    await rejectsWithoutChange(f, () => f.run("SALE_COVERAGE_ADOPT", payload), /adopción previa/);
  },
);

persistenceTest("R05-17: cancelar reserva libera K y redistribuye sin entrega", async (t) => {
  const f = await coverageFixture(t);
  await f.adjust(8);
  const a = await f.sell(10);
  const b = await f.sell(4);
  const before = await f.state();
  await f.run("SALE_CANCEL", { id: a, reason: "Cancelar pedido no entregado" }, "cancel-a");
  const s = await f.state();
  assert.equal(
    saleSummary(
      s,
      s.sales.find((sale) => sale.id === a),
    ).coverage_status,
    undefined,
  );
  assert.equal(currentRows(s, a)[0].coverage.quantity, 0);
  assert.equal(currentRows(s, b)[0].coverage.quantity, 4);
  assert.equal(stock(s, "prod-1").quantity, 4);
  assert.deepEqual(
    s.inventoryMovements.slice(0, before.inventoryMovements.length),
    before.inventoryMovements,
  );
  await f.run("SALE_CANCEL", { id: a, reason: "Cancelar pedido no entregado" }, "cancel-a");
  assert.deepEqual(await f.state(), s);
});
