import type { AppState, Rational, PresentationSnapshot } from "../../../shared/types/domain";
export interface CostFlow {
  id: string;
  sequence: number;
  kind: string;
  key: string;
  product_id: string;
  quantity: number;
  presentation: PresentationSnapshot;
  amount: Rational | null;
  effective: Rational | null;
  recognized: boolean;
  return_of?: string | null;
  source_id?: string;
  source_type?: string;
  movement_type?: string;
  sale_item_id?: string;
}
export interface CostGroup {
  key: string;
  product_id: string;
  quantity: number;
  presentation: PresentationSnapshot;
  value: Rational | null;
  average: Rational | null;
  pending: number;
}
export function commercialCosts(s: AppState): { active: boolean; groups: CostGroup[]; flows: CostFlow[] };
export function costMoney(value: Rational | null): number | null;
export function saleCommercialCost(s: AppState, id: string): { status: string; cost: Rational | null };
export function costHistory(s: AppState): {
  id: string;
  reason: string;
  created_at: string;
  new_snapshot: {
    kind: string;
    sequence: number;
    reference?: string;
    target_id?: string;
    id: string;
    amount?: Rational;
    values?: { id: string; amount: Rational }[];
  };
}[];
export function costKey(move: object): string;
export const costCommands: string[];
export function assertCommercialCostIntegrity(before: AppState | null, s: AppState): void;
