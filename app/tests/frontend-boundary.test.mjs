import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function apiHarness(basePath = "/") {
  const calls = [];
  const replies = [];
  const source = readFileSync(new URL("../client/session-api.ts", import.meta.url), "utf8");
  const compiledModule = { exports: {} };
  const context = vm.createContext({
    exports: compiledModule.exports,
    module: compiledModule,
    Headers,
    Response,
    document: { querySelector: () => ({ content: basePath }) },
    require: (name) => {
      assert.equal(name, "./paths.ts");
      const pathsModule = { exports: {} };
      vm.runInContext(
        ts.transpileModule(readFileSync(new URL("../client/paths.ts", import.meta.url), "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS },
        }).outputText,
        vm.createContext({
          exports: pathsModule.exports,
          document: { querySelector: () => ({ content: basePath }) },
        }),
      );
      return pathsModule.exports;
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const response = replies.shift();
      if (response instanceof Error) throw response;
      if (!response) throw new Error("Unexpected fetch");
      return response;
    },
  });
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return { api: compiledModule.exports, calls, replies };
}
const session = {
  actor: { id: "synthetic", role: "ADMIN" },
  csrf_token: "a".repeat(64),
  expires_at: "2026-10-15T23:00:00Z",
};
test("cliente local: cookies del navegador, CSRF en memoria y request_id original sin reintentos automáticos", async () => {
  const { api, calls, replies } = apiHarness();
  replies.push(Response.json(session));
  await api.login("synthetic", "synthetic-passphrase");
  const body = JSON.stringify({
    type: "CUSTOMER_SAVE",
    payload: { name: "Sintético" },
    request_id: "keep-this-id",
  });
  replies.push(Response.json({ error: "Ocupada" }, { status: 503 }));
  await assert.rejects(
    api.adminFetch("/api/command", { method: "POST", body }),
    (error) => error.status === 503,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.body, body);
  assert.equal(calls[1].options.headers.get("X-CSRF-Token"), session.csrf_token);
  assert.equal(calls[1].options.credentials, "same-origin");
  replies.push(Response.json({ result: "customer" }));
  await api.adminFetch("/api/command", { method: "POST", body });
  assert.equal(calls[2].options.body, body);
});

test("cliente local: prefijo de build conserva sesión, CSRF y el contrato comercial", async () => {
  const { api, calls, replies } = apiHarness("/modulos/nutrequine/");
  replies.push(Response.json(session), Response.json({ result: "customer" }));
  await api.login("synthetic", "synthetic-passphrase");
  const body = JSON.stringify({ type: "CUSTOMER_SAVE", payload: {}, request_id: "same-id" });
  await api.adminFetch("/api/command", { method: "POST", body });
  assert.deepEqual(
    calls.map((call) => call.url),
    ["/modulos/nutrequine/api/auth/login", "/modulos/nutrequine/api/command"],
  );
  assert.equal(calls[1].options.body, body);
  assert.equal(calls[1].options.headers.get("X-CSRF-Token"), session.csrf_token);
});
test("cliente local: distingue permisos, sesión expirada, errores de disponibilidad y logout", async () => {
  const { api, calls, replies } = apiHarness();
  const notifications = [];
  api.onSessionRequired((message, discard) => notifications.push({ message, discard }));
  replies.push(Response.json(session));
  await api.recoverSession();
  replies.push(Response.json({ error: "Permiso" }, { status: 403 }), Response.json(session));
  await assert.rejects(
    api.adminFetch("/api/command", { method: "POST", body: "{}" }),
    (error) => error.status === 403,
  );
  assert.equal(notifications.length, 0);
  replies.push(
    Response.json({ error: "Token CSRF inválido." }, { status: 403 }),
    Response.json({ ...session, csrf_token: "b".repeat(64) }),
  );
  await assert.rejects(
    api.adminFetch("/api/command", { method: "POST", body: "{}" }),
    (error) => error.status === 403,
  );
  assert.match(notifications[0].message, /sesión cambió/);
  replies.push(Response.json(session));
  await api.recoverSession();
  replies.push(Response.json({ error: "Expired" }, { status: 401 }));
  await assert.rejects(api.adminFetch("/api/state"), (error) => error.status === 401);
  assert.equal(notifications[0].discard, false);
  for (const status of [400, 413, 415, 422, 429, 503]) {
    replies.push(Response.json({}, { status }));
    await assert.rejects(
      api.adminFetch("/api/command", { method: "POST", body: "{}" }),
      (error) => error.status === status && error.message.length > 0,
    );
  }
  replies.push(new Error("offline"));
  await assert.rejects(api.adminFetch("/api/state"), (error) => error.status === 503);
  replies.push(Response.json({ ok: true }));
  await api.logout();
  assert.equal(notifications.at(-1).discard, true);
  assert.ok(calls.every((call) => call.options.credentials === "same-origin"));
});
