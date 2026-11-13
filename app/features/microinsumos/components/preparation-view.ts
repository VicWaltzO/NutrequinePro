import { weight } from "@/shared/lib/format";
export interface Evaluation {
  assignment_id: string | null;
  assignment_status: "ASSIGNED" | "UNASSIGNED";
  id: string;
  sufficiency: "MISSING" | "POTENTIALLY_RESUMABLE";
  items: {
    micro_ingredient_id: string;
    name: string;
    operational_id: number;
    required_hundredths: number;
    physical_hundredths: number;
    assigned_hundredths: number;
    own_assigned_hundredths: number;
    available_hundredths: number;
    missing_hundredths: number;
    stock_source: string;
  }[];
}
// Domain values stay in hundredths of a gram; round only for display.
export function preparationWeight(value: number) {
  return weight(value / 100);
}

export function rationalMoney(value: { n: string; d: string }) {
  const n = BigInt(value.n);
  const d = BigInt(value.d);
  const cents = (n * BigInt(2) + d) / (BigInt(2) * d);
  return `S/ ${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}
