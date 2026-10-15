import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { readFileSync } from "node:fs";
import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { verifyDatabase } from "../lib/sqlite/migrations.mjs";
import { selectedFile } from "../lib/sqlite/files.mjs";
import { DomainError } from "../lib/domain.mjs";
import { assertCommandPermission } from "../shared/domain/permissions.mjs";
import type { PersistenceDatabase } from "../lib/persistence-port.ts";
import { createAuthentication, HttpError } from "./authentication.mts";
import type { Authenticated } from "./authentication.mts";
import { openAuthDatabase } from "./auth-database.mts";
import { validateConfig } from "./config.mts";
import { tokenHash } from "./passwords.mts";
import { cookieValue, installHttpSecurity, sessionCookie, verifyCsrf } from "./http-security.mts";

function objectBody(request: FastifyRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body))
    throw new HttpError(400, "Se requiere un objeto JSON.");
  return request.body as Record<string, unknown>;
}
const publicSession = (session: Authenticated) => ({
  actor: session.actor,
  csrf_token: session.csrf_token,
  expires_at: new Date(session.expires_at).toISOString(),
});

/** Dependencies are supplied by composition, never exposed as HTTP routes or configuration switches. */
export async function createLocalServer(
  input: unknown,
  dependencies: {
    clock?: () => number;
    diagnostic?: (event: { request_id: string; category: string }) => void;
  } = {},
) {
  const config = validateConfig(input, true);
  const prepared = verifyDatabase(config.database);
  if (prepared.status !== "managed" || prepared.pending.length)
    throw new Error("Adopte y migre explícitamente la base antes de iniciar.");
  const connection = openSqliteDatabase(config.database);
  let authDatabase: ReturnType<typeof openAuthDatabase> | undefined;
  let server: FastifyInstance | undefined;
  try {
    authDatabase = openAuthDatabase(config.auth_database, connection.filename);
    // The legacy store may bootstrap on a missing settings row. HTTP must never do so.
    const existingOnly: PersistenceDatabase = {
      prepare(sql) {
        if (/^\s*INSERT\s+INTO\s+settings\b/i.test(sql))
          throw new Error("El arranque comercial requiere preparación explícita.");
        return connection.prepare(sql);
      },
      batch: (statements) => connection.batch(statements),
    };
    const store = createStore(() => existingOnly);
    const initial = await store.loadState();
    if (
      !initial ||
      !initial.users.some(
        (user) =>
          user.is_active &&
          user.role === "ADMIN" &&
          authDatabase!.prepare("SELECT user_id FROM credentials WHERE user_id=?").get(user.id),
      )
    )
      throw new Error("Prepare credenciales vinculadas a un administrador activo antes de iniciar.");
    const authentication = createAuthentication(authDatabase, dependencies.clock);
    const cookieName = "nutrequine_" + tokenHash(connection.filename + config.auth_database).slice(0, 16);
    const tls = config.tls_key
      ? {
          key: readFileSync(selectedFile(config.tls_key)),
          cert: readFileSync(selectedFile(config.tls_certificate!)),
        }
      : undefined;
    server = Fastify({
      logger: false,
      trustProxy: false,
      bodyLimit: 250000,
      requestTimeout: 10000,
      connectionTimeout: 15000,
      keepAliveTimeout: 5000,
      serverFactory: (handler) => (tls ? httpsServer(tls, handler) : httpServer(handler)),
    });
    server.server.maxConnections = 64;
    server.server.maxRequestsPerSocket = 100;
    // A custom serverFactory owns these native settings; Fastify does not apply its defaults to it.
    server.server.headersTimeout = 10000;
    server.server.requestTimeout = 10000;
    server.server.keepAliveTimeout = 5000;
    server.server.setTimeout(15000);
    installHttpSecurity(server);
    let tail: Promise<unknown> = Promise.resolve();
    let queued = 0;
    function serialized<T>(operation: () => Promise<T>): Promise<T> {
      if (queued >= 64) return Promise.reject(new HttpError(503, "Servidor ocupado. Vuelva a intentar."));
      queued++;
      const result = tail.then(operation);
      tail = result
        .catch(() => undefined)
        .finally(() => {
          queued--;
        });
      return result;
    }
    const stateNow = async () => {
      const state = await store.loadState();
      if (!state) throw new HttpError(503, "La base requiere preparación administrativa.");
      return state;
    };
    const authorized = async (request: FastifyRequest, write = false) => {
      const state = await stateNow();
      const session = authentication.authenticate(cookieValue(request, cookieName), state);
      if (write) verifyCsrf(request.headers["x-csrf-token"], session.csrf_token);
      return { state, session };
    };
    server.setErrorHandler((error, request, reply) => {
      const details =
        error instanceof Error ? (error as Error & { code?: string; statusCode?: number }) : undefined;
      let status = 503;
      let message = "No se pudo completar la operación. Vuelva a intentar.";
      if (error instanceof HttpError) {
        status = error.status;
        message = error.message;
      } else if (error instanceof DomainError) {
        status = 422;
        message = error.message;
      } else if (details?.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
        status = 413;
        message = "La operación excede el tamaño permitido.";
      } else if (details?.statusCode === 400) {
        status = 400;
        message = "Solicitud inválida.";
      }
      if (status === 503)
        dependencies.diagnostic?.({
          request_id: request.id,
          category: details?.code === "PERSISTENCE_BUSY" ? "SQLITE_BUSY" : "UNAVAILABLE",
        });
      return reply.code(status).send({ error: message });
    });
    server.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "Ruta no encontrada." }));
    server.post("/api/auth/login", (request, reply) =>
      serialized(async () => {
        const body = objectBody(request);
        const session = await authentication.login(body.login, body.password, await stateNow());
        reply.header("Set-Cookie", sessionCookie(cookieName, session.token, request.protocol === "https"));
        return publicSession(session);
      }),
    );
    server.get("/api/auth/session", (request) =>
      serialized(async () => publicSession((await authorized(request)).session)),
    );
    server.post("/api/auth/logout", (request, reply) =>
      serialized(async () => {
        objectBody(request);
        const { session } = await authorized(request, true);
        authentication.logout(session);
        reply.header("Set-Cookie", sessionCookie(cookieName, "", request.protocol === "https", true));
        return { ok: true };
      }),
    );
    server.get("/api/state", (request) =>
      serialized(async () => {
        const { state, session } = await authorized(request);
        return { state, actor: session.actor };
      }),
    );
    server.post("/api/command", (request) =>
      serialized(async () => {
        const { state, session } = await authorized(request, true);
        const command = objectBody(request);
        const duplicate =
          typeof command.request_id === "string" &&
          state.audit.some(
            (entry) => entry.request_id === command.request_id && entry.created_by === session.actor.id,
          );
        if (!duplicate && typeof command.type === "string") {
          try {
            assertCommandPermission(session.actor, command.type);
          } catch {
            throw new HttpError(403, "Permisos insuficientes.");
          }
        }
        if (
          !duplicate &&
          command.type === "USER_SAVE" &&
          command.payload &&
          typeof command.payload === "object"
        ) {
          const payload = command.payload as Record<string, unknown>;
          const admins = state.users.filter((user) => user.is_active && user.role === "ADMIN");
          const linked = admins.filter((user) =>
            authDatabase!.prepare("SELECT user_id FROM credentials WHERE user_id=?").get(user.id),
          );
          if (
            admins.length > 1 &&
            linked.length === 1 &&
            linked[0].id === payload.id &&
            (["OPERATOR", "VIEWER"].includes(String(payload.role)) || payload.is_active === false)
          )
            throw new HttpError(
              422,
              "Vincule credenciales a otro administrador activo antes de retirar el último acceso administrativo local.",
            );
        }
        const outcome = await store.runCommand(command, {
          userId: session.actor.id,
          displayName: session.actor.name,
        });
        if (command.type === "USER_SAVE" && typeof outcome.result === "string")
          authentication.revoke(outcome.result, session.actor.id);
        return outcome;
      }),
    );
    server.post("/api/auth/credentials", (request) =>
      serialized(async () => {
        const { state, session } = await authorized(request, true);
        if (session.actor.role !== "ADMIN")
          throw new HttpError(403, "Se requieren permisos de administrador.");
        const body = objectBody(request);
        const target = state.users.find((user) => user.id === body.user_id);
        if (!target) throw new HttpError(422, "Identidad comercial inexistente.");
        await authentication.setCredential(session.actor, target, body.login, body.password);
        return { ok: true, user_id: target.id };
      }),
    );
    server.post("/api/auth/revoke", (request) =>
      serialized(async () => {
        const { state, session } = await authorized(request, true);
        if (session.actor.role !== "ADMIN")
          throw new HttpError(403, "Se requieren permisos de administrador.");
        const body = objectBody(request);
        if (!state.users.some((user) => user.id === body.user_id))
          throw new HttpError(422, "Identidad comercial inexistente.");
        authentication.revoke(String(body.user_id), session.actor.id);
        return { ok: true };
      }),
    );
    server.addHook("onClose", async () => {
      await tail;
      connection.close();
      authDatabase!.close();
    });
    return {
      server,
      start: async () => {
        try {
          const address = await server!.listen({ host: "127.0.0.1", port: config.port });
          return tls ? address.replace(/^http:/, "https:") : address;
        } catch (error) {
          await server!.close();
          throw error;
        }
      },
      close: () => server!.close(),
    };
  } catch (error) {
    if (server) await server.close();
    connection.close();
    authDatabase?.close();
    throw error;
  }
}
