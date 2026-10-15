import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import net from "node:net";
import { createRequire } from "node:module";
import { createPrivateDirectory } from "../../lib/sqlite/files.mjs";
import { initializeDatabase } from "../../lib/sqlite/migrations.mjs";
import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";
import { provisionAuthentication } from "../../server/provision.mts";

export const appRoot = fileURLToPath(new URL("../../", import.meta.url));
export function browserTools() {
  const require = createRequire(import.meta.url);
  for (const candidate of [
    "playwright",
    join(appRoot, "demo-linkedin/node_modules/playwright"),
    join(appRoot, "../showcase/node_modules/playwright"),
  ]) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error(
    "Instale la herramienta Playwright existente para ejecutar E2E; no se instala automáticamente.",
  );
}
export async function localAppFixture({ development = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "nutrequine-08-test-"));
  const directory = createPrivateDirectory(join(root, "private"));
  const database = join(directory, "business.sqlite");
  const authDatabase = join(directory, "auth.sqlite");
  initializeDatabase(database);
  const admin = { userId: "local-admin-08", displayName: "Administrador sintético 08" };
  const connection = openSqliteDatabase(database);
  try {
    await createStore(() => connection).ensureState(admin);
  } finally {
    connection.close();
  }
  const password = randomBytes(24).toString("base64url");
  await provisionAuthentication(database, authDatabase, "link", {
    user_id: admin.userId,
    login: "admin.local",
    password,
  });
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const distribution = join(root, "distribution", "app");
  if (!development) cpSync(join(appRoot, "dist-node"), distribution, { recursive: true });
  const configFile = join(directory, "server.json");
  writeFileSync(
    configFile,
    JSON.stringify({
      database,
      auth_database: authDatabase,
      port,
      ...(!development ? { frontend_directory: join(distribution, "public-client") } : {}),
    }),
    { mode: 0o600 },
  );
  chmodSync(configFile, 0o600);
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
  const evidence = join(appRoot, "outputs", "frontend-08", runId);
  mkdirSync(evidence, { recursive: true });
  let child;
  let log = "";
  async function stop() {
    if (child?.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else child.kill("SIGTERM");
      await exited;
    }
    writeFileSync(join(evidence, "server.log"), log);
  }
  async function start() {
    const logStart = log.length;
    const args = development
      ? [join(appRoot, "scripts/dev-local.mts"), "--config", configFile]
      : [
          "--import",
          pathToFileURL(join(appRoot, "tests/helpers/deny-external-network.mjs")).href,
          join(distribution, "server/main.mjs"),
          "--config",
          configFile,
        ];
    child = spawn(process.execPath, args, {
      cwd: development ? appRoot : root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No inició: " + log.slice(-2000))), 60000);
      child.once("error", reject);
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error("Servidor terminó " + code + ": " + log.slice(-2000)));
      });
      child.stderr.on("data", (chunk) => {
        log += chunk;
      });
      child.stdout.on("data", (chunk) => {
        log += chunk;
        if (log.slice(logStart).includes('"event":"LISTENING"')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    if (!development && !log.includes("TEST_NETWORK_GUARD_ACTIVE"))
      throw new Error("No se activó el bloqueo de red del proceso.");
  }
  try {
    await start();
  } catch (error) {
    await stop();
    throw error;
  }
  return {
    root,
    directory,
    database,
    authDatabase,
    distribution,
    configFile,
    password,
    admin,
    evidence,
    baseURL: "http://127.0.0.1:" + port,
    start,
    stop,
  };
}
