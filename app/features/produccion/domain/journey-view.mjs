import { pick } from "../../../shared/domain/core.mjs";
import { MICRO_FAMILIES } from "../../microinsumos/domain/formulas.mjs";
export function journeyFamily(product) {
  return Object.keys(MICRO_FAMILIES).find((family) => MICRO_FAMILIES[family].includes(product.name)) ?? null;
}
// Exact references, not another ledger: a shared confirmation is attributed by explicit nuclei.
function fraction(n, d) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(n, d);
  return { n: String(n / divisor), d: String(d / divisor) };
}
function coverageStatus(complete, partial) {
  if (complete) return "READY";
  if (partial) return "PARTIAL";
  return "PENDING";
}
export function journeySummary(s, journey) {
  const lines = s.productionJourneyLines
    .filter((l) => l.journey_id === journey.id)
    .map((line) => {
      const links = s.productionJourneyLinks
        .filter((l) => l.line_id === line.id)
        .map((link) => {
          const confirmation = pick(s, "microConfirmations", link.confirmation_id);
          const ratio = BigInt(link.nuclei_hundredths);
          const denominator = BigInt(confirmation.nuclei_hundredths);
          const cost = confirmation.total_cost_cents;
          return {
            ...link,
            formula_id: confirmation.formula_id,
            group_reference:
              s.microPreparationGroups.find((g) => g.preparation_id === link.preparation_id)
                ?.group_reference ?? null,
            cost_cents: fraction(BigInt(cost.n) * ratio, BigInt(cost.d) * denominator),
            consumptions: s.microIssues
              .filter((i) => i.confirmation_id === confirmation.id)
              .map((i) => ({
                issue_id: i.id,
                micro_ingredient_id: i.micro_ingredient_id,
                quantity_hundredths: fraction(BigInt(i.quantity_hundredths) * ratio, denominator),
              })),
          };
        });
      const confirmed_hundredths = links.reduce((n, l) => n + l.nuclei_hundredths, 0);
      return {
        ...line,
        links,
        confirmed_hundredths,
        status: coverageStatus(confirmed_hundredths === line.nuclei_hundredths, confirmed_hundredths > 0),
      };
    });
  return {
    ...journey,
    lines,
    status: coverageStatus(
      lines.length && lines.every((l) => l.status === "READY"),
      lines.some((l) => l.confirmed_hundredths > 0),
    ),
  };
}
