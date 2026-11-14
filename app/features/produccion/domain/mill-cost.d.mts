import type { AppState } from "../../../lib/domain-types";
export interface Fraction {
  n: string;
  d: string;
}
export interface CostExtra {
  amount_cents: number;
  description: string;
  reference: string;
}
export interface CostInput {
  version: number;
  packaging_cents: number;
  packaging_reference: string;
  extras: CostExtra[];
  reviewed_costs: boolean;
}
export function roundedCost(value: Fraction | null): number | null;
export function millCostInputSnapshot(payload: unknown): CostInput;
export function millCostHistory(
  s: AppState,
  lineId: string,
): { id: string; reason: string; created_at: string; created_by: string; new_snapshot: CostInput }[];
export function millCostSummary(
  s: AppState,
  lineId: string,
): {
  basis: string;
  complete: boolean;
  micro: Fraction | null;
  macros_cents: number | null;
  service_cents: number | null;
  packaging_cents: number | null;
  extras_cents: number | null;
  total: Fraction | null;
  unit: Fraction | null;
  actual_bags: number | null;
  charge_id: string | null;
  input_id: string | null;
};
export function millCostInputs(context: unknown): string;
export function assertMillCostIntegrity(before: AppState | null, s: AppState): void;
