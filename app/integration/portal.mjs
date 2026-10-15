// Local integration example, not an ERP or a gateway for a public network.
import { createServer, request } from "node:http";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { validateBasePath } from "./paths.mjs";

function localModuleUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Seleccione http://127.0.0.1:PUERTO/ sin credenciales ni rutas.");
  return url;
}

function fail(response, status, message) {
  response.removeHeader("Content-Length");
  response.removeHeader("Set-Cookie");
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: message }));
}

function remountCookie(cookie, prefix) {
  if (
    !/^nutrequine_[a-f0-9]{16}=/.test(cookie) ||
    !cookie.includes("; Path=/api;") ||
    /;\s*Domain=/i.test(cookie) ||
    !cookie.includes("; HttpOnly;") ||
    !cookie.includes("SameSite=Strict")
  )
    throw new Error("Cookie del módulo inesperada.");
  return cookie.replace("; Path=/api;", `; Path=${prefix}api;`);
}

export function createPortal({ moduleUrl, mode = "A", prefix = "/modulos/nutrequine/" }) {
  const upstream = localModuleUrl(moduleUrl);
  validateBasePath(prefix);
  if (!["A", "B"].includes(mode) || prefix === "/") throw new Error("Modo o prefijo inválido.");
  const server = createServer(async (incoming, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    const host = "127.0.0.1:" + incoming.socket.localPort;
    const origin = "http://" + host;
    const uniqueHeaders = new Set(["host", "origin", "cookie", "content-type", "x-csrf-token"]);
    const received = new Set();
    for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
      const name = incoming.rawHeaders[index].toLowerCase();
      if (uniqueHeaders.has(name) && received.has(name)) return fail(response, 400, "Cabecera ambigua.");
      received.add(name);
    }
    if (upstream.host === host) return fail(response, 503, "El módulo debe usar otro puerto.");
    if (
      incoming.headers.host !== host ||
      (incoming.headers.origin !== undefined && incoming.headers.origin !== origin) ||
      incoming.headers["sec-fetch-site"] === "cross-site"
    )
      return fail(response, 403, "Host u origen inválido.");
    if (
      Object.keys(incoming.headers).some(
        (name) =>
          name.startsWith("oai-authenticated-user-") ||
          [
            "x-user-id",
            "x-authenticated-user-id",
            "x-forwarded-host",
            "x-forwarded-proto",
            "forwarded",
          ].includes(name),
      )
    )
      return fail(response, 400, "No se aceptan cabeceras de identidad ni de proxy.");
    if (!["GET", "HEAD", "POST"].includes(incoming.method)) return fail(response, 405, "Método no admitido.");
    const rawPath = incoming.url?.split("?")[0] ?? "";
    if (
      !/^\/[a-zA-Z0-9_./-]*$/.test(rawPath) ||
      rawPath.includes("//") ||
      rawPath.split("/").some((segment) => segment === "." || segment === "..")
    )
      return fail(response, 400, "Ruta inválida.");
    if (rawPath === "/" && incoming.method === "GET") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      const href = mode === "A" ? upstream.href : prefix;
      return response.end(
        `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Portal de demostración</title><h1>Portal de demostración</h1><p>Ejemplo de navegación. No es un ERP corporativo.</p><nav><a href="${href}">Abrir Nutrequine Pro</a></nav></html>`,
      );
    }
    if (mode !== "B" || !rawPath.startsWith(prefix)) return fail(response, 404, "Ruta no encontrada.");
    if (incoming.method === "POST" && incoming.headers.origin !== origin)
      return fail(response, 403, "Origen requerido.");
    if (
      incoming.method === "POST" &&
      (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(incoming.headers["content-type"] ?? "") ||
        incoming.headers["content-encoding"])
    )
      return fail(response, 415, "Se requiere JSON UTF-8 sin compresión.");
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 250000) return fail(response, 413, "La operación excede el tamaño permitido.");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const headers = { Host: upstream.host };
      for (const name of ["accept", "content-type", "x-csrf-token"])
        if (incoming.headers[name] !== undefined) headers[name] = incoming.headers[name];
      const cookies = (incoming.headers.cookie ?? "")
        .split(";")
        .map((part) => part.trim())
        .filter((part) => /^nutrequine_[a-f0-9]{16}=/.test(part));
      if (cookies.length) headers.cookie = cookies.join("; ");
      if (incoming.headers.origin) headers.Origin = upstream.origin;
      if (incoming.method === "POST") headers["Content-Length"] = String(body.length);
      const outgoing = request(
        upstream,
        {
          path: "/" + incoming.url.slice(prefix.length),
          method: incoming.method,
          headers,
          agent: false,
          timeout: 15000,
        },
        (backend) => {
          try {
            const allowed = new Set([
              "content-type",
              "content-length",
              "cache-control",
              "content-security-policy",
              "x-content-type-options",
              "x-frame-options",
              "referrer-policy",
              "permissions-policy",
              "cross-origin-opener-policy",
            ]);
            for (const [name, value] of Object.entries(backend.headers)) {
              if (allowed.has(name) && value !== undefined) response.setHeader(name, value);
              if (name === "set-cookie" && value)
                response.setHeader(
                  name,
                  value.map((cookie) => remountCookie(cookie, prefix)),
                );
            }
            response.writeHead(backend.statusCode ?? 502);
            backend.on("error", () => response.destroy());
            backend.pipe(response);
          } catch {
            backend.destroy();
            fail(response, 502, "Respuesta del módulo inválida.");
          }
        },
      );
      outgoing.on("timeout", () => outgoing.destroy(new Error("Tiempo agotado.")));
      outgoing.on("error", () => {
        if (!response.headersSent) fail(response, 502, "Módulo no disponible. No se reintenta la operación.");
        else response.destroy();
      });
      response.on("close", () => outgoing.destroy());
      outgoing.end(body);
    } catch {
      if (!response.headersSent) fail(response, 400, "Solicitud incompleta.");
    }
  });
  server.maxConnections = 64;
  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.setTimeout(15000);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      "module-url": { type: "string" },
      port: { type: "string" },
      mode: { type: "string", default: "A" },
      prefix: { type: "string", default: "/modulos/nutrequine/" },
    },
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Indique --port explícitamente.");
  const server = createPortal({ moduleUrl: values["module-url"], mode: values.mode, prefix: values.prefix });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      JSON.stringify({ event: "PORTAL_LISTENING", address: `http://127.0.0.1:${port}`, mode: values.mode }),
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
}
