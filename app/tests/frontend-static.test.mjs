import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { serveFrontend } from "../server/frontend.mts";

test("frontend estático: solo build público enumerado, sin configuración, SQLite ni fuentes de servidor", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "nutrequine-08-public-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<!doctype html><h1>Public synthetic</h1>");
  writeFileSync(join(root, "assets/app.js"), "console.log('synthetic')");
  for (const file of ["server.json", "database.sqlite", "passwords.mts", "app.js.map", ".env"])
    writeFileSync(join(root, file), "PRIVATE_SYNTHETIC_SENTINEL");
  const app = Fastify();
  t.after(() => app.close());
  serveFrontend(app, root);
  assert.equal((await app.inject("/")).statusCode, 200);
  assert.match((await app.inject("/")).headers["content-security-policy"], /script-src 'self'/);
  assert.equal((await app.inject("/assets/app.js")).statusCode, 200);
  await app.listen({ host: "127.0.0.1", port: 0 });
  for (const path of [
    "/server.json",
    "/database.sqlite",
    "/passwords.mts",
    "/app.js.map",
    "/.env",
    "/../index.html",
    "/%2e%2e/index.html",
    "/assets%2fapp.js",
    "//index.html",
    "/INDEX.HTML",
    "/api/state",
    "/signout-with-chatgpt",
  ]) {
    const response = await new Promise((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: app.server.address().port, path }, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ statusCode: res.statusCode, body }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(response.statusCode, 404, path);
    assert.doesNotMatch(response.body, /PRIVATE_SYNTHETIC_SENTINEL/);
  }
});
