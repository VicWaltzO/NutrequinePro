import type { Product } from "@/lib/domain-types";
import type { SaleLine } from "@/shared/types/forms";
import { productPresentation } from "../../../shared/domain/presentation.mjs";

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

// Preserve a line's snapshot while its product stays the same. A different presentation starts at its own weight.
export function selectSaleProduct(row: SaleLine, productId: string, product?: SaleProduct): SaleLine {
  let weight: SaleLine["unit_weight_kg"] = product
    ? productPresentation(product).unit_weight_grams / 1000
    : DEFAULT_SALE_BAG_WEIGHT_KG;
  if (row.product_id === productId && row.unit_weight_kg !== "") weight = row.unit_weight_kg;
  return {
    ...row,
    product_id: productId,
    ...(row.product_id !== productId
      ? {
          original_item_id: undefined,
          presentation_unit_snapshot: undefined,
          weight_policy_snapshot: undefined,
        }
      : {}),
    unit_price: product?.default_sale_price == null ? "" : product.default_sale_price / 100,
    unit_weight_kg: weight,
  };
}

export function addSaleProduct(rows: SaleLine[], product: SaleProduct): SaleLine[] {
  const emptyIndex = rows.findIndex((row) => !row.product_id);
  if (emptyIndex === -1) return [...rows, createSaleLine(product)];
  return rows.map((row, index) => (index === emptyIndex ? selectSaleProduct(row, product.id, product) : row));
}
