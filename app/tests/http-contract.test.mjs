import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../lib/application-store.mjs";
import { regressionFixture, adminIdentity } from "./helpers/regression-scenarios.mjs";
import { httpRouteHarness, commandRequest } from "./helpers/http-route-harness.mjs";

test("H01: GET y POST sin identidad devuelven 401 antes de acceder a D1", async () => {
  const store = createStore(() => {
    throw new Error("No debe acceder a D1");
  });
  const routes = httpRouteHarness(store, null);
  for (const response of [await routes.GET(), await routes.POST(commandRequest({}))]) {
    assert.equal(response.status, 401);
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.equal(routes.diagnostics.length, 0);
});

test("H02: GET autenticado entrega actor y estado persistente con Cache-Control no-store", async (t) => {
  const f = await regressionFixture(t);
  const before = await f.state();
  const response = await httpRouteHarness(f.store, adminIdentity).GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body.state, before);
  assert.equal(body.actor.id, adminIdentity.userId);
  assert.equal(body.actor.role, "ADMIN");
});

test("H03: identidad desconocida o desactivada recibe 403 sin exponer el estado", async (t) => {
  const f = await regressionFixture(t);
  await f.run("USER_SAVE", {
    id: "inactive-synthetic",
    name: "Inactivo sintético",
    role: "VIEWER",
    is_active: false,
  });
  const before = await f.state();
  for (const userId of ["unknown-synthetic", "inactive-synthetic"]) {
    const response = await httpRouteHarness(f.store, { userId, displayName: "Sintético" }).GET();
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.json();
    assert.equal(body.authenticated_id, userId);
    assert.equal(body.state, undefined);
  }
  assert.deepEqual(await f.state(), before);
});

test("H04: VIEWER consulta con 200 pero POST responde 422 y no modifica ninguna entidad", async (t) => {
  const f = await regressionFixture(t);
  const identity = { userId: "viewer-synthetic", displayName: "Lector sintético" };
  await f.run("USER_SAVE", { id: identity.userId, name: identity.displayName, role: "VIEWER" });
  const routes = httpRouteHarness(f.store, identity);
  assert.equal((await routes.GET()).status, 200);
  const before = await f.state();
  const response = await routes.POST(
    commandRequest({ type: "CUSTOMER_SAVE", payload: { name: "No crear" }, request_id: "viewer-write" }),
  );
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /consultar/);
  assert.deepEqual(await f.state(), before);
});

test("H05: POST real guarda comando y repite resultado sin duplicar revisión ni auditoría", async (t) => {
  const f = await regressionFixture(t);
  const routes = httpRouteHarness(f.store, adminIdentity);
  const input = {
    type: "CUSTOMER_SAVE",
    payload: { name: "Cliente HTTP sintético" },
    request_id: "http-retry",
  };
  const first = await routes.POST(commandRequest(input));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("Cache-Control"), "no-store");
  const committed = await first.json();
  const retry = await routes.POST(commandRequest(input));
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), committed);
  assert.deepEqual(await f.state(), committed.state);
});

test("H06: Origin ajeno y cuerpo sobre el límite retornan 403 y 413 antes de guardar", async (t) => {
  const f = await regressionFixture(t);
  const routes = httpRouteHarness(f.store, adminIdentity);
  const before = await f.state();
  const wrongOrigin = await routes.POST(commandRequest({}, { origin: "https://foreign.invalid" }));
  assert.equal(wrongOrigin.status, 403);
  const oversized = await routes.POST(commandRequest({}, { raw: "x".repeat(250001) }));
  assert.equal(oversized.status, 413);
  assert.deepEqual(await f.state(), before);
});

test("H07: comando desconocido, request_id inválido y payload array son 422 sin efectos", async (t) => {
  const f = await regressionFixture(t);
  const routes = httpRouteHarness(f.store, adminIdentity);
  const before = await f.state();
  for (const input of [
    { type: "UNKNOWN", request_id: "unknown-command" },
    { type: "CUSTOMER_SAVE", payload: { name: "No crear" } },
    { type: "CUSTOMER_SAVE", payload: [], request_id: "array-command" },
    { type: "CUSTOMER_SAVE", payload: {}, request_id: "x".repeat(101) },
  ]) {
    const response = await routes.POST(commandRequest(input));
    assert.equal(response.status, 422);
    assert.equal(typeof (await response.json()).error, "string");
    assert.deepEqual(await f.state(), before);
  }
});

test("H08: JSON malformado conserva el contrato actual 503 y no filtra detalles técnicos", async (t) => {
  const f = await regressionFixture(t);
  const before = await f.state();
  const routes = httpRouteHarness(f.store, adminIdentity);
  const response = await routes.POST(commandRequest({}, { raw: "{malformed" }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /No se guardó/);
  assert.equal(routes.diagnostics.length, 1);
  assert.deepEqual(await f.state(), before);
});

test("H09: indisponibilidad de D1 devuelve 503 genérico tanto en lectura como escritura", async () => {
  const store = createStore(() => {
    throw new Error("synthetic-storage-unavailable");
  });
  const routes = httpRouteHarness(store, adminIdentity);
  const responses = [
    await routes.GET(),
    await routes.POST(commandRequest({ type: "CUSTOMER_SAVE", request_id: "offline" })),
  ];
  for (const response of responses) {
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.doesNotMatch(body.error, /synthetic-storage-unavailable/);
    assert.equal(body.state, undefined);
  }
  assert.equal(routes.diagnostics.length, 2);
});

test("H10: clientes de mismo origen sin cabecera Origin siguen admitidos por el contrato actual", async (t) => {
  const f = await regressionFixture(t);
  const response = await httpRouteHarness(f.store, adminIdentity).POST(
    commandRequest(
      {
        type: "CUSTOMER_SAVE",
        payload: { name: "Cliente sin Origin sintético" },
        request_id: "no-origin",
      },
      { origin: null },
    ),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state.customers.length, 2);
});
