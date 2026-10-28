import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { stock, saleSummary } from "../../lib/domain.mjs";

test(
  "sacos y frascos: alta privada, validaciones HTTP, venta mixta, devolución, PDF y temas responsivos",
  { timeout: 240000 },
  async (t) => {
    const server = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
    t.after(server.stop);
    console.log("Evidencias CascoPlus+: " + server.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "es-PE",
      colorScheme: "light",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    const session = await (await context.request.get(server.baseURL + "/api/auth/session")).json();
    const state = async () => (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
    const run = async (type, payload, status = 200) => {
      const response = await context.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: randomUUID() },
      });
      const body = await response.json();
      assert.equal(response.status(), status, JSON.stringify(body));
      return body;
    };
    const submit = async (label, type) => {
      const response = page.waitForResponse(
        (item) => item.url().endsWith("/api/command") && item.request().postDataJSON()?.type === type,
      );
      await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
      const result = await response;
      const body = await result.json();
      assert.equal(result.status(), 200, JSON.stringify(body));
      return body;
    };
    const go = async (hash) => {
      await page.evaluate((value) => {
        location.hash = value;
      }, hash);
    };
    const close = async () => {
      await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    };
    const capture = async (name) => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          document
            .getAnimations()
            .filter((x) => x.effect?.getTiming().iterations !== Infinity)
            .map((x) => x.finished.catch(() => {})),
        );
      });
      await page.screenshot({ path: join(server.evidence, name + ".png"), animations: "disabled" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (await page.getByRole("dialog").count())
        assert.equal(
          await page.locator(".modal-body").evaluate((el) => el.scrollWidth <= el.clientWidth),
          true,
        );
    };

    await go("#config/products");
    await page.getByRole("button", { name: "Nuevo producto", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre", { exact: true }).fill("CascoPlus+");
    await dialog.getByLabel("Categoría", { exact: true }).fill("Suplemento nutricional equino");
    await dialog.getByLabel("Unidad de venta e inventario", { exact: true }).selectOption("BOTTLE");
    await dialog.getByLabel("Contenido neto por unidad (gramos)", { exact: true }).fill("2200");
    await expect(dialog.getByLabel("Política de peso", { exact: true })).toHaveValue("FIXED");
    await expect(dialog.getByLabel("Ingreso al inventario", { exact: true })).toHaveValue("DIRECT_STOCK");
    await expect(dialog.getByLabel("Sacos por núcleo", { exact: true })).toHaveCount(0);
    await dialog.getByLabel("Habilitado para venta", { exact: true }).uncheck();
    // The real reference can be reviewed locally without including it or its bytes in Git.
    const photo = process.env.NUTREQUINE_TEST_PRODUCT_PHOTO;
    await dialog.getByLabel("Fotografía privada del producto", { exact: true }).setInputFiles(
      photo || {
        name: "synthetic.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      },
    );
    const saved = await submit("Guardar", "PRODUCT_SAVE");
    const product = saved.result;
    assert.equal(saved.state.products.find((x) => x.id === product).default_sale_price, null);
    assert.equal(stock(saved.state, product).quantity, 0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: "CascoPlus+" });
    await expect(row).toContainText("Pendiente de configurar");
    await row.getByRole("button", { name: "Editar", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Precio base S/ por frasco", { exact: true }).fill("12.34");
    await dialog.getByLabel("Habilitado para venta", { exact: true }).check();
    await submit("Guardar", "PRODUCT_SAVE");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const customer = (
      await run("CUSTOMER_SAVE", { name: "Cliente sintético de frascos", site_ids: ["site-1"] })
    ).result;
    const salePayload = {
      customer_id: customer,
      site_id: "site-1",
      sale_date: "2026-10-22",
      payment_condition: "CREDIT",
    };
    const before = await state();
    for (const item of [
      { quantity: 3, unit_weight_kg: 25 },
      { quantity: 2, unit_weight_kg: 2 },
      { quantity: 1.5 },
    ])
      await run("SALE_SAVE", { ...salePayload, items: [{ product_id: product, ...item }] }, 422);
    await run(
      "INVENTORY_ADJUST",
      {
        product_id: product,
        date: "2026-10-22",
        direction: "IN",
        quantity: 5,
        weight_kg: 10,
        reason: "Peso inconsistente sintético",
      },
      422,
    );
    await run(
      "PRODUCTION_SAVE",
      { production_date: "2026-10-22", products: [{ product_id: product, nuclei_count: 1 }] },
      422,
    );
    for (const product_id of ["prod-1", product]) {
      const item = {
        product_id,
        quantity: 1,
        unit_weight_kg: product_id === product ? 2.2 : 25,
        unit_price: 12.34,
      };
      await run(
        "SALE_SAVE",
        { ...salePayload, items: [item, { ...item, presentation_unit_snapshot: "UNIT" }] },
        422,
      );
    }
    await run(
      "SALE_SAVE",
      { ...salePayload, items: [{ product_id: "prod-4", quantity: 1, unit_weight_kg: 50 }] },
      422,
    );
    assert.deepEqual(await state(), before);
    await page.reload();
    await go("#inventory");
    await page.getByRole("button", { name: "Ajustar inventario", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Producto", { exact: true }).selectOption(product);
    await dialog.getByLabel("Cantidad de frascos", { exact: true }).fill("5");
    await dialog.getByLabel("Motivo", { exact: true }).fill("Recepción física sintética");
    await expect(dialog.getByLabel("Peso total kg", { exact: true })).toHaveCount(0);
    await expect(dialog).toContainText("Peso total: 11 kg");
    await capture("bottle-receipt-light-desktop");
    await submit("Guardar", "INVENTORY_ADJUST");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    assert.equal(stock(await state(), product).weight_kg, 11000);
    await run("INVENTORY_ADJUST", {
      product_id: "prod-1",
      date: "2026-10-22",
      direction: "IN",
      quantity: 1,
      weight_kg: 25,
      reason: "Saco sintético",
    });
    await page.reload();
    await go("#productions");
    await page.getByRole("button", { name: "Nueva producción", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("CascoPlus+", { exact: true })).toHaveCount(0);
    await close();
    await go("#sales");
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Cliente", { exact: true }).selectOption(customer);
    await dialog.getByLabel("Sede destino", { exact: true }).selectOption("site-1");
    await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
    await dialog.getByLabel("Producto", { exact: true }).selectOption(product);
    await expect(dialog.getByLabel("Peso por frasco", { exact: true })).toHaveValue("2.2");
    await expect(dialog.getByLabel("Peso por frasco", { exact: true })).toHaveAttribute("readonly", "");
    await dialog.getByRole("button", { name: "Agregar CascoPlus+", exact: true }).click({ clickCount: 2 });
    await expect(dialog.getByLabel("Cantidad de frascos", { exact: true })).toHaveValue("3");
    await expect(dialog.getByLabel("Producto", { exact: true })).toHaveCount(1);
    await dialog.getByLabel("Cantidad de frascos", { exact: true }).fill("2");
    await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
    await expect(dialog.getByLabel("Peso por saco", { exact: true })).toHaveValue("25");
    await dialog.getByLabel("Entrega", { exact: true }).selectOption("planned");
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        await dialog
          .getByRole("region", { name: "Productos", exact: true })
          .evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
        await capture(`mixed-sale-${colorScheme}-${viewport.width}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const result = await submit("Confirmar venta", "SALE_SAVE");
    const id = result.result;
    assert.equal(stock(result.state, product).quantity, 5);
    assert.equal(stock(result.state, product).committed, 2);
    assert.deepEqual(
      result.state.productionProducts.map((x) => x.product_id),
      ["prod-1"],
    );
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Detalle comercial", exact: true }),
    ).toBeVisible();
    await submit("Registrar entrega", "SALE_DELIVER");
    assert.deepEqual(stock(await state(), product), { quantity: 3, weight_kg: 6600, committed: 0 });
    const pdf = await context.request.get(server.baseURL + "/api/documents/sale/" + id + ".pdf");
    assert.equal(pdf.status(), 200);
    const pdfBytes = await pdf.body();
    assert.match(pdfBytes.toString("ascii", 0, 5), /%PDF-/);
    writeFileSync(join(server.evidence, "mixed-sale.pdf"), pdfBytes);
    await page.getByRole("dialog").getByRole("button", { name: "Devolución", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("frascos a devolver", { exact: true }).fill("1");
    await dialog.getByLabel("Motivo de devolución", { exact: true }).fill("Retorno físico sintético");
    await dialog.getByLabel("Reducción económica S/ (0 si no aplica)", { exact: true }).fill("1.00");
    await capture("bottle-return-dark-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light" });
    await capture("bottle-return-light-mobile");
    await submit("Confirmar devolución", "RETURN_CREATE");
    assert.deepEqual(stock(await state(), product), { quantity: 4, weight_kg: 8800, committed: 0 });
    assert.equal(saleSummary(await state(), { id }).returned, 100);
    await page.reload();
    assert.equal((await state()).products.find((x) => x.id === product).unit_weight_grams, 2200);
    assert.deepEqual(errors, []);
  },
);
