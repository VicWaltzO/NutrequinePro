import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "./authentication.mts";

export function cookieValue(request: FastifyRequest, name: string) {
  const matches = (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + "="));
  if (matches.length > 1) throw new HttpError(400, "Cookie ambigua.");
  return matches[0]?.slice(name.length + 1);
}

export function sessionCookie(name: string, token: string, secure: boolean, clear = false) {
  return `${name}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 28800}${secure ? "; Secure" : ""}`;
}

export function verifyCsrf(received: unknown, expected: string) {
  if (
    typeof received !== "string" ||
    !/^[a-f0-9]{64}$/.test(received) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  )
    throw new HttpError(403, "Token CSRF inválido.");
}

export function installHttpSecurity(server: FastifyInstance) {
  server.addHook("onRequest", async (request, reply) => {
    reply.headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
    const expectedHost = "127.0.0.1:" + request.raw.socket.localPort;
    if (request.headers.host !== expectedHost) throw new HttpError(403, "Host inválido.");
    if (
      Object.keys(request.headers).some(
        (name) =>
          name.startsWith("oai-authenticated-user-") ||
          ["x-user-id", "x-authenticated-user-id"].includes(name),
      )
    )
      throw new HttpError(400, "No se aceptan cabeceras de identidad.");
    const expectedOrigin = `${request.protocol}://${expectedHost}`;
    if (request.headers.origin !== undefined && request.headers.origin !== expectedOrigin)
      throw new HttpError(403, "Origen inválido.");
    if (request.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "Origen inválido.");
    if (request.method === "POST") {
      if (request.headers.origin !== expectedOrigin) throw new HttpError(403, "Origen requerido.");
      if (
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "") ||
        request.headers["content-encoding"]
      )
        throw new HttpError(415, "Se requiere JSON UTF-8 sin compresión.");
    }
  });
  server.removeContentTypeParser("application/json");
  server.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
    try {
      const source = new TextDecoder("utf-8", { fatal: true }).decode(body as Buffer);
      done(null, JSON.parse(source));
    } catch {
      done(new HttpError(400, "JSON inválido."));
    }
  });
}
