import type { DatabaseSync } from "node:sqlite";
import type { AppState, User } from "../shared/types/domain.ts";
import { transaction } from "../lib/sqlite/files.mjs";
import { checkPassword, csrfToken, hashPassword, loginName, newToken, tokenHash } from "./passwords.mts";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Credential {
  user_id: string;
  login: string;
  salt: string;
  hash: string;
  algorithm: string;
  version: number;
}
interface Session {
  token_hash: string;
  user_id: string;
  credential_version: number;
  role: string;
  created_at: number;
  expires_at: number;
}
export interface Authenticated {
  actor: User;
  token: string;
  csrf_token: string;
  expires_at: number;
}

export function createAuthentication(database: DatabaseSync, clock = Date.now) {
  const event = (action: string, actor: string | null, target: string | null) => {
    database
      .prepare("INSERT INTO security_events(event,actor_id,target_id,created_at) VALUES (?,?,?,?)")
      .run(action, actor, target, clock());
  };
  const credentialFor = (userId: string) =>
    database.prepare("SELECT * FROM credentials WHERE user_id=?").get(userId) as unknown as
      | Credential
      | undefined;

  function revoke(userId: string, actorId: string) {
    transaction(
      database,
      () => {
        database.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
        event("REVOKE", actorId, userId);
      },
      true,
    );
  }

  function reserveAttempt(login: string) {
    transaction(
      database,
      () => {
        const now = clock();
        database.prepare("DELETE FROM attempts WHERE expires_at<=?").run(now);
        for (const [bucket, limit, window] of [
          ["global", 30, 60000],
          ["login:" + tokenHash(login), 5, 900000],
        ] as const) {
          const current = database.prepare("SELECT count FROM attempts WHERE bucket=?").get(bucket);
          if (current && Number(current.count) >= limit)
            throw new HttpError(429, "Demasiados intentos. Espere antes de volver a intentar.");
          if (!current && Number(database.prepare("SELECT count(*) AS n FROM attempts").get()?.n) >= 1024)
            throw new HttpError(429, "Demasiados intentos. Espere antes de volver a intentar.");
          database
            .prepare("INSERT INTO attempts VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1")
            .run(bucket, now + window);
        }
      },
      true,
    );
  }

  async function login(loginInput: unknown, password: unknown, state: AppState): Promise<Authenticated> {
    let login: string;
    try {
      login = loginName(loginInput);
    } catch {
      throw new HttpError(400, "Datos de acceso inválidos.");
    }
    if (typeof password !== "string" || Buffer.byteLength(password) > 1024 || !password.length)
      throw new HttpError(400, "Datos de acceso inválidos.");
    reserveAttempt(login);
    const credential = database.prepare("SELECT * FROM credentials WHERE login=?").get(login) as unknown as
      | Credential
      | undefined;
    const valid = await checkPassword(
      password,
      credential?.salt ?? "00000000000000000000000000000000",
      credential?.hash ?? "00".repeat(64),
    );
    const actor = state.users.find((user) => user.id === credential?.user_id && user.is_active);
    if (!valid || !credential || credential.algorithm !== "scrypt-N131072-r8-p1" || !actor)
      throw new HttpError(401, "Credenciales inválidas.");
    const token = newToken();
    const now = clock();
    const expires = now + 8 * 60 * 60 * 1000;
    transaction(
      database,
      () => {
        // Reject a password reset by another process while scrypt was running.
        if (credentialFor(actor.id)?.version !== credential.version)
          throw new HttpError(401, "Credenciales inválidas.");
        database.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now);
        database
          .prepare(
            "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT -1 OFFSET 9)",
          )
          .run(actor.id);
        database
          .prepare("INSERT INTO sessions VALUES (?,?,?,?,?,?)")
          .run(tokenHash(token), actor.id, credential.version, actor.role, now, expires);
        database.prepare("DELETE FROM attempts WHERE bucket=?").run("login:" + tokenHash(login));
        event("LOGIN", actor.id, actor.id);
      },
      true,
    );
    return { actor, token, csrf_token: csrfToken(token), expires_at: expires };
  }

  function authenticate(token: string | undefined, state: AppState): Authenticated {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new HttpError(401, "Inicie sesión para continuar.");
    const session = database
      .prepare("SELECT * FROM sessions WHERE token_hash=?")
      .get(tokenHash(token)) as unknown as Session | undefined;
    if (!session || session.expires_at <= clock()) {
      if (session) database.prepare("DELETE FROM sessions WHERE token_hash=?").run(session.token_hash);
      throw new HttpError(401, "Inicie sesión para continuar.");
    }
    const actor = state.users.find((user) => user.id === session.user_id && user.is_active);
    if (
      !actor ||
      actor.role !== session.role ||
      credentialFor(session.user_id)?.version !== session.credential_version
    ) {
      revoke(session.user_id, session.user_id);
      throw new HttpError(403, "Su acceso cambió. Inicie sesión nuevamente o consulte al administrador.");
    }
    return { actor, token, csrf_token: csrfToken(token), expires_at: session.expires_at };
  }

  function logout(session: Authenticated) {
    transaction(
      database,
      () => {
        database.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(session.token));
        event("LOGOUT", session.actor.id, session.actor.id);
      },
      true,
    );
  }

  async function setCredential(actor: User, target: User, loginInput: unknown, passwordInput: unknown) {
    if (actor.role !== "ADMIN") throw new HttpError(403, "Se requieren permisos de administrador.");
    if (!target.is_active) throw new HttpError(422, "El usuario debe estar activo.");
    let login: string;
    let password: Awaited<ReturnType<typeof hashPassword>>;
    try {
      login = loginName(loginInput);
      if (typeof passwordInput !== "string") throw new Error();
      password = await hashPassword(passwordInput);
    } catch {
      throw new HttpError(
        400,
        "Credenciales nuevas inválidas: acceso de 3 a 80 caracteres ASCII y contraseña de 15 caracteres a 1024 bytes.",
      );
    }
    transaction(
      database,
      () => {
        const occupied = database.prepare("SELECT user_id FROM credentials WHERE login=?").get(login);
        if (occupied && occupied.user_id !== target.id)
          throw new HttpError(409, "Nombre de acceso no disponible.");
        database
          .prepare(
            "INSERT INTO credentials VALUES (?,?,?,?,?,1) ON CONFLICT(user_id) DO UPDATE SET login=excluded.login,salt=excluded.salt,hash=excluded.hash,algorithm=excluded.algorithm,version=credentials.version+1",
          )
          .run(target.id, login, password.salt, password.hash, password.algorithm);
        database.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
        event("CREDENTIAL_SET", actor.id, target.id);
      },
      true,
    );
  }

  return { login, authenticate, logout, setCredential, revoke };
}
