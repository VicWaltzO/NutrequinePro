import { label } from "@/shared/lib/format";
export function Badge({ value }: { value: string }) {
  return <span className={"badge status-" + value}>{label(value)}</span>;
}
