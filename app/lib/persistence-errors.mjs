export class PersistenceBusyError extends Error {
  code = "PERSISTENCE_BUSY";
  constructor(cause) {
    super("La base de datos está ocupada. Vuelva a intentar.", { cause });
    this.name = "PersistenceBusyError";
  }
}
