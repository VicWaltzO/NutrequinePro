import type { AppState, ProductionSummary, SaleSummary } from "../../../shared/types/domain.ts";
import { requireValue, sum } from "../../../shared/domain/core.mjs";
import { productionSummary } from "../../produccion/domain/summary.mjs";
import { saleSummary } from "../../ventas/domain/summary.mjs";
import { baseReport } from "./common.ts";

export function productionReport(state: AppState, id: string, generatedAt: string) {
  const production = state.productions.find((record) => record.id === id);
  requireValue(production, "No se encontró el lote solicitado.");
  const record = production!;
  const summary: ProductionSummary = productionSummary(state, record);
  const products = summary.products.map((row: AppState["productionProducts"][number]) => ({
    name: state.products.find((product) => product.id === row.product_id)?.name ?? row.product_id,
    nuclei: row.nuclei_count,
    bagsPerNucleus:
      row.bags_per_nucleus_snapshot ?? (row.nuclei_count ? row.bags_produced / row.nuclei_count : 0),
    bags: row.bags_produced,
    commercialWeight: row.commercial_weight_kg,
    formulaWeight: row.formula_weight_kg,
  }));
  const ingredientIds = [
    ...new Set<string>(
      summary.ingredients.map((row: AppState["productionIngredients"][number]) => row.ingredient_id),
    ),
  ];
  const ingredients = ingredientIds.map((ingredientId) => ({
    name: state.ingredients.find((ingredient) => ingredient.id === ingredientId)?.name ?? ingredientId,
    weight: sum(
      summary.ingredients.filter(
        (row: AppState["productionIngredients"][number]) => row.ingredient_id === ingredientId,
      ),
      (row: AppState["productionIngredients"][number]) => row.total_kg,
    ),
  }));
  return {
    ...baseReport(
      state,
      "production",
      record.status === "DRAFT" ? "Lote a producir" : "Hoja de producción",
      record.code,
      record.production_date,
      generatedAt,
    ),
    status: record.status,
    notes: record.notes ?? "",
    cancellationReason: record.cancellation_reason,
    products,
    ingredients,
    bags: summary.bags,
    commercialWeight: summary.weight,
    formulaWeight: sum(products, (row: { formulaWeight: number }) => row.formulaWeight),
    requiredWeight: sum(ingredients, (row: { weight: number }) => row.weight),
  };
}

/** Explicit allowlist: no formula, ingredient, production cost or industrial snapshot. */
export function saleReport(state: AppState, id: string, generatedAt: string) {
  const sale = state.sales.find((record) => record.id === id);
  requireValue(sale, "No se encontró la venta solicitada.");
  const record = sale!;
  const summary: SaleSummary = saleSummary(state, record);
  const customer = state.customers.find((row) => row.id === record.customer_id);
  return {
    ...baseReport(state, "sale", "Nota de venta interna", record.code, record.sale_date, generatedAt),
    status: record.commercial_status,
    fulfillment: record.fulfillment_status,
    financial: summary.financial_status,
    paymentCondition: record.payment_condition,
    customer: {
      name: customer?.name ?? record.customer_id,
      code: customer?.code,
      taxId: customer?.tax_id,
      address: customer?.address,
      phone: customer?.phone,
    },
    site: state.sites.find((row) => row.id === record.site_id)?.name ?? record.site_id,
    items: summary.items.map((row: AppState["saleItems"][number]) => ({
      name: state.products.find((product) => product.id === row.product_id)?.name ?? row.product_id,
      bags: row.quantity,
      bagWeight: row.unit_weight_kg,
      weight: row.total_weight_kg,
      price: row.unit_price,
      subtotal: row.subtotal,
    })),
    gross: summary.gross,
    returned: summary.returned,
    total: summary.total,
    applied: summary.paid,
    balance: summary.balance,
    notes: record.notes ?? "",
    cancellationReason: record.cancellation_reason,
    hasCorrections: state.corrections.some((row) => row.entity_type === "SALE" && row.entity_id === id),
  };
}

export type ProductionReport = ReturnType<typeof productionReport>;
export type SaleReport = ReturnType<typeof saleReport>;
