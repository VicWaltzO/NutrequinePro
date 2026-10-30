import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createUiHarness } from "./helpers/ui-harness.mjs";
import { inventory } from "./helpers/table-inventory.mjs";
import { productionFormPreview } from "../features/produccion/hooks/production-form-preview.ts";

// Instrument only the boundary: consumers still supply their real rows/accessors.
// Evaluate each accessor in both directions on the real synthetic domain fixture.
const probe = `
import { sortRows } from '../lib/table-sort';
export function SortableTable({heads,rows=[],values,tie,children}) {
 const projections=values.map((value,column)=>value ? ['asc','desc'].map(direction=>sortRows(rows,value,{column,direction},tie).map(({row,originalIndex})=>({index:originalIndex,value:value(row,originalIndex),tie:tie(row,originalIndex)}))) : null);
 return <><pre data-contract="yes">{JSON.stringify({heads,eligible:values.map(Boolean),rows:rows.length,projections})}</pre>{rows.map(children)}</>;
}`;
const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const contracts = (html) =>
  [...html.matchAll(/<pre data-contract="yes">(.*?)<\/pre>/gs)].map((m) => JSON.parse(decode(m[1])));
const ui = createUiHarness((file) => {
  if (file === "shared/ui/SortableTable.tsx") return probe;
  let source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  // Select the customer payments subpage, whose initial component state is all.
  if (file === "features/clientes/components/CustomerDetail.tsx")
    source = source.replace('useState("all")', 'useState("payments")');
  return source;
});
const s = ui.state(),
  customer = s.customers[0],
  production = s.productions[0],
  sale = s.sales[0];
const pending = ui.run("SALE_SAVE", {
  customer_id: customer.id,
  site_id: "site-1",
  sale_date: "2026-10-20",
  payment_condition: "CREDIT",
  items: [{ product_id: "prod-1", quantity: 2, unit_price: 9, unit_weight_kg: 25 }],
  confirm: true,
});
const noop = () => {};
const common = {
  s: s,
  state: s,
  actor: ui.actor,
  write: true,
  admin: true,
  open: noop,
  run: noop,
  submit: noop,
  close: noop,
  busy: false,
  match: () => true,
  filters: null,
  tabs: () => null,
  productCards: null,
  productionList: null,
  saleTable: () => null,
  b: {},
};
// Commands replace the fixture state; use its current immutable snapshot.
common.s = common.state = ui.state();
const fileFor = (id) => inventory.find((x) => x.ID_tabla === id).Archivo_componente.slice(4);
const cases = {
  "BALANCE-MESES": { name: "default" },
  "PERFIL-COBROS": { name: "CustomerDetail", customer },
  "SEDES-DIRECTORIO": { name: "default", tab: "sites", query: "", onQuery: noop },
  "CLIENTES-DIRECTORIO": { name: "default", tab: "all", query: "", onQuery: noop },
  "COBRANZA-HISTORIAL": { name: "default", tab: "payments", pending: [] },
  "COBRO-APLICACIONES": { name: "default", id: common.s.payments[1].id },
  "PAGO-NUEVO-APLICACIONES": { name: "PaymentForm", record: { customer_id: customer.id } },
  "CREDITO-APLICACIONES": { name: "PaymentForm", record: common.s.payments[1], kind: "credit" },
  "CONFIG-PRODUCTOS": { name: "default", tab: "products" },
  "CONFIG-USUARIOS": { name: "default", tab: "users" },
  "CONFIG-AUDITORIA": { name: "default", tab: "audit" },
  "GASTOS-REGISTRO": { name: "default" },
  "INVENTARIO-STOCK": { name: "default", tab: "all" },
  "INVENTARIO-MOVIMIENTOS": { name: "default", tab: "movements" },
  "FORMULA-EDITOR": { name: "FormulaForm", record: common.s.formulas[0] },
  "LOTE-RECTIFICAR-CANTIDADES": { name: "ProductionCorrectionForm", record: production },
  "LOTE-PRODUCTOS": { name: "default", id: production.id, index: 0 },
  "LOTE-SNAPSHOT-INGREDIENTES": { name: "default", id: production.id, index: 1 },
  "LOTE-COSTOS-INSUMOS": { name: "default", id: production.id, index: 3 },
  "LOTE-COSTOS-ADICIONALES": { name: "default", id: production.id, index: 4 },
  "LOTE-FORMULARIO-INSUMOS": {
    name: "ProductionIngredients",
    rows: productionFormPreview(common.s, { "prod-1": 1 }, {}, [], { nucleus_cost: 0, packaging_cost: 0 })
      .ingredients,
    update: noop,
  },
  "PRODUCCION-HISTORIAL": { name: "default", productions: common.s.productions },
  "PRODUCCION-BORRADORES": { name: "default", productions: common.s.productions },
  "BALANCE-LOTES": { name: "default", productions: common.s.productions },
  "PRODUCCION-INSUMOS": { name: "default", tab: "ingredients" },
  "FORMULAS-CATALOGO-INGREDIENTES": { name: "default", tab: "formulas" },
  "LOTE-CONCILIAR-INSUMOS": { name: "ReconcileForm", record: production },
  "VENTA-DEVOLVER-LINEAS": { name: "ReturnForm", record: sale },
  "VENTA-DISPONIBILIDAD-LEGACY": { name: "default", id: pending },
  "VENTA-DETALLE-COMERCIAL": { name: "default", id: sale.id, index: 0 },
  "VENTA-PAGOS-APLICADOS": { name: "default", id: sale.id, index: 1 },
  "VENTA-DEVOLUCION-DETALLE": { name: "default", id: sale.id, index: 2 },
  "VENTAS-RECTIFICACIONES": { name: "default", tab: "corrections" },
  "VENTAS-DEVOLUCIONES": { name: "default", tab: "returns" },
  ...Object.fromEntries(
    [
      "VENTAS-HISTORIAL",
      "VENTAS-FUTURAS",
      "VENTAS-BORRADORES",
      "VENTAS-ANULACIONES",
      "RESUMEN-VENTAS",
      "COBRANZA-PENDIENTES",
      "PERFIL-VENTAS",
    ].map((id) => [
      id,
      {
        name: "default",
        rows: id === "RESUMEN-VENTAS" ? common.s.sales.slice(-5).reverse() : common.s.sales,
        context: id,
      },
    ]),
  ),
  "VENTA-HISTORIA-CAMPOS": { name: "History", type: "SALE", id: sale.id },
  "PRODUCCION-HISTORIA-CAMPOS": { name: "History", type: "PRODUCTION", id: production.id },
};
// Historical production fields are synthetic snapshots, never persistence mutations.
common.s = structuredClone(common.s);
common.state = common.s;
common.s.corrections.push({
  id: "prod-history",
  entity_type: "PRODUCTION",
  entity_id: production.id,
  code: "C-9",
  reason: "fixture",
  created_at: "2026-10-09T00:00:00Z",
});
common.s.correctionFields.push({
  id: "field-prod",
  correction_id: "prod-history",
  field_name: "products",
  old_value: "[]",
  new_value: "[]",
});
for (const [id, props] of Object.entries(cases))
  test("NQP12 cobertura " + id, () => {
    const before = structuredClone(common.s);
    const html = ui.renderComponent(fileFor(id), props.name, { ...common, ...props });
    const expected = inventory.filter((x) => x.ID_tabla === id);
    if (id === "FORMULA-EDITOR") {
      assert.doesNotMatch(html, /table-sort/);
      return;
    }
    const actual = contracts(html)[props.index ?? 0];
    assert.ok(actual, "Debe montar una tabla: " + id);
    assert.deepEqual(
      actual.heads,
      expected.map((x) => x.Etiqueta_columna_real),
    );
    assert.deepEqual(
      actual.eligible,
      expected.map((x) => x.Ordenable_SI_NO === "SI"),
    );
    assert.ok(actual.rows > 0, "Fixture con registros: " + id);
    for (const projection of actual.projections.filter(Boolean))
      for (const [directionIndex, direction] of projection.entries()) {
        assert.equal(direction.length, actual.rows);
        // Independent primary-key oracle, without using the production comparator.
        const primary = (value) => (Array.isArray(value) ? value[0] : value);
        const absent = (value) => value == null || value === "";
        const collator = new Intl.Collator("es-PE", { sensitivity: "base", numeric: true });
        for (let i = 1; i < direction.length; i++) {
          const a = primary(direction[i - 1].value),
            b = primary(direction[i].value);
          if (absent(b)) continue;
          assert.ok(!absent(a), "Missing values must remain last");
          const result =
            typeof a === "number" || typeof a === "boolean" ? Number(a) - Number(b) : collator.compare(a, b);
          assert.ok(directionIndex === 0 ? result <= 0 : result >= 0, id + ": primary semantic order");
        }
        assert.equal(new Set(direction.map((x) => x.index)).size, actual.rows);
        for (const row of direction) {
          assert.ok(row.index >= 0);
          assert.notEqual(row.tie, undefined);
        }
      }
    assert.deepEqual(common.s, before);
  });
test("NQP12 reconciliación 43 UI / 208 SI / 60 NO / 35 PDF", () => {
  assert.equal(Object.keys(cases).length, 43);
  assert.equal(inventory.length, 268);
  assert.equal(inventory.filter((x) => x.Ordenable_SI_NO === "SI").length, 208);
  assert.equal(inventory.filter((x) => x.Ordenable_SI_NO === "NO").length, 60);
  assert.equal(inventory.filter((x) => x.ID_tabla.startsWith("PDF-")).length, 35);
});
