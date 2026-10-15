export class PersistenceBusyError extends Error {
  readonly code: "PERSISTENCE_BUSY";
  constructor(cause: unknown);
}
