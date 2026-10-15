import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPortal } from "../integration/portal.mjs";
import { validateBasePath } from "../integration/paths.mjs";
import { packageModule } from "../scripts/package-module.mjs";

test("integración: rechaza destinos existentes, relativos o dentro del repositorio sin sobrescribir", () => {
  const root = mkdtempSync(join(tmpdir(), "nutrequine-12-package-"));
  writeFileSync(join(root, "sentinel"), "KEEP");
  assert.throws(() => packageModule(root), /ya existe/);
  assert.equal(readFileSync(join(root, "sentinel"), "utf8"), "KEEP");
  assert.throws(() => packageModule("relative"), /absoluto/);
  assert.throws(
    () => packageModule(join(process.cwd(), "package-must-not-be-created-12")),
    /fuera del repositorio/,
  );
});

test("integración: prefijos y destino de proxy son locales y explícitos", () => {
  for (const value of ["/", "/modulos/nutrequine/"]) assert.equal(validateBasePath(value), value);
  for (const value of ["https://outside.invalid/", "//other/", "/../", "/modulos", "/%2e/", "/a?b/", ""])
    assert.throws(() => validateBasePath(value));
  for (const value of [
    "https://127.0.0.1:4000/",
    "http://localhost:4000/",
    "http://192.0.2.1:4000/",
    "http://user:pass@127.0.0.1:4000/",
    "http://127.0.0.1:4000/path/",
  ])
    assert.throws(() => createPortal({ moduleUrl: value }));
});

test("portal local: valida perímetro antes de adaptar Host/Origin, limita cuerpo y conserva errores sin reintento", async (t) => {
  const seen = [];
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    req.resume();
    res.writeHead(422, {
      "Content-Type": "application/json",
      "Set-Cookie":
        req.url === "/malformed"
          ? "erp_session=NEVER_FORWARD"
          : "nutrequine_0123456789abcdef=synthetic; Path=/api; HttpOnly; SameSite=Strict; Max-Age=28800",
      "Content-Length": String(Buffer.byteLength(JSON.stringify({ error: "SYNTHETIC_BUSINESS_ERROR" }))),
    });
    res.end(JSON.stringify({ error: "SYNTHETIC_BUSINESS_ERROR" }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const moduleUrl = `http://127.0.0.1:${upstream.address().port}/`;
  const portal = createPortal({ moduleUrl, mode: "B" });
  await new Promise((resolve) => portal.listen(0, "127.0.0.1", resolve));
  t.after(() =>
    Promise.all([
      new Promise((resolve) => portal.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]),
  );
  const origin = `http://127.0.0.1:${portal.address().port}`;
  async function call(path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const req = request(origin, { path, method: body === null ? "GET" : "POST", headers }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }),
        );
      });
      req.on("error", reject);
      req.end(body);
    });
  }
  assert.equal((await call("/", { Host: "outside.invalid" })).status, 403);
  assert.equal(
    (await call("/modulos/nutrequine/api/state", { Origin: "http://outside.invalid" })).status,
    403,
  );
  assert.equal((await call("/modulos/nutrequine/api/state", { "X-User-Id": "ADMIN" })).status, 400);
  assert.equal(
    (await call("/modulos/nutrequine/api/state", { "X-Forwarded-Host": "outside.invalid" })).status,
    400,
  );
  assert.equal((await call("/modulos/nutrequine/%2e%2e/server")).status, 400);
  assert.equal((await call("/api/state")).status, 404);
  assert.equal(
    (await call("/modulos/nutrequine/api/command", { "Content-Type": "application/json" }, "{}")).status,
    403,
  );
  assert.equal(
    (await call("/modulos/nutrequine/api/command", { Origin: origin, "Content-Type": "text/plain" }, "{}"))
      .status,
    415,
  );
  assert.equal(
    (
      await call(
        "/modulos/nutrequine/api/command",
        { Origin: origin, "Content-Type": "application/json" },
        "x".repeat(250001),
      )
    ).status,
    413,
  );
  assert.equal(seen.length, 0);
  const answer = await call(
    "/modulos/nutrequine/api/command",
    {
      Origin: origin,
      "Content-Type": "application/json",
      "X-CSRF-Token": "opaque-csrf",
      Cookie: "erp_session=NEVER_FORWARD; nutrequine_0123456789abcdef=synthetic",
    },
    "{}",
  );
  assert.equal(answer.status, 422);
  assert.equal(JSON.parse(answer.body).error, "SYNTHETIC_BUSINESS_ERROR");
  assert.match(answer.headers["set-cookie"][0], /Path=\/modulos\/nutrequine\/api;/);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "/api/command");
  assert.equal(seen[0].headers.host, new URL(moduleUrl).host);
  assert.equal(seen[0].headers.origin, new URL(moduleUrl).origin);
  assert.equal(seen[0].headers["x-csrf-token"], "opaque-csrf");
  assert.doesNotMatch(seen[0].headers.cookie, /erp_session/);
  const malformed = await call("/modulos/nutrequine/malformed");
  assert.equal(malformed.status, 502);
  assert.equal(malformed.headers["set-cookie"], undefined);
  assert.equal(JSON.parse(malformed.body).error, "Respuesta del módulo inválida.");
});
