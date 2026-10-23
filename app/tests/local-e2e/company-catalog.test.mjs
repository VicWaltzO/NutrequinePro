import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { localAppFixture, appRoot } from "../helpers/local-app-server.mjs";
import { originalCompanyCatalog, catalogTables } from "../../lib/company-catalog.mjs";

const money = (value) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value / 100);
const kg = (value) => new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(value / 1000);

test(
  "catálogo empresarial: aprovisionamiento explícito, fotografías originales, cantidades, sedes y edición posterior",
  { timeout: 240000 },
  async (t) => {
    const server = await localAppFixture({ emptyBusiness: true });
    let browser;
    t.after(async () => {
      try {
        await browser?.close();
      } finally {
        await server.stop();
      }
    });
    browser = await chromium.launch({
      channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined,
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      serviceWorkers: "block",
    });
    const errors = [];
    const resources = [];
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === server.baseURL) return route.continue();
      resources.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (
        ["image", "stylesheet", "script"].includes(response.request().resourceType()) &&
        response.status() >= 400
      )
        resources.push(response.url());
    });
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("heading", { name: "Resumen", exact: true, level: 1 }).waitFor();
    const getState = async () => {
      const response = await context.request.get(server.baseURL + "/api/state");
      assert.equal(response.status(), 200);
      return (await response.json()).state;
    };
    assert.equal((await getState()).products.length, 0);
    await page.screenshot({ path: join(server.evidence, "catalog-before.png"), fullPage: true });
    await server.stop();
    const cli = join(server.distribution, "scripts/company-catalog.mjs");
    const plan = join(server.directory, "catalog-plan.json");
    const backup = join(server.directory, "before-catalog.sqlite");
    const invoke = (...args) =>
      JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", windowsHide: true }));
    const preview = invoke(
      "preview",
      "--database",
      server.database,
      "--actor",
      server.admin.userId,
      "--plan",
      plan,
    );
    assert.deepEqual(preview.result.summary, {
      products: 4,
      ingredients: 10,
      sites: 5,
      formulas: 4,
      formulaIngredients: 40,
    });
    assert.equal(
      invoke("apply", "--database", server.database, "--plan", plan, "--backup", backup).result.status,
      "applied",
    );
    assert.equal(
      invoke("apply", "--database", server.database, "--plan", plan, "--backup", backup).result.status,
      "unchanged",
    );
    await server.start();
    await page.reload();
    await page.getByRole("heading", { name: "Resumen", exact: true, level: 1 }).waitFor();
    const catalog = originalCompanyCatalog();
    const recovered = await getState();
    for (const table of catalogTables)
      assert.deepEqual(
        recovered[table].toSorted((a, b) => a.id.localeCompare(b.id)),
        catalog[table].toSorted((a, b) => a.id.localeCompare(b.id)),
      );
    for (const product of catalog.products.filter((row) => row.image)) {
      const image = page.getByRole("img", { name: "Presentación real de " + product.name, exact: true });
      await image.waitFor();
      assert.match(await image.evaluate((element) => getComputedStyle(element).backgroundImage), /productos/);
      assert.ok((await image.boundingBox()).height > 0);
    }
    const photo = await context.request.get(server.baseURL + "/brand/productos.jpg");
    assert.equal(photo.status(), 200);
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    assert.equal(hash(await photo.body()), hash(readFileSync(join(appRoot, "public/brand/productos.jpg"))));
    await page.screenshot({ path: join(server.evidence, "catalog-products-images.png"), fullPage: true });
    const nav = async (name) => {
      await page.locator("nav").getByRole("button", { name, exact: true }).click();
      await page.getByRole("heading", { name, exact: true, level: 1 }).waitFor();
    };
    await nav("Configuración");
    await page.getByRole("button", { name: "Productos", exact: true }).click();
    for (const product of catalog.products) {
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: product.name, exact: true }) });
      const cells = await row.getByRole("cell").allTextContents();
      assert.deepEqual(cells.slice(0, 7), [
        product.name,
        money(product.default_sale_price) + " / saco",
        "saco · " + kg(product.standard_bag_weight_kg) + " kg · Variable",
        String(product.bags_per_nucleus),
        kg(product.commercial_weight_per_nucleus_kg),
        product.is_sellable ? "Habilitada" : "Consumo interno",
        "Activo",
      ]);
    }
    await page.getByText("Presentación original de productos", { exact: true }).click();
    const originalImage = page.getByRole("img", {
      name: "Presentación real de Nutrelin, Hi-Performance y Potripregnant",
      exact: true,
    });
    await originalImage.waitFor();
    assert.ok(await originalImage.evaluate((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({
      path: join(server.evidence, "catalog-commercial-parameters.png"),
      fullPage: true,
    });
    await nav("Producción");
    await page.getByRole("button", { name: "Insumos", exact: true }).click();
    for (const ingredient of catalog.ingredients) {
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: ingredient.name, exact: true }) });
      assert.deepEqual((await row.getByRole("cell").allTextContents()).slice(0, 3), [
        ingredient.name,
        money(ingredient.current_price_per_kg),
        "Activo",
      ]);
    }
    await page.screenshot({ path: join(server.evidence, "catalog-ingredients-prices.png"), fullPage: true });
    await page.getByRole("button", { name: "Fórmulas", exact: true }).click();
    for (const formula of catalog.formulas) {
      const product = catalog.products.find((row) => row.id === formula.product_id);
      const details = page
        .locator(".formula-list details")
        .filter({ has: page.locator("summary").filter({ hasText: product.name + " · v1" }) });
      await details.waitFor();
      const rows = await details.locator("tbody tr").all();
      const lines = catalog.formulaIngredients.filter((row) => row.formula_id === formula.id);
      assert.equal(rows.length, 10);
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const ingredient = catalog.ingredients.find((row) => row.id === line.ingredient_id);
        assert.deepEqual(await rows[index].getByRole("cell").allTextContents(), [
          ingredient.name,
          kg(line.kg_per_nucleus),
        ]);
      }
      assert.match(
        await details.locator(".formula-total").innerText(),
        new RegExp(kg(lines.reduce((sum, line) => sum + line.kg_per_nucleus, 0))),
      );
    }
    await page.screenshot({ path: join(server.evidence, "catalog-four-formulas.png"), fullPage: true });
    await nav("Clientes");
    await page.getByRole("button", { name: "Sedes", exact: true }).click();
    for (const site of catalog.sites)
      await page.getByRole("cell", { name: site.name, exact: true }).waitFor();
    await page.screenshot({ path: join(server.evidence, "catalog-five-sites.png"), fullPage: true });

    // Exercise existing administrator forms on this isolated database, never on the user's installation.
    const submit = async (button, type) => {
      const pending = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/command") && response.request().postDataJSON().type === type,
      );
      await button.click();
      assert.equal((await pending).status(), 200);
    };
    await nav("Configuración");
    await page.getByRole("button", { name: "Productos", exact: true }).click();
    await page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "Potripregnant", exact: true }) })
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Precio base S/ por saco", { exact: true }).fill("74.01");
    await submit(dialog.getByRole("button", { name: "Guardar", exact: true }), "PRODUCT_SAVE");
    await nav("Producción");
    await page.getByRole("button", { name: "Insumos", exact: true }).click();
    await page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "Torta soya HiPro", exact: true }) })
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Precio S/ por kg", { exact: true }).fill("2.11");
    await submit(dialog.getByRole("button", { name: "Guardar", exact: true }), "INGREDIENT_SAVE");
    await page.getByRole("button", { name: "Fórmulas", exact: true }).click();
    await page
      .locator(".formula-list details")
      .filter({ hasText: "Potripregnant · v1" })
      .getByRole("button", { name: "Editar fórmula", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Kg por núcleo", { exact: true }).first().fill("122.001");
    await submit(
      dialog.getByRole("button", { name: "Crear versión de fórmula", exact: true }),
      "FORMULA_SAVE",
    );
    const edited = await getState();
    assert.equal(edited.products.find((row) => row.id === "prod-1").default_sale_price, 7401);
    assert.equal(edited.ingredients.find((row) => row.id === "ing-1").current_price_per_kg, 211);
    assert.equal(edited.formulas.find((row) => row.product_id === "prod-1" && row.is_active).version, 2);
    assert.equal(edited.formulaIngredients.find((row) => row.id === "fi-1-1").kg_per_nucleus, 122000);
    await server.stop();
    const updatedPlan = join(server.directory, "after-admin-plan.json");
    invoke("preview", "--database", server.database, "--actor", server.admin.userId, "--plan", updatedPlan);
    assert.equal(
      invoke(
        "apply",
        "--database",
        server.database,
        "--plan",
        updatedPlan,
        "--backup",
        join(server.directory, "unused.sqlite"),
      ).result.status,
      "unchanged",
    );
    await server.start();
    await page.reload();
    await page.locator(".sidebar-footer").waitFor();
    assert.deepEqual(await getState(), edited);
    assert.deepEqual(errors, []);
    assert.deepEqual(resources, []);
    writeFileSync(
      join(server.evidence, "catalog-verification.json"),
      JSON.stringify(
        {
          passed: true,
          originalCounts: { products: 4, ingredients: 10, sites: 5, formulas: 4, formulaIngredients: 40 },
          originalFormulaGrams: [988000, 985000, 991000, 1501000],
          originalPhotoSha256: hash(await photo.body()),
          administratorEditsPreserved: true,
          originalVersionPreserved: true,
          restartStateIdentical: true,
          pageErrors: errors,
          failedOrExternalResources: resources,
        },
        null,
        2,
      ),
    );
    console.log("Company catalog evidence: " + server.evidence);
  },
);
