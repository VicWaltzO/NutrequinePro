import { createServer as createViteServer } from "vite";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readConfig } from "../server/config.mts";
import { createLocalServer } from "../server/application.mts";
import { frontendCsp } from "../server/frontend.mts";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--config")
  throw new Error("Uso: node scripts/dev-local.mts --config RUTA_PRIVADA_ABSOLUTA");
const { frontend_directory: _publicBuild, ...config } = readConfig(args[1]);
void _publicBuild;
const app = await createLocalServer(config);
const nonce = randomBytes(24).toString("base64");
const vite = await createViteServer({
  configFile: fileURLToPath(new URL("../client/vite.config.mts", import.meta.url)),
  html: { cspNonce: nonce },
  server: { middlewareMode: true, hmr: { server: app.server.server } },
  appType: "spa",
});
app.server.server.prependListener("upgrade", (request, socket) => {
  const host = "127.0.0.1:" + config.port;
  const origin = `${config.tls_key ? "https" : "http"}://${host}`;
  if (request.headers.host !== host || request.headers.origin !== origin) socket.destroy();
});
app.server.addHook("onRequest", async (request, reply) => {
  const path = request.raw.url?.split("?")[0] ?? "/";
  if (path === "/api" || path.startsWith("/api/")) return;
  if (!["GET", "HEAD"].includes(request.method)) return;
  const websocket = `${config.tls_key ? "wss" : "ws"}://127.0.0.1:${config.port}`;
  reply.header(
    "Content-Security-Policy",
    frontendCsp
      .replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`)
      .replace("connect-src 'self'", `connect-src 'self' ${websocket}`),
  );
  for (const [name, value] of Object.entries(reply.getHeaders()))
    if (value !== undefined) reply.raw.setHeader(name, value);
  reply.hijack();
  vite.middlewares(request.raw, reply.raw, () => {
    reply.raw.statusCode = 404;
    reply.raw.end("Recurso no encontrado.");
  });
});
app.server.addHook("onClose", async () => {
  await vite.close();
});
try {
  console.log(JSON.stringify({ event: "LISTENING", address: await app.start(), development: true }));
} catch (error) {
  await vite.close();
  throw error;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close();
  });
