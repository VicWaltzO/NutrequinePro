import type { FastifyInstance } from "fastify";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

const mime: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  ico: "image/x-icon",
  woff2: "font/woff2",
};
export const frontendCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

/** Enumerated public build only: no wildcard filesystem handler, SPA fallback or private config tree. */
export function serveFrontend(server: FastifyInstance, directory: string) {
  if (!isAbsolute(directory) || lstatSync(directory).isSymbolicLink())
    throw new Error("Seleccione un directorio público absoluto sin enlaces.");
  const root = realpathSync(directory);
  const files = new Map<string, { path: string; type: string }>();
  function inventory(folder: string) {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      if (item.name.startsWith(".")) continue;
      const path = join(folder, item.name);
      if (item.isSymbolicLink()) throw new Error("Enlace no permitido en el build público.");
      if (item.isDirectory()) {
        inventory(path);
        continue;
      }
      if (!item.isFile()) throw new Error("Archivo público no regular.");
      const name = relative(root, path).split(sep).join("/");
      const type = mime[name.split(".").at(-1) ?? ""];
      if (!type || (name.endsWith(".html") && name !== "index.html") || !/^[a-zA-Z0-9_./-]+$/.test(name))
        continue;
      if (name.startsWith("api/") || name.startsWith("server/"))
        throw new Error("Ruta privada en el build público.");
      files.set("/" + name, { path, type });
    }
  }
  inventory(root);
  const index = files.get("/index.html");
  if (!index) throw new Error("Falta index.html del frontend compilado.");
  files.set("/", index);
  for (const [url, file] of files)
    server.get(url, async (request, reply) => {
      const requested = request.raw.url?.split("?")[0];
      if (requested !== url || realpathSync(file.path) !== file.path || !lstatSync(file.path).isFile())
        return reply.code(404).send({ error: "Recurso no encontrado." });
      reply.header("Content-Security-Policy", frontendCsp).type(file.type);
      return reply.send(await readFile(file.path));
    });
}
