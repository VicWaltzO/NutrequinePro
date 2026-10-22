import type { Product } from "@/lib/domain-types";
import type { SaleLine } from "@/shared/types/forms";

type SaleProduct = Pick<Product, "id" | "default_sale_price">;
export const DEFAULT_SALE_BAG_WEIGHT_KG = 25;

export function createSaleLine(product?: SaleProduct): SaleLine {
  return {
    product_id: product?.id ?? "",
    quantity: 1,
    unit_weight_kg: DEFAULT_SALE_BAG_WEIGHT_KG,
    unit_price: product ? product.default_sale_price / 100 : "",
  };
}

// Choosing a presentation must not erase an explicit weight or historical snapshot.
export function selectSaleProduct(row: SaleLine, productId: string, product?: SaleProduct): SaleLine {
  return {
    ...row,
    product_id: productId,
    unit_price: product ? product.default_sale_price / 100 : "",
    unit_weight_kg: row.unit_weight_kg === "" ? DEFAULT_SALE_BAG_WEIGHT_KG : row.unit_weight_kg,
  };
}

export function addSaleProduct(rows: SaleLine[], product: SaleProduct): SaleLine[] {
  const emptyIndex = rows.findIndex((row) => !row.product_id);
  if (emptyIndex === -1) return [...rows, createSaleLine(product)];
  return rows.map((row, index) => (index === emptyIndex ? selectSaleProduct(row, product.id, product) : row));
}
