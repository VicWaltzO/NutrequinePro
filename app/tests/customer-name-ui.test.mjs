import { test } from "node:test";
import assert from "node:assert/strict";
import { createUiHarness } from "./helpers/ui-harness.mjs";
import { seedState } from "../lib/domain.mjs";

test("D09-06/07/08/12: SSR aviso y consulta bajo Nombre, guardar bloqueado y propio excluido", () => {
  const ui = createUiHarness();
  const s = seedState();
  s.customers = [
    { id: "candidate", name: "Gonzalo Andrade", code: "CL-SYN", is_active: false, tax_id: "SINTETICO" },
  ];
  const props = {
    s,
    kind: "customer",
    record: { name: "Gonzalo Andrade" },
    submit() {},
    close() {},
    busy: false,
  };
  const html = ui.renderComponent("client/admin/SimpleForm.tsx", "default", props);
  assert.ok(
    html.indexOf('aria-describedby="customer-name-matches"') < html.indexOf("Posible cliente duplicado"),
  );
  assert.ok(html.indexOf("Posible cliente duplicado") < html.indexOf("RUC / identificación</span>"));
  assert.match(html, /Mismo nombre normalizado/);
  assert.match(html, /Consultar ficha de Gonzalo Andrade/);
  assert.match(html, /Inactivo/);
  assert.match(html, /Confirmo que es un cliente diferente con nombre similar/);
  assert.match(html, /class="primary" disabled=""/);
  const own = ui.renderComponent("client/admin/SimpleForm.tsx", "default", {
    ...props,
    record: { id: "candidate", name: "Gonzalo Andrade" },
  });
  assert.doesNotMatch(own, /Posible cliente duplicado/);
});
