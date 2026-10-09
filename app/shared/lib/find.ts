import type { AppState } from "@/lib/domain-types";
import type { Tables } from "@/lib/domain-types";
import type { TableName } from "@/lib/domain-types";
export function find<K extends TableName>(
  s: AppState,
  t: K,
  id: string | null | undefined,
): Tables[K][number] | undefined {
  return s[t].find((x) => x.id === id) as Tables[K][number] | undefined;
}
