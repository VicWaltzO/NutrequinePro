import { test } from "node:test";
import assert from "node:assert/strict";
import { orderNominal } from "../shared/lib/nominal-order.mjs";
import { createUiHarness } from "./helpers/ui-harness.mjs";

const ids = (rows) => rows.map((row) => row.id);
test("orden nominal: español natural, copia, objetos intactos, vacío y códigos numéricos", () => {
  const source = Object.freeze([
    Object.freeze({ id: "z", name: "Zeta" }),
    Object.freeze({ id: "ten", name: "arbol 10" }),
    Object.freeze({ id: "two", name: "Árbol 2" }),
  ]);
  const result = orderNominal(
    source,
    (x) => x.name,
    (x) => x.id,
  );
  assert.deepEqual(ids(result), ["two", "ten", "z"]);
  assert.equal(result[0], source[2]);
  assert.deepEqual(ids(source), ["z", "ten", "two"]);
  assert.deepEqual(orderNominal([], String), []);
  assert.deepEqual(orderNominal(["PR-10", "PR-2", "PR-1"], String), ["PR-1", "PR-2", "PR-10"]);
  assert.deepEqual(orderNominal(["Producto 10", "Producto 2"], String), ["Producto 2", "Producto 10"]);
});
test("orden nominal: empates normalizados, IDs y último recurso de posición, sin alternar", () => {
  const rows = [
    { id: "z", name: "ÁRBOL" },
    { id: "a", name: "árbol" },
    { id: "b", name: "arbol" },
  ];
  const sort = (rows) =>
    orderNominal(
      rows,
      (x) => x.name,
      (x) => x.id,
    );
  assert.deepEqual(ids(sort(rows)), ["b", "a", "z"]);
  assert.deepEqual(ids(sort([...rows].reverse())), ["b", "a", "z"]);
  const duplicates = [
    { name: "A", marker: 1 },
    { name: "a", marker: 2 },
  ];
  assert.deepEqual(
    orderNominal(duplicates, (x) => x.name),
    duplicates,
  );
  assert.deepEqual(sort(sort(rows)), sort(rows));
});
test("Select nominal: etiqueta traducida, OTHER final, placeholder y selección por ID; preserve por defecto", () => {
  const h = createUiHarness();
  const render = (props) =>
    h.renderComponent("shared/ui/Select.tsx", "Select", {
      label: "Prueba",
      value: "TRANSFER",
      onChange() {},
      options: ["CASH", "TRANSFER", "CHECK", "OTHER"],
      ...props,
    });
  const values = (html) => [...html.matchAll(/<option[^>]*value="([^"]*)"/g)].map((x) => x[1]);
  assert.deepEqual(values(render({})), ["", "CASH", "TRANSFER", "CHECK", "OTHER"]);
  const html = render({ order: "nominal", fixedLast: ["OTHER"], empty: "Todos" });
  assert.deepEqual(values(html), ["", "CHECK", "CASH", "TRANSFER", "OTHER"]);
  assert.match(html, /value="TRANSFER" selected=""/);
  assert.match(html, /value="">Todos/);
  for (const empty of ["Todas", "Sin asignar", "Elegir en cada operación", false]) {
    const result = render({ order: "nominal", empty });
    assert.equal(values(result)[0], empty === false ? "CHECK" : "");
  }
  assert.deepEqual(values(render({ order: "nominal", options: ["CASH", "TRANSFER", "CHECK"] })), [
    "",
    "CHECK",
    "CASH",
    "TRANSFER",
  ]);
});
test("Select nominal: carga, alta, edición y refresco cambian vista sin sustituir selección", () => {
  const h = createUiHarness();
  const render = (options) =>
    h.renderComponent("shared/ui/Select.tsx", "Select", {
      label: "Prueba",
      order: "nominal",
      options,
      value: "z",
      onChange() {
        assert.fail("ordenar no emite onChange");
      },
    });
  assert.match(render([]), /<option value="">Seleccionar/);
  const source = [
    { id: "z", name: "Zeta" },
    { id: "a", name: "Árbol 2" },
  ];
  const first = render(source);
  assert.ok(first.indexOf('value="a"') < first.indexOf('value="z"'));
  const renamed = render([{ ...source[0], name: "A" }, source[1], { id: "new", name: "Árbol 10" }]);
  assert.ok(renamed.indexOf('value="z"') < renamed.indexOf('value="a"'));
  assert.match(renamed, /value="z" selected=""/);
  assert.deepEqual(
    source.map((x) => x.name),
    ["Zeta", "Árbol 2"],
  );
});
