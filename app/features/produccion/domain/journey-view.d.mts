import type {
  AppState,
  Product,
  ProductionJourney,
  ProductionJourneyLine,
  ProductionJourneyLink,
  Rational,
  MillClosure,
} from "../../../shared/types/domain";
export function journeyFamily(product: Product): string | null;
export interface JourneyLineSummary extends ProductionJourneyLine {
  closure: MillClosure | null;
  confirmed_hundredths: number;
  status: string;
  links: (ProductionJourneyLink & {
    formula_id: string;
    group_reference: string | null;
    cost_cents: Rational;
    consumptions: { issue_id: string; micro_ingredient_id: string; quantity_hundredths: Rational }[];
  })[];
}
export function journeySummary(
  state: AppState,
  journey: ProductionJourney,
): ProductionJourney & { lines: JourneyLineSummary[]; status: string };
