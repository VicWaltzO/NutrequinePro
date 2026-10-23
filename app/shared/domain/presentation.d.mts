import type { Product, PresentationUnit, WeightPolicy, StockEntryMode } from "../types/domain.ts";
type PresentationRecord = Partial<Product> & {
  presentation_unit_snapshot?: PresentationUnit;
  unit_weight_grams_snapshot?: number;
  weight_policy_snapshot?: WeightPolicy;
  unit_weight_kg?: number;
};
export function productPresentation(product?: Partial<Product>): {
  presentation_unit: PresentationUnit;
  unit_weight_grams: number;
  weight_policy: WeightPolicy;
  stock_entry_mode: StockEntryMode;
};
export function unitLabels(record?: {
  presentation_unit?: PresentationUnit;
  presentation_unit_snapshot?: PresentationUnit;
}): { singular: string; plural: string };
export function presentationSnapshot(
  record: PresentationRecord,
  historical?: boolean,
): {
  presentation_unit_snapshot: PresentationUnit;
  unit_weight_grams_snapshot: number;
  weight_policy_snapshot: WeightPolicy;
};
export function isNucleusProduct(product: Partial<Product>): boolean;
export function validatePresentation(presentation: ReturnType<typeof productPresentation>): void;
export function validateNucleusWeight(product: Partial<Product>): void;
export function assertUnitWeight(snapshot: ReturnType<typeof presentationSnapshot>, weight: number): void;
export const PRESENTATION_UNITS: PresentationUnit[];
