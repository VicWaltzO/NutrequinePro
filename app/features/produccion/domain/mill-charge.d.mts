import type { AppState, ProductionJourneyLine } from "../../../lib/domain-types";
export interface ChargeChange {
  ingredient_id: string;
  quantity_kg?: string | number;
  price_per_kg?: string | number;
}
export interface MillChargeSnapshot {
  mode: "THEORETICAL" | "ACTUAL";
  base_weight_grams: number;
  service_rate_cents_per_tonne: number;
  service_cents: number;
  rows: {
    ingredient_id: string;
    name: string;
    theoretical_grams: number;
    theoretical_price_cents_per_kg: number;
    theoretical_charge: number;
    actual_grams: number;
    actual_price_cents_per_kg: number;
    actual_charge: number;
    difference: number;
  }[];
  theoretical_cents: number;
  actual_cents: number;
  difference_cents: number;
}
export function chargedMacro(
  grams: number,
  price: number,
  quantityKg?: unknown,
  priceSoles?: unknown,
): { actual_grams: number; actual_price_cents_per_kg: number; actual_charge: number };
export function millChargeSnapshot(
  line: ProductionJourneyLine,
  mode?: string,
  changes?: ChargeChange[],
): MillChargeSnapshot;
export function millChargeHistory(
  s: AppState,
  lineId: string,
): { id: string; reason: string; created_at: string; created_by: string; new_snapshot: MillChargeSnapshot }[];
export function millReconcile(context: unknown): string;
export function assertMillChargeIntegrity(before: AppState | null, after: AppState): void;
