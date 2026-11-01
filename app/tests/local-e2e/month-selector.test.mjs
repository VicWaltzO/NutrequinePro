import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

test(
  "balance: selector nativo visual, mes/año por teclado y PDF sin escrituras",
  { timeout: 180000 },
  async (t) => {
    const server = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
    t.after(server.stop);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    for (const mobile of [false, true]) {
      const size = mobile ? "mobile" : "desktop";
      const context = await browser.newContext({
        locale: "es-PE",
        timezoneId: "Pacific/Kiritimati",
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        // UTC is already November; Lima is still October, even in a different browser timezone.
        await page.clock.setFixedTime(new Date("2026-11-01T02:00:00Z"));
        await page.goto(server.baseURL);
        await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
        await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        await page.locator(".sidebar-footer").waitFor({ state: "attached" });
        await page.evaluate(() => (location.hash = "balance"));
        const panel = page.getByLabel("Exportación del balance mensual", { exact: true });
        const month = page.getByLabel("Mes del PDF", { exact: true });
        const button = page.getByRole("button", { name: "Exportar balance mensual PDF", exact: true });
        await expect(month).toHaveValue("2026-10");
        await expect(month).toHaveAttribute("type", "month");
        await expect(month).toHaveAttribute("min", "1900-01");
        const state = async () =>
          (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
        const before = await state();
        const writes = [];
        page.on("request", (request) => {
          if (!["GET", "HEAD"].includes(request.method()))
            writes.push(request.method() + " " + request.url());
        });
        const openPicker = async (name) => {
          await month.scrollIntoViewIfNeeded();
          const box = await month.boundingBox();
          assert.ok(box);
          if (mobile) await page.touchscreen.tap(box.x + box.width - 16, box.y + box.height / 2);
          else await page.mouse.click(box.x + box.width - 16, box.y + box.height / 2);
          await page.screenshot({ path: join(server.evidence, `${size}-${name}.png`) });
        };
        // Chromium's native popup is outside the document DOM. Open it with click/touch,
        // then operate its visible month grid with navigation keys, never fill/type YYYY-MM.
        await openPicker("picker-2026");
        await page.keyboard.press("PageUp");
        await page.keyboard.press("Enter");
        await expect(month).toHaveValue("2025-10");
        await openPicker("picker-2025");
        await page.keyboard.press("PageDown");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("Enter");
        await expect(month).toHaveValue("2026-09");
        await openPicker("picker-september");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await expect(month).toHaveValue("2026-10");
        await expect(panel).toContainText("2026-10-01 al 2026-10-31");
        await expect(page.getByLabel("Desde", { exact: true })).toHaveValue("");
        await expect(page.getByLabel("Hasta", { exact: true })).toHaveValue("");
        await expect(month).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(button).toBeFocused();
        const download = page.waitForEvent("download");
        await page.keyboard.press("Enter");
        const file = await download;
        assert.equal(file.suggestedFilename(), "NUTREQUINE_Balance_2026-10.pdf");
        assert.equal(await file.failure(), null);
        await file.saveAs(join(server.evidence, `${size}-${file.suggestedFilename()}`));
        await expect(panel.getByRole("status")).toHaveText("PDF descargado.");
        await expect(button).toBeFocused();
        await page.route("**/api/documents/balance/*.pdf", (route) =>
          route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "No se pudo generar el PDF. Vuelva a intentar." }),
          }),
        );
        await button.click();
        await expect(panel.getByRole("alert")).toContainText("Vuelva a intentar");
        await expect(button).toBeFocused();
        await expect(month).toHaveValue("2026-10");
        await page.unroute("**/api/documents/balance/*.pdf");
        const retry = page.waitForEvent("download");
        await button.click();
        await retry;
        await expect(panel.getByRole("status")).toHaveText("PDF descargado.");
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        await page.route("**/api/documents/balance/*.pdf", async (route) => {
          await gate;
          await route.continue();
        });
        const delayed = page.waitForEvent("download");
        await button.click();
        await expect(panel.getByRole("button", { name: "Generando PDF…", exact: true })).toBeDisabled();
        await month.focus();
        release();
        await delayed;
        await expect(panel.getByRole("status")).toHaveText("PDF descargado.");
        await expect(month).toBeFocused();
        await page.unroute("**/api/documents/balance/*.pdf");
        for (const theme of ["light", "dark"]) {
          if ((await page.locator("html").getAttribute("data-theme")) !== theme)
            await page
              .getByRole("button", {
                name: theme === "dark" ? "Activar modo oscuro" : "Activar modo claro",
                exact: true,
              })
              .click();
          await month.focus();
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(
              document
                .getAnimations()
                .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
                .map((animation) => animation.finished.catch(() => {})),
            );
          });
          await page.screenshot({ path: join(server.evidence, `${size}-${theme}.png`) });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.ok((await month.boundingBox()).height >= (mobile ? 44 : 40));
        }
        writeFileSync(join(server.evidence, `${size}-accessibility.yml`), await panel.ariaSnapshot());
        await month.click({ position: { x: 20, y: 20 } });
        await page.keyboard.press("Delete");
        await expect(button).toHaveCount(0);
        await expect(panel.getByRole("status")).toHaveText("Seleccione un mes válido para exportar.");
        for (const invalid of ["2026-00", "2026-13", "1899-12", "2026-1", "0000-01"])
          assert.equal(
            (await context.request.get(`${server.baseURL}/api/documents/balance/${invalid}.pdf`)).status(),
            422,
          );
        assert.deepEqual(writes, [], "Seleccionar, descargar y reintentar solo hacen lecturas");
        assert.deepEqual(await state(), before, "Estado, revisión, auditoría e inventario intactos");
      } finally {
        await context.close();
      }
    }
    console.log("Evidencia selector mensual:", server.evidence);
  },
);
