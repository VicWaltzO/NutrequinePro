import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "nutrequine-t01-"));
  const directory = createPrivateDirectory(join(root, "private"));
  const database = join(directory, "business.sqlite");
  const auth_database = join(directory, "auth.sqlite");
  initializeDatabase(database);
  const connection = openSqliteDatabase(database);
  try {
    await createStore(() => connection).ensureState({ userId: "t01-admin", displayName: "Admin sintético" });
  } finally {
    connection.close();
  }
  const password = randomBytes(24).toString("base64url");
  await provisionAuthentication(database, auth_database, "link", {
    user_id: "t01-admin",
    name: "Admin sintético",
    login: "admin.t01",
    password,
  });
  const app = await createLocalServer({ database, auth_database, port: 0 });
  t.after(() => app.close());
  const url = await app.start();
  const observer = new DatabaseSync(database, { readOnly: true });
  t.after(() => observer.close());
  const tables = observer.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  const snapshot = () => ({
    dataVersion: observer.prepare("PRAGMA data_version").get(),
    tables: tables.map(({ name }) => [
      name,
      observer.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid').all(),
    ]),
  });
  async function login(login, secret) {
    const response = await fetch(url + "/api/auth/login", {
      method: "POST",
      headers: { origin: url, "content-type": "application/json" },
      body: JSON.stringify({ login, password: secret }),
    });
    assert.equal(response.status, 200);
    const session = await response.json();
    const cookie = response.headers.get("set-cookie").split(";")[0];
    return async (type, payload) => {
      const result = await fetch(url + "/api/command", {
        method: "POST",
        headers: {
          origin: url,
          "content-type": "application/json",
          cookie,
          "x-csrf-token": session.csrf_token,
        },
        body: JSON.stringify({ type, payload, request_id: randomUUID() }),
      });
      return { status: result.status, json: await result.json() };
    };
  }
  const send = await login("admin.t01", password);
  const counts = { valid: 0, rejected: 0 };
  async function valid(type, payload, sender = send) {
    const response = await sender(type, payload);
    assert.equal(response.status, 200, JSON.stringify(response.json));
    counts.valid++;
    return response.json;
  }
  async function rejected(type, payload, status = 422, sender = send) {
    const before = snapshot();
    const response = await sender(type, payload);
    assert.equal(response.status, status, type + ": " + (response.json.error ?? "Respuesta sin error"));
    counts.rejected++;
    assert.deepEqual(Object.keys(response.json), ["error"]);
    assert.doesNotMatch(response.json.error, /SQLITE|SELECT |INSERT |stack|\.mjs|\.mts/);
    assert.deepEqual(snapshot(), before, "No debe haber escritura ni commit de negocio: " + type);
  }
  return { app, login, send, valid, rejected, snapshot, password, url, counts };
}

test("T01 H01: phone arreglo y notes objeto se rechazan por HTTP sin escrituras", async (t) => {
  const f = await fixture(t);
  const before = f.snapshot();
  const response = await f.send("CUSTOMER_SAVE", {
    name: "H01 sintético",
    phone: ["000"],
    notes: { injected: true },
  });
  const customer = response.json.state?.customers.find((x) => x.name === "H01 sintético");
  console.log(
    JSON.stringify({
      probe: "H01",
      status: response.status,
      phoneArray: Array.isArray(customer?.phone),
      notesObject: typeof customer?.notes === "object",
      businessChanged: JSON.stringify(f.snapshot()) !== JSON.stringify(before),
    }),
  );
  assert.equal(response.status, 422);
  assert.deepEqual(f.snapshot(), before);
});

test(
  "T01: contratos maestros, referencias, compatibilidad y roles por HTTP",
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(t);
    const customer = (await f.valid("CUSTOMER_SAVE", { name: "Cliente T01", site_ids: ["site-1"] })).result;
    const config = {
      company_name: "Empresa T01",
      default_nucleus_cost: "250",
      default_packaging_cost: "1.10",
    };
    const product = {
      name: "Producto T01",
      standard_bag_weight_kg: "25",
      bags_per_nucleus: 40,
      commercial_weight_per_nucleus_kg: "1000",
      default_sale_price: "73.00",
      is_sellable: true,
    };
    const inputs = {
      CUSTOMER_SAVE: { name: "Cliente válido" },
      CUSTOMER_SITES_SAVE: { id: customer, site_ids: ["site-1"] },
      SITE_SAVE: { name: "Sede válida" },
      PRODUCT_SAVE: product,
      INGREDIENT_SAVE: { name: "Insumo válido", current_price_per_kg: "2.10" },
      CUSTOMER_DELETE: { id: customer },
      CONFIG_SAVE: config,
      USER_SAVE: { id: "t01-user", name: "Usuario válido", role: "VIEWER" },
    };
    for (const [type, payload] of Object.entries(inputs)) {
      await t.test(type + ": forma, campos desconocidos e identificadores", async () => {
        for (const invalid of [null, [], "texto", 1, true]) await f.rejected(type, invalid);
        for (const key of ["unexpected", "__proto__", "constructor", "prototype"])
          await f.rejected(type, JSON.parse(JSON.stringify(payload).slice(0, -1) + ',"' + key + '":{}}'));
        await f.rejected(type, { ...payload, id: {} });
        for (const id of ["", null, 1, true, "invalid id", "a".repeat(2001)])
          await f.rejected(type, { ...payload, id });
        if (type !== "CONFIG_SAVE" && type !== "USER_SAVE")
          await f.rejected(type, { ...payload, id: "missing-t01" });
      });
    }
    const sensitive = {
      CUSTOMER_SAVE: [
        "name",
        "tax_id",
        "contact_name",
        "phone",
        "address",
        "notes",
        "is_active",
        "confirm_duplicate",
        "site_ids",
        "new_sites",
        "default_site_id",
      ],
      CUSTOMER_SITES_SAVE: ["site_ids", "new_sites", "default_site_id"],
      SITE_SAVE: ["name", "is_active"],
      PRODUCT_SAVE: [
        "name",
        "category",
        "default_sale_price",
        "standard_bag_weight_kg",
        "bags_per_nucleus",
        "commercial_weight_per_nucleus_kg",
        "unit_weight_grams",
        "presentation_unit",
        "weight_policy",
        "stock_entry_mode",
        "is_active",
        "is_sellable",
        "image",
      ],
      INGREDIENT_SAVE: ["name", "current_price_per_kg", "is_active"],
      CONFIG_SAVE: [
        "company_name",
        "tax_id",
        "address",
        "phone",
        "contact_email",
        "default_nucleus_cost",
        "default_packaging_cost",
        "expense_categories",
        "default_payment_condition",
        "default_payment_method",
        "default_expense_category",
        "categories_text",
        "currency",
        "timezone",
      ],
      USER_SAVE: ["name", "role", "is_active"],
    };
    for (const [type, fields] of Object.entries(sensitive)) {
      await t.test(type + ": tipos incompatibles por campo sensible", async () => {
        for (const field of fields) {
          for (const value of [[], { invalid: true }, null]) {
            if (["site_ids", "new_sites"].includes(field) && Array.isArray(value)) continue;
            if (type === "PRODUCT_SAVE" && ["default_sale_price", "image"].includes(field) && value === null)
              continue;
            await f.rejected(type, { ...inputs[type], [field]: value });
          }
        }
      });
    }
    await t.test("límites, referencias y coherencia", async () => {
      for (const field of ["tax_id", "contact_name", "phone", "address", "notes"])
        for (const value of [123, false, true])
          await f.rejected("CUSTOMER_SAVE", { name: "Tipos", [field]: value });
      for (const type of ["CUSTOMER_SAVE", "CUSTOMER_SITES_SAVE"])
        await f.rejected(type, { ...inputs[type], default_site_id: "missing" });
      for (const type of ["CUSTOMER_SAVE", "SITE_SAVE", "PRODUCT_SAVE", "INGREDIENT_SAVE", "USER_SAVE"])
        for (const name of [2000, true, "", " ".repeat(3), "a".repeat(2001)])
          await f.rejected(type, { ...inputs[type], name });
      for (const field of ["phone", "notes", "tax_id", "contact_name", "address"])
        await f.rejected("CUSTOMER_SAVE", { name: "Límite", [field]: "a".repeat(2001) });
      for (const [type, field] of [
        ["INGREDIENT_SAVE", "current_price_per_kg"],
        ["PRODUCT_SAVE", "default_sale_price"],
        ["CONFIG_SAVE", "default_nucleus_cost"],
        ["CONFIG_SAVE", "default_packaging_cost"],
      ])
        for (const value of [true, false, -1, "0.001", "10000000000.01", "1e3", "NaN"])
          await f.rejected(type, { ...inputs[type], [field]: value });
      for (const field of ["unit_weight_grams", "bags_per_nucleus"])
        for (const value of [false, true, 0, -1, "1.1", 10000001])
          await f.rejected("PRODUCT_SAVE", { ...product, [field]: value });
      await f.rejected("PRODUCT_SAVE", { ...product, unit_weight_grams: 50000 });
      await f.rejected("PRODUCT_SAVE", { ...product, image: "javascript:alert(1)" });
      await f.rejected("PRODUCT_SAVE", { ...product, presentation_unit: "UNKNOWN" });
      await f.rejected("CONFIG_SAVE", { ...config, expense_categories: [] });
      await f.rejected("CONFIG_SAVE", { ...config, expense_categories: Array(101).fill("a") });
      await f.rejected("CONFIG_SAVE", { ...config, expense_categories: ["a", {}] });
      await f.rejected("CONFIG_SAVE", { ...config, contact_email: "no-es-correo" });
      await f.rejected("CONFIG_SAVE", { ...config, currency: "USD" });
      await f.rejected("CONFIG_SAVE", { ...config, timezone: "UTC" });
      for (const fields of [
        { site_ids: ["missing"], new_sites: ["No crear"] },
        { site_ids: ["site-1", "site-1"] },
        { site_ids: [1] },
        { new_sites: [null] },
        { new_sites: ["Árbol", " arbol "] },
        { site_ids: [], new_sites: ["No crear"], default_site_id: "new:9" },
        { site_ids: ["site-1"], default_site_id: "site-2" },
        { site_ids: Array(101).fill("site-1") },
      ])
        for (const type of ["CUSTOMER_SAVE", "CUSTOMER_SITES_SAVE"])
          await f.rejected(type, { ...inputs[type], ...fields });
    });
    await t.test("operaciones válidas, ecos históricos y campos inmutables", async () => {
      const initial = await f.valid("CUSTOMER_SAVE", { name: "a".repeat(2000), phone: "000", notes: "" });
      const old = initial.state.customers.find((row) => row.id === initial.result);
      await f.valid("CUSTOMER_SAVE", { ...old, name: "Histórico editado" });
      for (const field of ["created_at", "created_by", "updated_at", "code"])
        await f.rejected("CUSTOMER_SAVE", { ...old, name: "Alterado", [field]: "forged" });
      await f.valid("CUSTOMER_SITES_SAVE", {
        id: customer,
        site_ids: ["site-1"],
        new_sites: ["Nueva sede T01"],
        default_site_id: "new:0",
      });
      await f.valid("SITE_SAVE", { name: "Sede T01", is_active: false });
      const saved = await f.valid("PRODUCT_SAVE", product);
      await f.valid("PRODUCT_SAVE", { ...product, id: saved.result, default_sale_price: 74 });
      await f.valid("PRODUCT_SAVE", {
        name: "Frasco T01",
        presentation_unit: "BOTTLE",
        weight_policy: "FIXED",
        stock_entry_mode: "DIRECT_STOCK",
        unit_weight_grams: "2200",
        default_sale_price: null,
        is_sellable: false,
        image: null,
      });
      const ingredient = await f.valid("INGREDIENT_SAVE", inputs.INGREDIENT_SAVE);
      const oldIngredient = ingredient.state.ingredients.find((row) => row.id === ingredient.result);
      await f.valid("INGREDIENT_SAVE", { ...oldIngredient, current_price_per_kg: 3 });
      await f.valid("CONFIG_SAVE", {
        ...config,
        currency: "PEN",
        timezone: "America/Lima",
        categories_text: "OTHER",
        expense_categories: ["OTHER"],
      });
      await f.valid("USER_SAVE", inputs.USER_SAVE);
    });
    await t.test("ADMIN/OPERATOR/VIEWER conservan autorizaciones existentes", async () => {
      for (const role of ["OPERATOR", "VIEWER"]) {
        const id = "t01-" + role;
        await f.valid("USER_SAVE", { id, name: role, role });
        const response = await fetch(f.url + "/api/auth/login", {
          method: "POST",
          headers: { origin: f.url, "content-type": "application/json" },
          body: JSON.stringify({ login: "admin.t01", password: f.password }),
        });
        const session = await response.json();
        const secret = randomBytes(24).toString("base64url");
        const provisioned = await fetch(f.url + "/api/auth/credentials", {
          method: "POST",
          headers: {
            origin: f.url,
            "content-type": "application/json",
            cookie: response.headers.get("set-cookie").split(";")[0],
            "x-csrf-token": session.csrf_token,
          },
          body: JSON.stringify({ user_id: id, login: id, password: secret }),
        });
        assert.equal(provisioned.status, 200);
        const sender = await f.login(id, secret);
        for (const [type, payload] of Object.entries(inputs)) {
          const adminOnly = ["PRODUCT_SAVE", "INGREDIENT_SAVE", "CONFIG_SAVE", "USER_SAVE"].includes(type);
          if (role === "VIEWER" || adminOnly) await f.rejected(type, payload, 403, sender);
          else
            await f.valid(
              type,
              {
                ...payload,
                ...(type === "CUSTOMER_SAVE" || type === "SITE_SAVE" ? { name: type + " operador" } : {}),
              },
              sender,
            );
        }
      }
    });
    console.log(JSON.stringify({ probe: "T01 HTTP", ...f.counts }));
  },
);
