import type { AppState, Correction, MicroConfirmation, Rational } from "../../../shared/types/domain";
export const RECTIFICATION: string;
export interface RectificationSnapshot {
  version: number;
  confirmation_id: string;
  nuclei_hundredths: number;
  usable_nuclei_hundredths: number;
  total_cost_cents: Rational;
  mode: "ORIGINAL" | "PHYSICAL" | "AUDIT_ONLY";
  delta_cost_cents?: Rational;
  date?: string;
  reference?: string;
  lines?: {
    issue_id: string;
    micro_ingredient_id: string;
    quantity_delta_hundredths: number;
    cost_delta_cents: Rational;
  }[];
}
export function correctedPreparation(s: AppState, confirmation: MicroConfirmation): RectificationSnapshot;
export function rectificationHistory(
  s: AppState,
  preparationId: string,
): (Correction & { old_snapshot: RectificationSnapshot; new_snapshot: RectificationSnapshot })[];
