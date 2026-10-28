import type { AppState, SaleItem } from "@/lib/domain-types";
import type { SaleLine } from "@/shared/types/forms";
import { stock } from "../../inventario/domain/stock.mjs";

export function saleLineSubtotal(row: SaleLine): number {
  if (!row.product_id) return 0;
  const subtotal = Math.round(Number(row.quantity) * Number(row.unit_price) * 100);
  return Number.isSafeInteger(subtotal) && subtotal >= 0 ? subtotal : 0;
}

// Form previews retain the current UI rounding; command validation remains authoritative.
export function saleFormPreview(
  state: AppState,
  rows: SaleLine[],
  old: SaleItem[],
  restoreDeliveredStock: boolean,
) {
  const grouped: Record<string, { q: number; w: number }> = {};
  rows.forEach((r) => {
    if (!r.product_id) return;
    grouped[r.product_id] ??= { q: 0, w: 0 };
    grouped[r.product_id].q += Number(r.quantity) || 0;
    grouped[r.product_id].w += (Number(r.quantity) || 0) * (Number(r.unit_weight_kg) || 0) * 1000;
  });
  const missing = Object.entries(grouped).filter(
    ([id, a]) =>
      id &&
      (a.q >
        stock(state, id).quantity +
          (restoreDeliveredStock
            ? old.filter((x) => x.product_id === id).reduce((n: number, x) => n + x.quantity, 0)
            : 0) ||
        a.w >
          stock(state, id).weight_kg +
            (restoreDeliveredStock
              ? old.filter((x) => x.product_id === id).reduce((n: number, x) => n + x.total_weight_kg, 0)
              : 0)),
  );
  const total = rows.reduce((a, r) => a + saleLineSubtotal(r), 0);

  return { missing, total };
}
