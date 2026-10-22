import { cashCreditScenario, productionPayload, salePayload } from "./regression-scenarios.mjs";

/** Only generated synthetic entities; shared by PDF examples and installed-app acceptance. */
export async function documentScenario(session) {
  const ids = await cashCreditScenario({
    ...session,
    run: (type, payload, requestId) =>
      session.run(
        type,
        type === "SALE_SAVE" ? { payment_date: "2026-10-14", ...payload } : payload,
        requestId,
      ),
  });
  const current = await session.state();
  await session.run("CUSTOMER_SAVE", {
    ...current.customers.find((row) => row.id === ids.customer),
    name: "Establo Demostración Álvarez (sintético)",
    contact_name: "María Ejemplo",
    phone: "000000000",
    address: "Dirección de demostración, sin ubicación real",
    site_ids: ["site-1"],
  });
  const corn = await session.run("INGREDIENT_SAVE", {
    name: "Maíz de demostración (sintético)",
    current_price_per_kg: "2.00",
  });
  const supplement = await session.run("INGREDIENT_SAVE", {
    name: "Suplemento de demostración (sintético)",
    current_price_per_kg: "3.00",
  });
  const product = await session.run("PRODUCT_SAVE", {
    name: "Mezcla de demostración (sintética)",
    category: "PREMIUM",
    default_sale_price: "30",
    standard_bag_weight_kg: "25",
    bags_per_nucleus: 4,
    commercial_weight_per_nucleus_kg: "100",
    is_sellable: true,
  });
  await session.run("FORMULA_SAVE", {
    product_id: product,
    valid_from: "2026-09-01",
    ingredients: [
      { ingredient_id: corn, kg_per_nucleus: "75" },
      { ingredient_id: supplement, kg_per_nucleus: "23" },
    ],
  });
  const planned = await session.run(
    "PRODUCTION_SAVE",
    productionPayload({
      products: [{ product_id: product, nuclei_count: 2 }],
      confirm: false,
      notes: "DATOS SINTÉTICOS · Planificación de demostración. Verificar pesaje antes de producir.",
    }),
  );
  await session.run(
    "PRODUCTION_SAVE",
    productionPayload({
      products: [{ product_id: product, nuclei_count: 1 }],
      confirm: true,
      notes: "Producción sintética para el balance.",
    }),
  );
  await session.run("SALE_SAVE", salePayload(ids.customer, { sale_date: "2026-09-20" }));
  const cancelled = await session.run("SALE_SAVE", salePayload(ids.customer));
  await session.run("SALE_CANCEL", { id: cancelled, reason: "Anulación sintética", date: "2026-10-18" });
  await session.run("SALE_SAVE", salePayload(ids.customer, { confirm: false }));
  const original = current.saleItems.find((row) => row.sale_id === ids.secondSale);
  await session.run("SALE_CORRECT", {
    id: ids.secondSale,
    reason: "Rectificación sintética de precio",
    items: [
      {
        original_item_id: original.id,
        product_id: "prod-1",
        quantity: 1,
        unit_price: "10.02",
        unit_weight_kg: "25.001",
      },
    ],
  });
  const corrected = (await session.state()).saleItems.find(
    (row) => row.sale_id === ids.secondSale && row.is_current !== false,
  );
  await session.run("RETURN_CREATE", {
    sale_id: ids.secondSale,
    return_date: "2026-10-17",
    economic_amount: "1.00",
    reason: "Devolución sintética",
    items: [{ sale_item_id: corrected.id, quantity: 1 }],
  });
  const reversed = await session.run("PAYMENT_CREATE", {
    customer_id: ids.customer,
    payment_date: "2026-10-18",
    payment_method: "CASH",
    total_amount: "10.00",
    applications: [],
  });
  await session.run("PAYMENT_REVERSE", { id: reversed, date: "2026-10-19", reason: "Reversión de prueba" });
  await session.run("EXPENSE_CREATE", {
    date: "2026-10-20",
    category: "LOGISTICS",
    description: "Transporte sintético",
    amount: "50",
  });
  return { ...ids, planned, cancelled };
}
