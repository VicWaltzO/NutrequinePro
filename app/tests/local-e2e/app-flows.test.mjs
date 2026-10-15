import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { localAppFixture, browserTools } from "../helpers/local-app-server.mjs";
import { cashCreditScenario, scenarioDate } from "../helpers/regression-scenarios.mjs";
import { saleSummary, paymentSummary, stock, balanceSummary } from "../../lib/domain.mjs";

test(
  "Frontend 08: distribución React/Node aislada con sesiones reales y SQLite persistente",
  { timeout: 360000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    console.log("Evidence: " + server.evidence);
    const { chromium, request } = browserTools();
    const browser = await chromium.launch({
      channel: process.env.REGRESSION_BROWSER_CHANNEL || "chrome",
      headless: true,
      args: ["--disable-background-networking", "--disable-component-update"],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "es-PE",
      colorScheme: "light",
      serviceWorkers: "block",
    });
    const external = [];
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === server.baseURL) return route.continue();
      external.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const checks = [];
    const api = await request.newContext({ baseURL: server.baseURL });
    let csrf;
    async function apiLogin() {
      const response = await api.post("/api/auth/login", {
        headers: { Origin: server.baseURL },
        data: { login: "admin.local", password: server.password },
      });
      assert.equal(response.status(), 200);
      csrf = (await response.json()).csrf_token;
    }
    async function state() {
      const response = await api.get("/api/state");
      assert.equal(response.status(), 200);
      return (await response.json()).state;
    }
    async function command(type, payload, request_id = randomUUID()) {
      const response = await api.post("/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id },
      });
      const body = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(body));
      return body.result;
    }
    async function navigate(hash, title) {
      await page.locator("nav").getByRole("button", { name: title, exact: true }).click();
      await page.getByRole("heading", { name: title, exact: true, level: 1 }).waitFor();
      assert.equal(new URL(page.url()).hash, "#" + hash);
    }
    async function loginPage(target = page, name = "admin.local", password = server.password) {
      await target.getByLabel("Usuario", { exact: true }).fill(name);
      await target.getByLabel("Contraseña", { exact: true }).fill(password);
      await target.getByRole("button", { name: "Entrar", exact: true }).click();
      await target.locator(".sidebar-footer").waitFor();
    }
    const dialog = () => page.getByRole("dialog");
    async function submit(button, type, expectedStatus = 200) {
      const response = page.waitForResponse(
        (item) =>
          item.url().endsWith("/api/command") &&
          item.request().method() === "POST" &&
          item.request().postDataJSON().type === type,
      );
      await button.click();
      const result = await response;
      const body = await result.json();
      assert.equal(result.status(), expectedStatus, JSON.stringify(body));
      return { ...body, request: result.request().postDataJSON() };
    }
    async function close() {
      if (await dialog().isVisible())
        await dialog().getByRole("button", { name: "Cerrar", exact: true }).click();
    }
    async function step(id, title, action) {
      let passed = false;
      await t.test(id + ": " + title, async () => {
        try {
          await action();
          checks.push({ id, title, status: "passed" });
          passed = true;
        } catch (error) {
          checks.push({ id, title, status: "failed", error: error.message });
          throw error;
        } finally {
          if (page.url() !== "about:blank")
            await page.screenshot({
              path: join(server.evidence, id + (passed ? "" : "-failed") + ".png"),
              fullPage: true,
            });
        }
      });
      if (!passed) throw new Error("Flujo dependiente detenido después de " + id);
    }
    t.after(async () => {
      await context.tracing.stop({ path: join(server.evidence, "trace.zip") });
      const screenshots = readdirSync(server.evidence)
        .filter((name) => name.endsWith(".png"))
        .map((name) => ({
          name,
          sha256: createHash("sha256")
            .update(readFileSync(join(server.evidence, name)))
            .digest("hex"),
        }));
      writeFileSync(
        join(server.evidence, "results.json"),
        JSON.stringify(
          {
            synthetic: true,
            runAt: new Date().toISOString(),
            checks,
            pageErrors,
            blockedExternalRequests: external,
            screenshots,
          },
          null,
          2,
        ),
      );
      await api.dispose();
      await context.close();
      await browser.close();
    });
    let customer, production, firstSale, secondSale, payment;
    await step("L01", "login real, errores de credenciales y sesión recuperada al recargar", async () => {
      await page.goto(server.baseURL);
      await page.getByRole("heading", { name: "Iniciar sesión" }).waitFor();
      await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
      await page.getByLabel("Contraseña", { exact: true }).fill("invalid-synthetic-password");
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Credenciales inválidas" }).waitFor();
      assert.equal(await page.getByLabel("Contraseña", { exact: true }).inputValue(), "");
      await loginPage();
      await page.getByRole("heading", { name: "Resumen", exact: true }).waitFor();
      await page.reload();
      await page.getByRole("heading", { name: "Resumen", exact: true }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "Iniciar sesión" }).count(), 0);
      await apiLogin();
    });
    await step("L02", "escenario portable original de contado/crédito por HTTP real", async () => {
      await cashCreditScenario({ run: command, state });
      await page.getByRole("button", { name: "Actualizar datos", exact: true }).click();
    });
    await step("L03", "crear cliente mediante formulario y conservarlo tras recarga", async () => {
      await navigate("customers", "Clientes");
      await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
      await dialog().getByLabel("Nombre", { exact: true }).fill("Cliente navegador sintético 08");
      const saved = await submit(
        dialog().getByRole("button", { name: "Guardar", exact: true }),
        "CUSTOMER_SAVE",
      );
      customer = saved.result;
      await page.reload();
      await page.getByRole("button", { name: "Cliente navegador sintético 08", exact: true }).waitFor();
      assert.ok((await state()).customers.some((row) => row.id === customer));
    });
    await step("L04", "producción DRAFT, confirmación e inventario de cuarenta sacos", async () => {
      const before = stock(await state(), "prod-1").quantity;
      await navigate("productions", "Producción");
      await page.getByRole("button", { name: "Nueva producción", exact: true }).click();
      await dialog().getByLabel("Fecha de producción", { exact: true }).fill(scenarioDate);
      await dialog().getByLabel("Potripregnant · 40 sacos / núcleo", { exact: true }).fill("1");
      await dialog().getByLabel("Guardar como", { exact: true }).selectOption("no");
      const saved = await submit(
        dialog().getByRole("button", { name: "Guardar lote a producir", exact: true }),
        "PRODUCTION_SAVE",
      );
      production = saved.result;
      assert.equal(stock(saved.state, "prod-1").quantity, before);
      const code = saved.state.productions.find((row) => row.id === production).code;
      await close();
      await page.getByRole("button", { name: code, exact: true }).click();
      const confirmed = await submit(
        dialog().getByRole("button", { name: "Confirmar producción", exact: true }),
        "PRODUCTION_CONFIRM",
      );
      assert.equal(stock(confirmed.state, "prod-1").quantity, before + 40);
      await close();
    });
    async function sale(cash) {
      await navigate("sales", "Ventas");
      await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
      await dialog().getByLabel("Fecha de venta", { exact: true }).fill(scenarioDate);
      await dialog().getByLabel("Cliente", { exact: true }).selectOption(customer);
      await dialog().getByLabel("Sede destino", { exact: true }).selectOption("site-1");
      await dialog().getByLabel("Producto", { exact: true }).selectOption("prod-1");
      await dialog()
        .getByLabel("Cantidad de sacos", { exact: true })
        .fill(cash ? "2" : "1");
      await dialog().getByLabel("Peso por saco", { exact: true }).fill("17.001");
      await dialog()
        .getByLabel("Precio por saco", { exact: true })
        .fill(cash ? "73.01" : "10.01");
      await dialog()
        .getByLabel("Condición", { exact: true })
        .selectOption(cash ? "CASH" : "CREDIT");
      await dialog()
        .getByLabel("Entrega", { exact: true })
        .selectOption(cash ? "immediate" : "future");
      if (cash) {
        await dialog().getByLabel("Monto pagado S/", { exact: true }).fill("150.03");
        await dialog().getByLabel("Método de pago", { exact: true }).selectOption("TRANSFER");
        await dialog().getByLabel("Fecha del pago", { exact: true }).fill(scenarioDate);
      }
      return submit(dialog().getByRole("button", { name: "Confirmar venta", exact: true }), "SALE_SAVE");
    }
    await step("L05", "venta contado, céntimos, gramos y crédito sin modificar cálculos", async () => {
      const saved = await sale(true);
      firstSale = saved.result;
      payment = saved.state.payments.find((row) => row.customer_id === customer).id;
      assert.equal(saleSummary(saved.state, { id: firstSale }).total, 14602);
      assert.equal(
        paymentSummary(
          saved.state,
          saved.state.payments.find((row) => row.id === payment),
        ).available,
        401,
      );
      await close();
    });
    await step("L06", "venta futura, entrega y aplicación de saldo a favor", async () => {
      const saved = await sale(false);
      secondSale = saved.result;
      assert.equal(saved.state.sales.find((row) => row.id === secondSale).fulfillment_status, "PENDING");
      await submit(dialog().getByRole("button", { name: "Registrar entrega", exact: true }), "SALE_DELIVER");
      await close();
      await navigate("collections", "Cobranza");
      await page.getByRole("button", { name: "Historial de pagos", exact: true }).click();
      const current = await state();
      await page
        .getByRole("button", { name: current.payments.find((row) => row.id === payment).code, exact: true })
        .click();
      await dialog().getByRole("button", { name: "Aplicar saldo a favor a una venta", exact: true }).click();
      await dialog()
        .getByLabel("Aplicar a " + current.sales.find((row) => row.id === secondSale).code, { exact: true })
        .fill("4.01");
      const applied = await submit(
        dialog().getByRole("button", { name: "Aplicar saldo a favor", exact: true }),
        "PAYMENT_APPLY_CREDIT",
      );
      assert.equal(saleSummary(applied.state, { id: secondSale }).balance, 600);
      await close();
    });
    await step("L07", "pago mediante formulario y saldo comercial en cero", async () => {
      await navigate("collections", "Cobranza");
      await page.getByRole("button", { name: "Registrar pago", exact: true }).click();
      await dialog().getByLabel("Cliente", { exact: true }).selectOption(customer);
      await dialog().getByLabel("Fecha del pago", { exact: true }).fill(scenarioDate);
      await dialog().getByLabel("Monto recibido S/", { exact: true }).fill("6.00");
      await dialog().getByLabel("Método de pago", { exact: true }).selectOption("TRANSFER");
      const code = (await state()).sales.find((row) => row.id === secondSale).code;
      await dialog()
        .getByLabel("Aplicar a " + code, { exact: true })
        .fill("6.00");
      const saved = await submit(
        dialog().getByRole("button", { name: "Registrar pago", exact: true }),
        "PAYMENT_CREATE",
      );
      assert.equal(saleSummary(saved.state, { id: secondSale }).balance, 0);
      await close();
    });
    await step("L08", "rectificación conserva historia y devolución física no altera precio", async () => {
      await navigate("sales", "Ventas");
      let current = await state();
      await page
        .getByRole("button", { name: current.sales.find((row) => row.id === secondSale).code, exact: true })
        .click();
      await dialog().getByRole("button", { name: "Rectificar", exact: true }).click();
      await dialog().getByLabel("Precio por saco", { exact: true }).fill("12.01");
      await dialog()
        .getByLabel("Motivo de rectificación", { exact: true })
        .fill("Rectificación sintética 08");
      const corrected = await submit(
        dialog().getByRole("button", { name: "Registrar rectificación", exact: true }),
        "SALE_CORRECT",
      );
      assert.equal(saleSummary(corrected.state, { id: secondSale }).balance, 200);
      assert.equal(corrected.state.corrections.at(-1).reason, "Rectificación sintética 08");
      await close();
      current = await state();
      await page
        .getByRole("button", { name: current.sales.find((row) => row.id === firstSale).code, exact: true })
        .click();
      await dialog().getByRole("button", { name: "Devolución", exact: true }).click();
      await dialog().getByLabel("Sacos a devolver", { exact: true }).fill("1");
      await dialog().getByLabel("Fecha de devolución", { exact: true }).fill(scenarioDate);
      await dialog().getByLabel("Motivo de devolución", { exact: true }).fill("Retorno físico sintético 08");
      const returned = await submit(
        dialog().getByRole("button", { name: "Confirmar devolución", exact: true }),
        "RETURN_CREATE",
      );
      assert.equal(saleSummary(returned.state, { id: firstSale }).total, 14602);
      await close();
    });
    await step("L09", "reversión y anulación conservan cobros e inventario sin duplicaciones", async () => {
      await navigate("collections", "Cobranza");
      await page.getByRole("button", { name: "Historial de pagos", exact: true }).click();
      let current = await state();
      await page
        .getByRole("button", { name: current.payments.find((row) => row.id === payment).code, exact: true })
        .click();
      await dialog().getByRole("button", { name: "Registrar reversión de pago", exact: true }).click();
      await dialog().getByLabel("Motivo obligatorio", { exact: true }).fill("Reversión sintética 08");
      await dialog().getByLabel("Fecha de reversión", { exact: true }).fill(scenarioDate);
      const reversed = await submit(
        dialog().getByRole("button", { name: "Registrar operación", exact: true }),
        "PAYMENT_REVERSE",
      );
      assert.equal(saleSummary(reversed.state, { id: secondSale }).paid, 600);
      await close();
      await navigate("sales", "Ventas");
      current = await state();
      await page
        .getByRole("button", { name: current.sales.find((row) => row.id === firstSale).code, exact: true })
        .click();
      await dialog().getByRole("button", { name: "Anular", exact: true }).click();
      await dialog().getByLabel("Motivo obligatorio", { exact: true }).fill("Anulación sintética 08");
      const cancelled = await submit(
        dialog().getByRole("button", { name: "Registrar operación", exact: true }),
        "SALE_CANCEL",
      );
      assert.equal(stock(cancelled.state, "prod-1").quantity, 44);
      assert.equal(stock(cancelled.state, "prod-1").weight_kg, 1108004);
      await close();
    });
    await step("L10", "gastos, balances, configuración, tema oscuro y navegación móvil", async () => {
      await navigate("expenses", "Gastos");
      await page.getByRole("button", { name: "Registrar gasto", exact: true }).click();
      await dialog().getByLabel("Fecha", { exact: true }).fill(scenarioDate);
      await dialog().getByLabel("Descripción", { exact: true }).fill("Gasto sintético 08");
      await dialog().getByLabel("Monto pagado S/", { exact: true }).fill("0.01");
      await dialog().getByLabel("Categoría", { exact: true }).selectOption("OPERATING");
      const saved = await submit(
        dialog().getByRole("button", { name: "Guardar", exact: true }),
        "EXPENSE_CREATE",
      );
      assert.equal(balanceSummary(saved.state).other, 1);
      await navigate("config", "Configuración");
      await page.getByRole("heading", { level: 1, name: "Configuración", exact: true }).waitFor();
      await navigate("balance", "Balance");
      await page.getByRole("button", { name: "Activar modo oscuro", exact: true }).click();
      await page.reload();
      await page.getByRole("heading", { name: "Balance", level: 1, exact: true }).waitFor();
      assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
      await page.locator("nav").getByRole("button", { name: "Inventario", exact: true }).click();
      await page.getByRole("heading", { name: "Inventario", level: 1 }).waitFor();
      await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await step(
      "L11",
      "sesión expirada conserva formulario e ID de reintento tras reautenticación",
      async () => {
        await navigate("customers", "Clientes");
        await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
        await dialog().getByLabel("Nombre", { exact: true }).fill("Cliente reintento tras expiración 08");
        const raw = new DatabaseSync(server.authDatabase);
        raw.prepare("UPDATE sessions SET expires_at=0 WHERE user_id=?").run(server.admin.userId);
        raw.close();
        const failed = await submit(
          dialog().getByRole("button", { name: "Guardar", exact: true }),
          "CUSTOMER_SAVE",
          401,
        );
        await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).waitFor();
        await loginPage();
        assert.equal(
          await dialog().getByLabel("Nombre", { exact: true }).inputValue(),
          "Cliente reintento tras expiración 08",
        );
        const retried = await submit(
          dialog().getByRole("button", { name: "Guardar", exact: true }),
          "CUSTOMER_SAVE",
        );
        assert.equal(retried.request.request_id, failed.request.request_id);
        assert.equal(
          retried.state.audit.filter((row) => row.request_id === failed.request.request_id).length,
          1,
        );
        await apiLogin();
      },
    );
    await step("L12", "rotación, revocación y logout reales sin tokens en almacenamiento web", async () => {
      // A login from another tab rotates the shared cookie without changing this tab's in-memory CSRF.
      const rotated = await context.request.post(server.baseURL + "/api/auth/login", {
        headers: { Origin: server.baseURL },
        data: { login: "admin.local", password: server.password },
      });
      assert.equal(rotated.status(), 200);
      await navigate("customers", "Clientes");
      await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
      await dialog().getByLabel("Nombre", { exact: true }).fill("Cliente tras rotación de cookie 08");
      const denied = await submit(
        dialog().getByRole("button", { name: "Guardar", exact: true }),
        "CUSTOMER_SAVE",
        403,
      );
      await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).waitFor();
      await loginPage();
      const retried = await submit(
        dialog().getByRole("button", { name: "Guardar", exact: true }),
        "CUSTOMER_SAVE",
      );
      assert.equal(retried.request.request_id, denied.request.request_id);
      const response = await api.post("/api/auth/revoke", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { user_id: server.admin.userId },
      });
      assert.equal(response.status(), 200);
      await page.getByRole("button", { name: "Actualizar datos", exact: true }).click();
      await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).waitFor();
      await loginPage();
      await page.getByRole("button", { name: "Salir", exact: true }).click();
      await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).waitFor();
      assert.equal((await context.request.get(server.baseURL + "/api/state")).status(), 401);
      const storage = await page.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }));
      assert.deepEqual(Object.keys(storage.session), []);
      assert.ok(Object.keys(storage.local).every((name) => /theme/i.test(name)));
      await loginPage();
      await apiLogin();
    });
    await step("L13", "usuarios reales OPERATOR y VIEWER y permisos en navegador", async () => {
      for (const role of ["OPERATOR", "VIEWER"]) {
        const id = role.toLowerCase() + "-08";
        const password = randomBytes(24).toString("base64url");
        await command("USER_SAVE", { id, name: "Usuario " + role + " sintético 08", role });
        const credential = await api.post("/api/auth/credentials", {
          headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
          data: { user_id: id, login: id, password },
        });
        assert.equal(credential.status(), 200);
        const account = await browser.newContext({ serviceWorkers: "block" });
        await account.route("**/*", (route) =>
          new URL(route.request().url()).origin === server.baseURL
            ? route.continue()
            : route.abort("blockedbyclient"),
        );
        const userPage = await account.newPage();
        await userPage.goto(server.baseURL);
        await loginPage(userPage, id, password);
        await userPage.locator("nav").getByRole("button", { name: "Ventas", exact: true }).click();
        await userPage.getByRole("heading", { name: "Ventas", exact: true }).waitFor();
        assert.equal(
          await userPage.getByRole("button", { name: "Nueva venta", exact: true }).count(),
          role === "VIEWER" ? 0 : 1,
        );
        const denied = await userPage.evaluate(async () => {
          const session = await (await fetch("/api/auth/session")).json();
          return (
            await fetch("/api/command", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token },
              body: JSON.stringify({
                type: "USER_SAVE",
                payload: { id: "forbidden" },
                request_id: crypto.randomUUID(),
              }),
            })
          ).status;
        });
        assert.equal(denied, 403);
        if (role === "OPERATOR") {
          await userPage.locator("nav").getByRole("button", { name: "Clientes", exact: true }).click();
          await userPage.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
          await userPage
            .getByRole("dialog")
            .getByLabel("Nombre", { exact: true })
            .fill("Cliente operador 08");
          await userPage.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
          await userPage.getByRole("button", { name: "Cliente operador 08", exact: true }).waitFor();
        }
        await userPage.screenshot({ path: join(server.evidence, role + ".png"), fullPage: true });
        await account.close();
      }
      await page.getByRole("button", { name: "Actualizar datos", exact: true }).click();
    });
    await step(
      "L14",
      "reinicio de distribución aislada conserva sesión y todo el estado comercial",
      async () => {
        const before = await state();
        await server.stop();
        await server.start();
        await page.reload();
        await page.locator(".sidebar-footer").waitFor();
        assert.deepEqual(await state(), before);
        assert.ok(before.audit.every((entry) => before.users.some((user) => user.id === entry.created_by)));
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(external, []);
      },
    );
  },
);
