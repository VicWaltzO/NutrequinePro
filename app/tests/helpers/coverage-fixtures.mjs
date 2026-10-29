import { randomUUID } from "node:crypto";
import { createStore } from "../../lib/application-store.mjs";
import { testDatabase } from "./persistence-fixtures.mjs";
import { salePayload } from "./regression-scenarios.mjs";

export const coverageOptions = { partialReservations: true };
export const coverageIdentity = { userId: "queue-admin", displayName: "Administrador sintético cola" };
export const currentRows = (s, id) => s.saleItems.filter((r) => r.sale_id === id && r.is_current !== false);
export async function coverageFixture(t, database = testDatabase(t)) {
  const store = createStore(() => database.binding, coverageOptions);
  await store.ensureState(coverageIdentity);
  const run = async (type, payload, request_id = randomUUID()) =>
    (await store.runCommand({ type, payload, request_id }, coverageIdentity)).result;
  const customer = await run("CUSTOMER_SAVE", { name: "Cliente sintético cola" });
  const adjustment = (quantity, product_id = "prod-1", weight = quantity * 25, direction = "IN") => ({
    product_id,
    quantity,
    weight_kg: weight,
    direction,
    date: "2026-10-29",
    reason: "Ensayo cola sintética",
  });
  const adjust = (...args) => run("INVENTORY_ADJUST", adjustment(...args));
  const sell = (quantity, delivery_date = "2026-11-01", extra = {}) =>
    run(
      "SALE_SAVE",
      salePayload(customer, {
        items: [{ product_id: "prod-1", quantity, unit_weight_kg: 25, unit_price: 73 }],
        delivery_date,
        ...extra,
      }),
    );
  return { store, run, customer, database, adjustment, adjust, sell, state: () => store.loadState() };
}
