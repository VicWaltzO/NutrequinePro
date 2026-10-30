import { test } from "node:test";
import assert from "node:assert/strict";
import { createUiHarness } from "./helpers/ui-harness.mjs";
import { seedState } from "../lib/domain.mjs";

test("D10-04/05/08/24: SSR contexto nominal, radio conservador, borrador e habitual", () => {
  const ui = createUiHarness();
  const s = seedState();
  s.customers.push({ id: "customer10", name: "Cliente sintético contexto", is_active: true });
  const props = {
    s,
    record: { customer_id: "customer10", site_id: "site-1" },
    submit() {},
    close() {},
    busy: false,
  };
  const html = ui.renderComponent("features/ventas/components/SaleForm.tsx", "SaleForm", props);
  assert.match(html, /Sede no vinculada/);
  assert.match(html, /Cliente sintético contexto/);
  assert.match(html, /aria-describedby="sale-site-context"/);
  assert.match(html, /type="radio"[^>]*checked=""[^>]*value="ONE_TIME"/);
  assert.match(html, /<legend>Uso de esta sede<\/legend>/);
  const draft = ui.renderComponent("features/ventas/components/SaleForm.tsx", "SaleForm", {
    ...props,
    kind: "draft",
  });
  assert.match(draft, /borrador guardará el destino sin vincularlo/);
  assert.doesNotMatch(draft, /type="radio"/);
  s.customerSites.push({
    id: "link10",
    customer_id: "customer10",
    site_id: "site-1",
    is_active: true,
    is_default: true,
  });
  const linked = ui.renderComponent("features/ventas/components/SaleForm.tsx", "SaleForm", props);
  assert.doesNotMatch(linked, /Sede no vinculada/);
  assert.match(linked, /optgroup label="Sedes del cliente"/);
});
