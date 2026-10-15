import { test } from "node:test";
import assert from "node:assert/strict";
import { seedState } from "../lib/domain.mjs";
import { fetchAdminState, submitAdminCommand } from "../client/admin/admin-api.ts";
import { recoverSession, ApiError } from "../client/session-api.ts";
import { saleFormPreview } from "../features/ventas/hooks/sale-form-preview.ts";
import { productionFormPreview } from "../features/produccion/hooks/production-form-preview.ts";

test("el cliente HTTP conserva rutas, no-cache, payload e ID de reintento", async (t) => {
  const state = seedState();
  const actor = { id: "admin-sintetico", role: "ADMIN" };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json(url === "/api/state" ? { state, actor } : { state, result: "venta-sintetica" });
  });
  assert.deepEqual(await fetchAdminState(), { state, actor });
  assert.equal(calls[0].url, "/api/state");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.credentials, "same-origin");
  const payload = { id: "venta-sintetica" };
  assert.deepEqual(await submitAdminCommand("SALE_DELIVER", payload, "reintento-sintetico"), {
    state,
    result: "venta-sintetica",
  });
  assert.equal(calls[1].url, "/api/command");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers.get("Content-Type"), "application/json");
  assert.equal(calls[1].options.credentials, "same-origin");
  assert.equal(
    calls[1].options.body,
    JSON.stringify({ type: "SALE_DELIVER", payload, request_id: "reintento-sintetico" }),
  );
});

test("el cliente HTTP conserva los errores locales sin exponer una identidad de plataforma", async (t) => {
  const session = { actor: { id: "admin-sintetico", role: "ADMIN" }, csrf_token: "a".repeat(64) };
  const responses = [
    Response.json(session),
    Response.json({ error: "Sin acceso", authenticated_id: "usuario-sintetico" }, { status: 403 }),
    Response.json(session),
    Response.json({ authenticated_id: "no-exponer" }, { status: 503 }),
    Response.json({ error: "Stock físico insuficiente." }, { status: 422 }),
    new Response("JSON inválido", { status: 503 }),
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift());
  await recoverSession();
  await assert.rejects(fetchAdminState, (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, "Sin acceso");
    assert.equal(error.status, 403);
    assert.equal(error.authenticatedId, undefined);
    return true;
  });
  await assert.rejects(fetchAdminState, (error) => {
    assert.equal(error.status, 503);
    assert.match(error.message, /servicio no está disponible/);
    assert.equal(error.authenticatedId, undefined);
    return true;
  });
  await assert.rejects(submitAdminCommand("SALE_DELIVER", {}, "retry"), /Stock físico insuficiente/);
  await assert.rejects(fetchAdminState, (error) => error instanceof ApiError && error.status === 503);
});

test("previsualización de venta agrupa sacos y gramos y restaura solo la entrega rectificada", () => {
  const state = seedState();
  const original = structuredClone(state);
  const rows = [
    { product_id: "prod-1", quantity: 1, unit_weight_kg: "17.001", unit_price: "0.01" },
    { product_id: "prod-1", quantity: 2, unit_weight_kg: "17.001", unit_price: "0.02" },
  ];
  const old = [{ product_id: "prod-1", quantity: 3, total_weight_kg: 51003 }];
  const preview = saleFormPreview(state, rows, old, false);
  assert.equal(preview.total, 5);
  assert.deepEqual(preview.missing, [["prod-1", { q: 3, w: 51003 }]]);
  assert.deepEqual(saleFormPreview(state, rows, old, true).missing, []);
  const heavier = rows.map((row) => ({ ...row, unit_weight_kg: "17.002" }));
  assert.equal(saleFormPreview(state, heavier, old, true).missing.length, 1);
  assert.deepEqual(state, original);
});

test("previsualización de producción distingue fórmula, peso comercial y cobro parcial sin mutar", () => {
  const state = seedState();
  const original = structuredClone(state);
  const values = { nucleus_cost: "0.01", packaging_cost: "0.02" };
  const counts = { "prod-1": "1" };
  const preview = productionFormPreview(state, counts, {}, [], values);
  assert.equal(preview.nuclei, 1);
  assert.equal(preview.bags, 40);
  assert.equal(preview.weight, 1000000);
  assert.equal(
    preview.ingredients.reduce((total, row) => total + row.w, 0),
    988000,
  );
  const first = preview.ingredients[0];
  const adjustments = {
    [first.ing.id]: { ingredient_id: first.ing.id, discount_amount: "0.01", actual_charge: "0.02" },
  };
  const revised = productionFormPreview(state, counts, adjustments, [], values);
  assert.equal(revised.estimated, preview.estimated - 1);
  assert.equal(revised.real, preview.real - first.net + 2);
  assert.deepEqual(state, original);
});
