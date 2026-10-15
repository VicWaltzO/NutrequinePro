import type { AppState, Tables, TableName } from "@/lib/domain-types";

export function find<K extends TableName>(
  state: AppState,
  t: K,
  id: string | null | undefined,
): Tables[K][number] | undefined {
  return state[t].find((x) => x.id === id) as Tables[K][number] | undefined;
}
