import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixedTime = "2026-10-09T12:00:00-05:00";
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [fixedTime]));
  }
  static now() {
    return new Date(fixedTime).getTime();
  }
}

/** Real React SSR, deterministic clock/IDs and inert interaction hooks. No network or D1. */
export function createUiHarness(readSource = (file) => readFileSync(path.join(appRoot, file), "utf8")) {
  const cache = new Map();
  let identifier = 0,
    hookIndex = 0,
    injectAdminState = false,
    activeState,
    activeActor,
    activeModal = null,
    modalInjected = false;
  const location = { hash: "#dashboard" };
  const react = {
    ...React,
    useState(initial) {
      const index = hookIndex++;
      let value =
        injectAdminState && index === 0
          ? activeState
          : injectAdminState && index === 1
            ? activeActor
            : typeof initial === "function"
              ? initial()
              : initial;
      if (injectAdminState && index > 1 && initial === null && !modalInjected) {
        value = activeModal;
        modalInjected = true;
      }
      return [value, () => {}];
    },
    useEffect() {},
    useRef(initial) {
      return { current: initial };
    },
    useSyncExternalStore(_subscribe, snapshot) {
      return snapshot();
    },
  };
  const context = vm.createContext({
    console,
    structuredClone,
    Intl,
    Date: FixedDate,
    location,
    crypto: { randomUUID: () => `test-id-${String(++identifier).padStart(4, "0")}` },
    localStorage: { getItem: () => "light" },
    window: { matchMedia: () => ({ matches: false }) },
    setTimeout,
    clearTimeout,
  });
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const source = readSource(file);
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: file.replace(/\.mjs$/, ".js"),
    }).outputText;
    const moduleRecord = { exports: {} };
    cache.set(file, moduleRecord);
    const localRequire = (specifier) => {
      if (specifier === "react") return react;
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return require(specifier);
      const base = specifier.startsWith("@/")
        ? specifier.slice(2)
        : path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const candidates = /\.(mjs|ts|tsx)$/.test(base)
        ? [base]
        : [base + ".ts", base + ".tsx", base + ".mjs", base + "/index.ts"];
      for (const candidate of candidates) {
        try {
          readSource(candidate);
        } catch {
          continue;
        }
        return load(candidate);
      }
      throw new Error(`No se pudo resolver ${specifier} desde ${file}`);
    };
    const execute = vm.runInContext(`(function(require,module,exports){${code}\n})`, context, {
      filename: file,
    });
    execute(localRequire, moduleRecord, moduleRecord.exports);
    return moduleRecord.exports;
  }
  const domain = load("lib/domain.mjs");
  let state = domain.seedState();
  const actor = { id: "test-admin", name: "Administrador de prueba", role: "ADMIN", is_active: true };
  state.users.push(actor);
  const run = (type, payload) => {
    const outcome = domain.executeCommand(
      state,
      { type, payload: { date: "2026-10-09", ...payload } },
      actor,
      fixedTime,
    );
    state = outcome.state;
    return outcome.result;
  };
  const customer = run("CUSTOMER_SAVE", { name: "Cliente de prueba", site_ids: ["site-1"] });
  const production = run("PRODUCTION_SAVE", {
    production_date: "2026-10-09",
    products: [
      { product_id: "prod-1", nuclei_count: 2 },
      { product_id: "prod-2", nuclei_count: 1 },
    ],
    confirm: true,
  });
  const sale = run("SALE_SAVE", {
    customer_id: customer,
    site_id: "site-1",
    sale_date: "2026-10-09",
    payment_date: "2026-10-09",
    payment_condition: "CASH",
    payment_method: "TRANSFER",
    paid_amount: 75,
    items: [{ product_id: "prod-1", quantity: 2, unit_weight_kg: 25, unit_price: 70 }],
    deliver: true,
  });
  run("SALE_SAVE", {
    customer_id: customer,
    site_id: "site-1",
    sale_date: "2026-10-09",
    payment_condition: "CREDIT",
    items: [{ product_id: "prod-2", quantity: 60, unit_weight_kg: 25, unit_price: 67 }],
    create_production: true,
  });
  run("PAYMENT_CREATE", {
    customer_id: customer,
    payment_date: "2026-10-09",
    total_amount: 100,
    payment_method: "CASH",
    applications: [{ sale_id: sale, applied_amount: 65 }],
  });
  run("EXPENSE_CREATE", {
    date: "2026-10-09",
    category: "LOGISTICS",
    description: "Flete de prueba",
    amount: 100,
    production_id: production,
  });
  run("SALE_CORRECT", {
    id: sale,
    reason: "Corrección de prueba",
    items: [{ product_id: "prod-1", quantity: 3, unit_weight_kg: 25, unit_price: 70 }],
  });
  const item = domain.saleSummary(
    state,
    state.sales.find((row) => row.id === sale),
  ).items[0];
  run("RETURN_CREATE", {
    sale_id: sale,
    return_date: "2026-10-09",
    reason: "Retorno de prueba",
    economic_amount: 0,
    items: [{ sale_item_id: item.id, quantity: 1 }],
  });

  function render(route = "dashboard", role = "ADMIN", modal = null) {
    hookIndex = 0;
    injectAdminState = true;
    activeState = state;
    activeActor = { ...actor, role };
    activeModal = modal;
    modalInjected = false;
    location.hash = "#" + route;
    return renderToStaticMarkup(React.createElement(load("client/admin/AdminApp.tsx").default));
  }
  const routes = [
    "dashboard",
    "sales",
    "sales/future",
    "sales/draft",
    "sales/corrections",
    "sales/returns",
    "sales/cancelled",
    "collections",
    "collections/payments",
    "customers",
    "customers/sites",
    "productions",
    "productions/draft",
    "productions/ingredients",
    "productions/formulas",
    "inventory",
    "inventory/movements",
    "expenses",
    "balance",
    "config",
    "config/products",
    "config/users",
    "config/audit",
    "config/appearance",
    "sites",
    "products",
  ];
  return {
    snapshots() {
      const result = {};
      for (const role of ["ADMIN", "OPERATOR", "VIEWER"])
        for (const route of role === "ADMIN"
          ? routes
          : [
              "dashboard",
              "sales",
              "collections",
              "productions",
              "inventory",
              "expenses",
              "balance",
              "customers",
              "config",
            ]) {
          result[`${role}:${route}`] = createHash("sha256").update(render(route, role)).digest("hex");
        }
      const records = {
        sale: state.sales[0],
        production: state.productions[0],
        payment: state.payments[1],
        customer: state.customers[0],
        site: state.sites[0],
        product: state.products[0],
        ingredient: state.ingredients[0],
        user: state.users[0],
        formula: state.formulas[0],
      };
      const modals = [
        { type: "sale" },
        { type: "sale", record: records.sale, kind: "correct" },
        { type: "payment", record: { customer_id: customer } },
        { type: "credit", record: records.payment },
        { type: "production", record: state.productions[1] },
        { type: "reconcile", record: records.production },
        { type: "production-quantities", record: records.production },
        { type: "formula", record: records.formula },
        ...["customer", "customer-delete", "site", "product", "ingredient", "user"].map((type) => ({
          type,
          record: records[type === "customer-delete" ? "customer" : type],
        })),
        ...["expense", "adjust", "config"].map((type) => ({ type })),
        { type: "reason", record: { ...records.payment, _operation: "PAYMENT_REVERSE" } },
        ...["sale", "production", "payment", "customer"].map((type) => ({
          type: type + "-detail",
          record: records[type],
        })),
      ];
      for (const modal of modals)
        result["modal:" + modal.type + (modal.kind ? ":" + modal.kind : "")] = createHash("sha256")
          .update(render("dashboard", "ADMIN", modal))
          .digest("hex");
      return result;
    },
    render,
  };
}
