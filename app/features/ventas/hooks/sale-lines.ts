import type { Product } from "@/lib/domain-types";
import type { SaleLine } from "@/shared/types/forms";
import { productPresentation, presentationSnapshot } from "../../../shared/domain/presentation.mjs";
import { positiveInt, scaled } from "../../../shared/domain/core.mjs";
import { sameSalePresentation } from "../../../shared/domain/sale-line-compatibility.mjs";

type SaleProduct = Pick<Product, "id" | "default_sale_price"> & Partial<Product>;
export const DEFAULT_SALE_BAG_WEIGHT_KG = 25;

export function createSaleLine(product?: SaleProduct): SaleLine {
  return {
    product_id: product?.id ?? "",
    quantity: 1,
    unit_weight_kg: product
      ? productPresentation(product).unit_weight_grams / 1000
      : DEFAULT_SALE_BAG_WEIGHT_KG,
    unit_price: product?.default_sale_price == null ? "" : product.default_sale_price / 100,
  };
}

// Re-selecting a product retains its manual fields and historical identity.
export function selectSaleProduct(row: SaleLine, productId: string, product?: SaleProduct): SaleLine {
  if (row.product_id === productId) return row;
  return {
    ...row,
    ...createSaleLine(product),
    product_id: productId,
    quantity: row.quantity,
    original_item_id: undefined,
    presentation_unit_snapshot: undefined,
    weight_policy_snapshot: undefined,
    unit_weight_grams_snapshot: undefined,
  };
}
export function addSaleProduct(rows: SaleLine[], product: SaleProduct): SaleLine[] {
  const candidates = saleProductCandidates(rows, product);
  if (candidates.length > 1) return rows;
  if (candidates.length === 1) return incrementSaleLine(rows, candidates[0], product);
  const emptyIndex = rows.findIndex((row) => !row.product_id);
  if (emptyIndex === -1) return [...rows, createSaleLine(product)];
  return rows.map((row, index) => (index === emptyIndex ? createSaleLine(product) : row));
}

function normalizedLine(row: SaleLine, product: SaleProduct) {
  const grams = scaled(row.unit_weight_kg, 3);
  return {
    ...presentationSnapshot(product),
    ...(row.original_item_id
      ? {
          presentation_unit_snapshot: row.presentation_unit_snapshot ?? "BAG",
          weight_policy_snapshot: row.weight_policy_snapshot ?? "VARIABLE",
          unit_weight_grams_snapshot: row.unit_weight_grams_snapshot ?? grams,
        }
      : {}),
    product_id: row.product_id,
    unit_weight_kg: grams,
    unit_price: scaled(row.unit_price),
  };
}

export function saleProductCandidates(rows: SaleLine[], product: SaleProduct): number[] {
  const target = normalizedLine(createSaleLine({ ...product, default_sale_price: 0 }), product);
  return rows.flatMap((row, index) => {
    if (row.product_id !== product.id) return [];
    try {
      return sameSalePresentation(normalizedLine(row, product), target) ? [index] : [];
    } catch {
      // Keep an unfinished matching line visible for correction, rather than adding a duplicate.
      return [index];
    }
  });
}

export function canIncrementSaleLine(row: SaleLine, product: SaleProduct): boolean {
  try {
    const normalized = normalizedLine(row, product);
    return normalized.unit_weight_kg > 0 && positiveInt(row.quantity) < 1e7;
  } catch {
    return false;
  }
}

export function incrementSaleLine(rows: SaleLine[], index: number, product: SaleProduct): SaleLine[] {
  const row = rows[index];
  if (!row || !saleProductCandidates(rows, product).includes(index) || !canIncrementSaleLine(row, product))
    return rows;
  return rows.map((line, position) =>
    position === index ? { ...line, quantity: Number(line.quantity) + 1 } : line,
  );
}
