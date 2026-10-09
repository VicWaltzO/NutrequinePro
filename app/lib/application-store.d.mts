import type { AppState, CommandResult } from "./domain-types";
export interface Identity {
  userId: string;
  displayName: string;
}
export interface ApplicationStore {
  loadState: () => Promise<AppState | null>;
  persistState: (before: AppState | null, after: AppState) => Promise<void>;
  ensureState: (identity: Identity) => Promise<AppState>;
  runCommand: (input: unknown, identity: Identity) => Promise<CommandResult>;
}
export function createStore(binding: () => D1Database): ApplicationStore;
