import { test } from "node:test";
import assert from "node:assert/strict";
import { persistenceTest } from "./helpers/persistence-fixtures.mjs";
import { regressionFixture, salePayload, rejectsWithoutChange } from "./helpers/regression-scenarios.mjs";
import { diskFixture } from "./helpers/persistence-fixtures.mjs";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { executeCommand } from "../lib/domain.mjs";
import { initialSaleDates, changeSaleDateFields } from "../features/ventas/hooks/sale-dates.mjs";
import {
  compareDeliveryPriority,
  pendingCoveragePriority,
  deliveryDay,
} from "../features/ventas/domain/delivery-date.mjs";

test("F06-01/02/03/04: sincronizar hasta edición manual incluso con día idéntico", () => {
  let values = initialSaleDates(undefined, "2026-10-28");
  values = changeSaleDateFields(values, "sale_date", "2026-10-30");
  assert.equal(values.delivery_date, "2026-10-30");
  values = changeSaleDateFields(values, "delivery_date", "2026-10-30");
  values = initialSaleDates(values, "2026-11-05");
  values = changeSaleDateFields(values, "sale_date", "2026-11-02");
  assert.equal(values.delivery_date, "2026-10-30");
  assert.equal(values.delivery_date_manual_override, true);
  values = changeSaleDateFields(values, "delivery_date", "2026-11-04");
  values = changeSaleDateFields(values, "sale_date", "2026-11-03");
  assert.equal(values.delivery_date, "2026-11-04");
  assert.equal(deliveryDay("2028-02-29"), "2028-02-29");
});

test("F06-10/11/15: prioridad por día, instante UTC e ID; legacy fuera de cola", () => {
  const base = {
    delivery_date: "2026-10-30",
    created_at: "2026-10-28T10:00:00Z",
    coverage_version: 1,
    commercial_status: "CONFIRMED",
    fulfillment_status: "PENDING",
  };
  const a = { ...base, id: "a", created_at: "2026-10-28T05:00:00-05:00" };
  const b = { ...base, id: "b" };
  const early = { ...base, id: "c", created_at: "2026-10-28T09:00:00Z" };
  const firstDay = { ...base, id: "d", delivery_date: "2026-10-29" };
  const legacy = { ...base, id: "legacy", coverage_version: undefined };
  const noDate = { ...base, id: "no-date", delivery_date: undefined };
  const sales = [b, legacy, a, firstDay, early, noDate];
  const state = {
    sales,
    saleItems: sales.map((s) => ({
      sale_id: s.id,
      quantity: 2,
      coverage: { quantity: 1 },
      is_current: true,
    })),
  };
  const before = structuredClone(state);
  assert.deepEqual(
    pendingCoveragePriority(state).map((s) => s.id),
    ["d", "c", "a", "b"],
  );
  assert.deepEqual(state, before);
  assert.equal(compareDeliveryPriority(a, b), -1);
  state.sales.reverse();
  state.sales[0].financial_status = "PAID";
  assert.deepEqual(
    pendingCoveragePriority(state).map((s) => s.id),
    ["d", "c", "a", "b"],
  );
});

test("F06-05/06/15: cerrar conexiones, reabrir disco y conservar legacy intacto", async (t) => {
  const db = diskFixture(t);
  const identity = { userId: "date-admin", displayName: "Admin sintético" };
  let store = createStore(() => db.binding);
  await store.ensureState(identity);
  const run = (type, payload, request_id) => store.runCommand({ type, payload, request_id }, identity);
  const customer = (await run("CUSTOMER_SAVE", { name: "Cliente sintético fecha" }, "customer")).result;
  const draft = (
    await run(
      "SALE_SAVE",
      salePayload(customer, {
        confirm: false,
        delivery_date: "2026-10-14",
        delivery_date_manual_override: true,
      }),
      "draft",
    )
  ).result;
  const legacy = (await run("SALE_SAVE", salePayload(customer), "legacy")).result;
  const initial = await store.loadState();
  const historical = initial.sales.find((x) => x.id === legacy);
  delete historical.delivery_date;
  delete historical.delivery_date_manual_override;
  db.database.prepare("UPDATE sales SET data = ? WHERE id = ?").run(JSON.stringify(historical), legacy);
  const rawLegacy = db.database.prepare("SELECT data FROM sales WHERE id = ?").get(legacy).data;
  db.close();
  const reopened = openSqliteDatabase(db.filename);
  try {
    store = createStore(() => reopened);
    assert.equal(
      (await store.loadState()).sales.find((x) => x.id === draft).delivery_date_manual_override,
      true,
    );
    await run("SALE_SAVE", salePayload(customer, { id: draft, sale_date: "2026-11-02" }), "confirm");
    await run("CUSTOMER_SAVE", { name: "Otro cliente sintético" }, "other");
    assert.equal((await store.loadState()).sales.find((x) => x.id === draft).delivery_date, "2026-10-14");
    const raw = await reopened.batch([reopened.prepare("SELECT data FROM sales WHERE id = ?").bind(legacy)]);
    assert.equal(raw[0].results[0].data, rawLegacy);
  } finally {
    reopened.close();
  }
});

persistenceTest("F06-17: fallo entre fecha y auditoría revierte estado completo", async (t) => {
  const f = await regressionFixture(t);
  const id = await f.run("SALE_SAVE", salePayload(f.customer));
  const before = await f.state();
  const binding = {
    ...f.database.binding,
    batch(statements) {
      const index = statements.findIndex((x) => x.sql.startsWith("INSERT INTO audit"));
      if (index < 0) return f.database.binding.batch(statements);
      return f.database.binding.batch([
        ...statements.slice(0, index),
        f.database.binding
          .prepare("INSERT INTO customer_sites(id,data,customer_id,site_id) VALUES (?,?,?,?)")
          .bind("date-fault", "{}", f.customer, "missing-site"),
        ...statements.slice(index),
      ]);
    },
  };
  const command = {
    type: "SALE_DELIVERY_DATE_UPDATE",
    request_id: "date-fail",
    payload: { id, delivery_date: "2026-11-04", reason: "Prueba rollback" },
  };
  const identity = { userId: "regression-admin", displayName: "Administrador sintético" };
  await assert.rejects(createStore(() => binding).runCommand(command, identity), /FOREIGN KEY/);
  assert.deepEqual(await f.state(), before);
  await f.store.runCommand(command, identity);
  assert.equal((await f.state()).audit.filter((x) => x.request_id === "date-fail").length, 1);
});

test("F06-07/12/17: dos conexiones no sobrescriben una reprogramación con revisión obsoleta", async (t) => {
  const db = diskFixture(t);
  const second = openSqliteDatabase(db.filename);
  try {
    const a = createStore(() => db.binding);
    const b = createStore(() => second);
    const identity = { userId: "date-a", displayName: "Admin fecha A" };
    await a.ensureState(identity);
    const run = (type, payload, request_id) => a.runCommand({ type, payload, request_id }, identity);
    await run("USER_SAVE", { id: "date-b", name: "Admin fecha B", role: "ADMIN" }, "user-b");
    const customer = (await run("CUSTOMER_SAVE", { name: "Cliente sintético concurrencia" }, "customer"))
      .result;
    const id = (await run("SALE_SAVE", salePayload(customer), "sale")).result;
    const before = await a.loadState();
    const stale = await b.loadState();
    const payload = { id, delivery_date: "2026-11-04", reason: "Actor A" };
    await run("SALE_DELIVERY_DATE_UPDATE", payload, "date-a");
    const committed = await a.loadState();
    const command = {
      type: "SALE_DELIVERY_DATE_UPDATE",
      payload: {
        ...payload,
        delivery_date: "2026-11-05",
        reason: "Actor B",
      },
      request_id: "date-b",
    };
    const outcome = executeCommand(
      stale,
      command,
      stale.users.find((x) => x.id === "date-b"),
    );
    await assert.rejects(b.persistState(stale, outcome.state), /Otra operación/);
    assert.deepEqual(await a.loadState(), committed);
    await b.runCommand(command, { userId: "date-b", displayName: "Admin fecha B" });
    const after = await a.loadState();
    assert.equal(after.sales[0].delivery_date, "2026-11-05");
    assert.equal(after.revision, before.revision + 2);
    assert.deepEqual(after.saleItems, before.saleItems);
    assert.deepEqual(after.inventoryMovements, before.inventoryMovements);
    assert.deepEqual(after.payments, before.payments);
  } finally {
    second.close();
  }
});

persistenceTest("F06-07/08: fecha solo por operación específica y solo en pedidos pendientes", async (t) => {
  const f = await regressionFixture(t);
  const id = await f.run("SALE_SAVE", salePayload(f.customer));
  const payload = { id, delivery_date: "2026-11-04", reason: "Prueba de estado" };
  await rejectsWithoutChange(
    f,
    () =>
      f.run("SALE_CORRECT", {
        ...salePayload(f.customer),
        ...payload,
      }),
    /operación específica/,
  );
  await rejectsWithoutChange(
    f,
    () =>
      f.run("SALE_DELIVERY_DATE_UPDATE", {
        ...payload,
        reason: "",
      }),
    /Motivo/,
  );
  const before = await f.state();
  const after = structuredClone(before);
  after.sales.find((s) => s.id === id).fulfillment_status = "DELIVERED";
  await f.store.persistState(before, after);
  await rejectsWithoutChange(f, () => f.run("SALE_DELIVERY_DATE_UPDATE", payload), /pendientes/);
});

persistenceTest("F06-01/03/04/05/06: entrega y origen sobreviven guardar y reabrir", async (t) => {
  const f = await regressionFixture(t);
  const id = await f.run("SALE_SAVE", salePayload(f.customer, { confirm: false }));
  let sale = (await f.state()).sales.find((x) => x.id === id);
  assert.equal(sale.delivery_date, sale.sale_date);
  assert.equal(sale.delivery_date_manual_override, false);
  await f.run("SALE_SAVE", salePayload(f.customer, { id, confirm: false, sale_date: "2026-10-30" }));
  sale = (await f.state()).sales.find((x) => x.id === id);
  assert.equal(sale.delivery_date, "2026-10-30");
  await f.run(
    "SALE_SAVE",
    salePayload(f.customer, {
      id,
      confirm: false,
      sale_date: "2026-10-30",
      delivery_date: "2026-10-30",
      delivery_date_manual_override: true,
    }),
  );
  await f.run("SALE_SAVE", salePayload(f.customer, { id, sale_date: "2026-11-02" }));
  sale = (await f.state()).sales.find((x) => x.id === id);
  assert.equal(sale.delivery_date, "2026-10-30");
  assert.equal(sale.delivery_date_manual_override, true);
  assert.equal(sale.commercial_status, "CONFIRMED");
});

persistenceTest("F06-07/09/11/12: reprogramar conserva todo salvo fecha e historial explícito", async (t) => {
  const f = await regressionFixture(t);
  const id = await f.run("SALE_SAVE", salePayload(f.customer));
  const before = await f.state();
  await f.run("SALE_DELIVERY_DATE_UPDATE", { id, delivery_date: "2026-10-01", reason: "Regularización" });
  const after = await f.state();
  const sale = after.sales.find((x) => x.id === id);
  assert.equal(sale.delivery_date, "2026-10-01");
  assert.equal(sale.delivery_date_manual_override, true);
  assert.equal(after.audit.at(-1).action, "SALE_DELIVERY_DATE_UPDATE");
  assert.equal(after.corrections.at(-1).old_snapshot.delivery_date, before.sales[0].delivery_date);
  assert.equal(after.corrections.at(-1).new_snapshot.delivery_date, "2026-10-01");
  for (const key of Object.keys(before)) {
    if (["sales", "audit", "revision", "corrections", "correctionFields"].includes(key)) continue;
    assert.deepEqual(after[key], before[key], key);
  }
  const expected = {
    ...before.sales[0],
    delivery_date: sale.delivery_date,
    delivery_date_manual_override: true,
    updated_at: sale.updated_at,
  };
  assert.deepEqual(sale, expected);
  assert.equal(after.revision, before.revision + 1);
});

persistenceTest(
  "F06-08: fechas imposibles y contratos ambiguos rechazan sin cobros ni escrituras",
  async (t) => {
    const f = await regressionFixture(t);
    for (const value of [
      "2026-02-29",
      "2026-04-31",
      "28/10/2026",
      "2026-10-28T00:00:00Z",
      "",
      null,
      {},
      123,
    ]) {
      await rejectsWithoutChange(
        f,
        () =>
          f.run(
            "SALE_SAVE",
            salePayload(f.customer, {
              delivery_date: value,
              payment_condition: "CASH",
              payment_method: "TRANSFER",
              paid_amount: 10,
            }),
          ),
        /Fecha/,
      );
    }
    await rejectsWithoutChange(
      f,
      () =>
        f.run(
          "SALE_SAVE",
          salePayload(f.customer, {
            delivery_date: "2026-11-01",
            delivery_date_manual_override: false,
          }),
        ),
      /entrega/,
    );
  },
);
