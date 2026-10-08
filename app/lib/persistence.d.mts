import type { AppState } from './domain-types';
export interface WriteStatement { sql: string; args: (string | number | null)[] }
export function writePlan(before: AppState | null, after: AppState, guard?: string): WriteStatement[];
