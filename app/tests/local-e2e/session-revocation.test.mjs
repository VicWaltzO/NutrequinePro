import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { reachLoginAfterRevocation } from "../helpers/session-expiry-ui.mjs";

test(
  "NQP38: revocación real con detección proactiva y refresco, reauth y logout",
  { timeout: 120000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    console.log("Revocación sintética: " + server.evidence);
    for (const mode of ["proactive", "refresh"]) {
      const context = await browser.newContext();
      try {
        const auth = await context.request.post(server.baseURL + "/api/auth/login", {
          headers: { Origin: server.baseURL },
          data: { login: "admin.local", password: server.password },
        });
        assert.equal(auth.status(), 200);
        const csrf = (await auth.json()).csrf_token;
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(server.baseURL);
        const micro = page.getByRole("region", { name: "Alertas globales de microinsumos", exact: true });
        await expect(micro).toContainText("Microinsumos: evaluación incompleta");
        let release;
        let started;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const arrived = new Promise((resolve) => {
          started = resolve;
        });
        // Freeze the global GET to select either ordering deterministically.
        await page.route("**/api/micro-preparations", async (route) => {
          started();
          await gate;
          await route.continue().catch(() => {});
        });
        try {
          if (mode === "proactive") {
            await page.evaluate(() => window.dispatchEvent(new Event("focus")));
            await arrived;
          }
          const revoked = await context.request.post(server.baseURL + "/api/auth/revoke", {
            headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
            data: { user_id: server.admin.userId },
          });
          assert.equal(revoked.status(), 200);
          assert.equal((await context.request.get(server.baseURL + "/api/state")).status(), 401);
          if (mode === "proactive") {
            release();
            await expect(page.getByRole("dialog", { name: "Autenticación local" })).toBeVisible();
          }
          assert.equal(await reachLoginAfterRevocation(page), mode);
        } finally {
          release();
          await page.unroute("**/api/micro-preparations");
        }
        await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
        await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Autenticación local" })).toHaveCount(0);
        await expect(micro).toContainText("Microinsumos: evaluación incompleta");
        assert.equal((await context.request.get(server.baseURL + "/api/state")).status(), 200);
        await page.getByRole("button", { name: "Salir", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Autenticación local" })).toBeVisible();
        assert.equal((await context.request.get(server.baseURL + "/api/state")).status(), 401);
        assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage)), []);
        assert.ok(await page.evaluate(() => Object.keys(localStorage).every((key) => /theme/i.test(key))));
        assert.deepEqual(errors, []);
        console.log("PASS revocación " + mode + ": 401, login, GET restaurado, logout y almacenamiento");
      } finally {
        await context.close();
      }
    }
  },
);
