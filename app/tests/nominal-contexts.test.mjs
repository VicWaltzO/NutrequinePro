import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { createUiHarness } from "./helpers/ui-harness.mjs";

const root = new URL("../", import.meta.url);
function csv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [headers, ...data] = rows;
  return data
    .filter((row) => row.length > 1)
    .map((row) => Object.fromEntries(headers.map((key, i) => [key, row[i]])));
}
const inventory = csv(
  readFileSync(new URL("docs/actualizacion-seguridad/NQP26-13_INVENTARIO_SELECTORES.csv", root), "utf8"),
);
const noop = () => {};
const decode = (text) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const options = (html) =>
  [...html.matchAll(/<option\b([^>]*)>(.*?)<\/option>/gs)].map((m) => ({
    id: decode(m[1].match(/value="([^"]*)"/)?.[1] ?? ""),
    name: decode(m[2]),
    selected: m[1].includes('selected=""'),
  }));
const select = (html, label) => {
  const found = [...html.matchAll(/<select\b([^>]*)>(.*?)<\/select>/gs)].find(
    (m) => decode(m[1].match(/aria-label="([^"]*)"/)?.[1] ?? "") === label,
  );
  assert.ok(found, `selector montado: ${label}`);
  return found[2];
};
const collator = new Intl.Collator("es-PE", { sensitivity: "base", numeric: true });
function nominal(rows, fixed = []) {
  assert.ok(rows.length > 1, "fixture debe tener varias opciones");
  const content = rows.filter((row) => row.id && !fixed.includes(row.id));
  for (let i = 1; i < content.length; i++)
    assert.ok(collator.compare(content[i - 1].name, content[i].name) <= 0, JSON.stringify(content));
  for (const id of fixed) assert.equal(rows.at(-1).id, id);
}
function fixture(contextNumber = 0) {
  // SSR hooks are inert. Open the two hidden sections in-memory only; browser tests exercise real clicks.
  const h = createUiHarness((file) => {
    let text = readFileSync(new URL(file, root), "utf8");
    if (file.endsWith("CustomerSiteFields.tsx"))
      text = text.replace('useState<"" | "link" | "create">("")', 'useState<"" | "link" | "create">("link")');
    if (file.endsWith("useSaleFormState.ts")) text = text.replace('mode: "immediate"', 'mode: "future"');
    if (file.endsWith("useProductionFormState.ts"))
      text = text.replace(
        "snapshot?.costs ?? []",
        'snapshot?.costs ?? [{ category: "INGREDIENT_EXTRA", ingredient_id: state.ingredients[0].id, description: "synthetic", amount: 1, is_paid: false }]',
      );
    if (file.endsWith("ReconcileForm.tsx"))
      text = text.replace(
        "useState<CostInput[]>([])",
        'useState<CostInput[]>([{ category: "INGREDIENT_EXTRA", ingredient_id: state.ingredients[0].id, description: "synthetic", amount: 1, is_paid: false }])',
      );
    if (file.endsWith("CustomerSites.tsx"))
      text = text.replace(
        "useState<SiteSelection | null>(null)",
        'useState<SiteSelection | null>({site_ids: state.sites.slice(0,2).map(x=>x.id), new_sites: ["Z pendiente", "A pendiente"], default_site_id: "new:0"})',
      );
    if (contextNumber >= 29 && contextNumber <= 30 && file.endsWith("CustomerDetail.tsx"))
      text = text.replace('useState("all")', 'useState("sites")');
    if (file.endsWith("CustomerDetail.tsx")) text = text.replace('useState("all")', 'useState("sales")');
    return text;
  });
  const state = h.state();
  for (const field of ["customers", "sites", "products", "ingredients"]) {
    state[field].forEach((row, i) => {
      row.name = ["Zeta 10", "Árbol 2", "arbol 10"][i % 3];
    });
    while (state[field].length < 3)
      state[field].push({
        ...state[field][0],
        id: `${field}-extra-${state[field].length}`,
        name: ["Zeta 10", "Árbol 2", "arbol 10"][state[field].length],
      });
  }
  state.products.forEach((p) => {
    p.is_active = true;
    p.is_sellable = true;
  });
  const customer = state.customers[0];
  state.sites.forEach((site, i) => {
    site.is_active = true;
    if (i < 2)
      state.customerSites.push({
        id: `fixture-link-${i}`,
        customer_id: customer.id,
        site_id: site.id,
        is_active: true,
        is_default: i === 0,
      });
  });
  // Ensure both groups have multiple options, with interleaved names across groups.
  state.sites.push({ ...state.sites[0], id: "other-2", name: "A otra", is_active: true });
  state.config.expense_categories = ["LOGISTICS", "ADMINISTRATIVE", "OPERATING"];
  return { h, state, customer };
}
const sequential = {
  Estado: ["DRAFT", "CONFIRMED", "RECTIFIED", "PENDING", "PARTIAL", "PAID", "DELIVERED", "CANCELLED"],
  "Estado comercial": ["CONFIRMED", "RECTIFIED", "DRAFT", "CANCELLED"],
  Entrega: ["immediate", "future", "planned"],
  Condición: ["CREDIT", "CASH"],
  "Guardar como": ["no", "yes"],
  Movimiento: ["IN", "OUT"],
  Rol: ["ADMIN", "OPERATOR", "VIEWER"],
  "Política de peso": ["FIXED", "VARIABLE"],
  "Ingreso al inventario": ["DIRECT_STOCK", "NUCLEUS_PRODUCTION"],
  "Condición de pago en nuevas ventas": ["CREDIT", "CASH"],
};
for (const row of inventory)
  test(`${row.ID_selector}: ${row.Orden_semantico_propuesto} · ${row.Etiqueta_visible}`, () => {
    const number = Number(row.ID_selector.slice(-3));
    const { h, state, customer } = fixture(number);
    const file = row.Archivo_componente.replace(/^app\//, "");
    const name = file
      .split("/")
      .at(-1)
      .replace(/\.tsx$/, "");
    const simple = {
      s: state,
      v: {
        presentation_unit: "BAG",
        stock_entry_mode: "NUCLEUS_PRODUCTION",
        weight_policy: "VARIABLE",
        role: "VIEWER",
        direction: "IN",
        default_payment_condition: "CREDIT",
        payment_method: "TRANSFER",
      },
      set: noop,
      input: () => null,
      categories: state.config.expense_categories,
      defaultCategory: "LOGISTICS",
    };
    const common = { s: state, close: noop, submit: noop, busy: false };
    let props = simple;
    let renderFile = file;
    let renderName;
    if (name === "RecordFilters")
      props = {
        s: state,
        view: [3, 4, 6].includes(number) ? "collections" : number === 7 ? "productions" : "sales",
        setQ: noop,
        setFilter: noop,
        setClient: noop,
        setSite: noop,
        setFrom: noop,
        setTo: noop,
      };
    if (name === "SaleForm")
      props = {
        ...common,
        record: { customer_id: customer.id, site_id: "other-2", payment_condition: "CASH" },
        kind: number >= 14 && number <= 19 ? "draft" : undefined,
      };
    if (name === "SaleLineEditor")
      props = {
        state,
        rows: [{ product_id: state.products[0].id, quantity: 1, unit_weight_kg: 25, unit_price: 1 }],
        setRows: noop,
        update: noop,
        total: 0,
      };
    if (name === "PaymentForm") props = common;
    if (name === "PaymentFields") props = { v: { payment_method: "TRANSFER", reference: "" }, set: noop };
    if (name === "CustomerSiteFields")
      props = {
        state,
        value: {
          site_ids: state.sites.slice(0, 2).map((s) => s.id),
          new_sites: ["Z pendiente", "A pendiente"],
          default_site_id: "new:0",
        },
        onChange: noop,
      };
    if (name === "FormulaForm")
      props = { ...common, record: number >= 34 ? { product_id: state.products[0].id } : undefined };
    if (name === "ProductionForm")
      props = { ...common, record: number === 37 ? state.productions[0] : undefined };
    if (name === "CostRows")
      props = {
        s: state,
        costs: [
          {
            category: "INGREDIENT_EXTRA",
            ingredient_id: state.ingredients[0].id,
            description: "synthetic",
            amount: 1,
            is_paid: false,
          },
        ],
        setCosts: noop,
      };
    if (name === "CustomerDetail")
      props = { state, customer, write: true, open: noop, saleTable: () => null, run: noop, busy: false };
    if (name === "MonthlyBalanceExport") props = { state };
    if (number >= 20 && number <= 22) {
      renderFile = "features/ventas/components/SaleForm.tsx";
      renderName = "SaleForm";
      props = {
        ...common,
        ...(number === 20 ? {} : { record: state.sales[0] }),
        kind: number === 22 ? "correct" : number === 21 ? "draft" : undefined,
      };
    }
    if (number >= 25 && number <= 28) {
      renderFile = "client/admin/SimpleForm.tsx";
      renderName = "default";
      props = {
        ...common,
        kind: "customer",
        record: {
          ...(number >= 27 ? customer : {}),
          site_ids: state.sites.slice(0, 2).map((x) => x.id),
          new_sites: ["Z pendiente", "A pendiente"],
          default_site_id: "new:0",
        },
      };
    }
    if (number >= 29 && number <= 30) {
      renderFile = "features/clientes/components/CustomerDetail.tsx";
      renderName = "CustomerDetail";
      props = { state, customer, write: true, open: noop, saleTable: () => null, run: noop, busy: false };
    }
    if (number >= 38 && number <= 43) {
      renderFile =
        number >= 42
          ? "features/produccion/components/ReconcileForm.tsx"
          : "features/produccion/components/ProductionForm.tsx";
      renderName = number >= 42 ? "ReconcileForm" : "ProductionForm";
      props = {
        ...common,
        record:
          number >= 42
            ? state.productions[0]
            : number >= 40
              ? {
                  ...state.productions[1],
                  input_snapshot: {
                    costs: [
                      {
                        category: "INGREDIENT_EXTRA",
                        ingredient_id: state.ingredients[0].id,
                        description: "synthetic",
                        amount: 1,
                        is_paid: false,
                      },
                    ],
                  },
                }
              : undefined,
      };
    }
    const before = JSON.stringify(state);
    const html = h.renderComponent(
      renderFile,
      renderName ??
        ([
          "RecordFilters",
          "CompanyFields",
          "ProductFields",
          "ExpenseFields",
          "InventoryAdjustmentFields",
          "UserFields",
          "MonthlyBalanceExport",
        ].includes(name)
          ? "default"
          : name),
      props,
    );
    assert.equal(JSON.stringify(state), before, "render no cambia dominio, revisión ni auditoría");
    if (number === 62) {
      assert.match(html, /type="month" min="1900-01"/);
      return;
    }
    if (number >= 63) {
      assert.deepEqual(
        [...html.matchAll(/type="radio"[^>]*value="([^"]*)"/g)].map((x) => x[1]),
        ["ONE_TIME", "LINK"],
      );
      return;
    }
    if ([26, 28, 30].includes(number)) {
      const labels = [
        ...(html.match(/<div class="customer-site-options">([\s\S]*?)<\/div>/)?.[1] ?? "").matchAll(
          /<label class="check"><input[^>]*type="checkbox"[^>]*\/><span>(.*?)<\/span><\/label>/gs,
        ),
      ].map((m) => ({ id: m[1], name: decode(m[1]) }));
      nominal(labels);
      return;
    }
    const label = [33, 35].includes(number) ? "Insumo 1" : row.Etiqueta_visible;
    const body = select(html, label);
    const values = options(body);
    if (row.Orden_semantico_propuesto === "SECUENCIA_NEGOCIO") {
      const expected =
        number === 6
          ? ["PENDING", "PARTIAL"]
          : number === 7
            ? ["DRAFT", "CONFIRMED", "CLOSED", "CANCELLED"]
            : sequential[label];
      assert.deepEqual(
        values.filter((x) => x.id).map((x) => x.id),
        expected,
      );
      return;
    }
    if (row.Orden_semantico_propuesto === "AGRUPADO_AZ_INTERNO") {
      const groups = [...body.matchAll(/<optgroup label="([^"]*)">(.*?)<\/optgroup>/gs)];
      assert.deepEqual(
        groups.map((x) => x[1]),
        ["Sedes del cliente", "Otras sedes"],
      );
      groups.forEach((x) => nominal(options(x[2])));
      return;
    }
    nominal(values, label === "Método de pago" || label === "Concepto" ? ["OTHER"] : []);
    if ([25, 27, 29].includes(number)) {
      assert.equal(values.find((x) => x.selected).id, "new:0");
      assert.equal(values.find((x) => x.id === "new:1").name, "A pendiente (nueva)");
    }
    if ([32, 34].includes(number)) assert.equal(values.find((x) => x.selected).id, state.products[0].id);
    if ([33, 35].includes(number))
      assert.equal(
        values.find((x) => x.selected).id,
        state.formulaIngredients.find(
          (x) =>
            x.formula_id ===
            state.formulas.find((f) => f.product_id === state.products[0].id && f.is_active)?.id,
        )?.ingredient_id,
      );
  });

test("inventario histórico 64 y barrido AST: 31 selectores previos y 2 estados de micros", () => {
  assert.equal(inventory.length, 64);
  assert.equal(new Set(inventory.map((r) => r.ID_selector)).size, 64);
  assert.equal(
    inventory.filter((r) => /NOMINAL_AZ|AGRUPADO_AZ_INTERNO/.test(r.Orden_semantico_propuesto)).length,
    43,
  );
  const actual = new Map();
  function scan(directory) {
    for (const entry of readdirSync(new URL(directory, root), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) scan(file);
      else if (/\.tsx$/.test(file) && file !== "shared/ui/Select.tsx") {
        const source = ts.createSourceFile(
          file,
          readFileSync(new URL(file, root), "utf8"),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
        function visit(node) {
          if (
            (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
            ["Select", "select"].includes(node.tagName.getText(source))
          )
            actual.set(file, (actual.get(file) ?? 0) + 1);
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  ["client", "features", "shared"].forEach(scan);
  // Added in NQP26-20: both are fixed business states, not nominal entity lists.
  const micros = "features/microinsumos/components/MicroInventory.tsx";
  assert.equal(actual.get(micros), 2);
  actual.delete(micros);
  // NQP26-21: fixed document kind, nominal micros and nominal expense descriptions.
  const purchases = "features/microinsumos/components/HistoricalPurchases.tsx";
  assert.equal(actual.get(purchases), 3);
  actual.delete(purchases);
  // NQP26-22: nominal micro selector, verified A–Z in the purchase E2E.
  const receipts = "features/microinsumos/components/OperationalPurchases.tsx";
  assert.equal(actual.get(receipts), 1);
  actual.delete(receipts);
  // NQP26-24: nominal micro selector, synthetic E2E verifies order.
  const microFormulas = "features/microinsumos/components/MicroFormulas.tsx";
  assert.equal(actual.get(microFormulas), 1);
  actual.delete(microFormulas);
  // NQP26-26: fixed recipe family, not a nominal entity list.
  const preparations = "features/microinsumos/components/MicroPreparations.tsx";
  assert.equal(actual.get(preparations), 1);
  actual.delete(preparations);
  // NQP26-25: three nominal preparation/approval selectors, sorted by visible label.
  const substitutions = "features/microinsumos/components/SubstitutionActions.tsx";
  assert.equal(actual.get(substitutions), 3);
  actual.delete(substitutions);
  const journeys = "features/produccion/components/JourneyForm.tsx";
  assert.equal(actual.get(journeys), 1);
  actual.delete(journeys);
  // NQP32: two fixed billing modes, not a list of nominal entities.
  const millCharge = "features/produccion/components/MillChargeForm.tsx";
  assert.equal(actual.get(millCharge), 1);
  actual.delete(millCharge);
  assert.equal(
    [...actual.values()].reduce((a, b) => a + b, 0),
    31,
  );
  const mapped = new Set(
    inventory.filter((r) => /select/i.test(r.Tipo_UI)).map((r) => r.Archivo_componente.replace(/^app\//, "")),
  );
  assert.deepEqual([...actual.keys()].sort(), [...mapped].sort());
});
