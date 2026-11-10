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
// Exact decimal kg: one hundredth of a gram = 0.00001 kg.
export function exactKg(value: number) {
  return `${Math.floor(value / 100000)}.${String(value % 100000).padStart(5, "0")}`;
}

export function rationalMoney(value: { n: string; d: string }) {
  const n = BigInt(value.n);
  const d = BigInt(value.d);
  const cents = (n * BigInt(2) + d) / (BigInt(2) * d);
  return `S/ ${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}
