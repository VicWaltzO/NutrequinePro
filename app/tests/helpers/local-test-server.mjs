import { spawn, spawnSync } from "node:child_process";
import { mkdir, access, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { readExecutionProfile } from "../../scripts/execution-profile.mjs";

export const appRoot = fileURLToPath(new URL("../../", import.meta.url));

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

export async function startLocalTestServer() {
  if (readExecutionProfile() !== "portable")
    throw new Error("E2E requires the existing portable profile; no profile is changed automatically.");
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + process.pid;
  const stateDir = path.join(appRoot, ".wrangler", "regression-02-" + runId);
  const evidenceDir = path.join(appRoot, "outputs", "regression-02", runId);
  try {
    await access(stateDir);
    throw new Error("The synthetic persistence path already exists.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(evidenceDir, { recursive: true });
  const port = await freePort();
  const baseURL = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, ["scripts/run-framework.mjs", "dev", "--port", String(port)], {
    cwd: appRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NUTREQUINE_LOCAL_STATE_DIR: stateDir,
      SITES_RUNTIME_ROOT: path.join(stateDir, "runtime"),
      WRANGLER_LOG_PATH: path.join(stateDir, "runtime", "logs"),
      WRANGLER_REGISTRY_PATH: path.join(stateDir, "runtime", "dev-registry"),
      MINIFLARE_REGISTRY_PATH: path.join(stateDir, "runtime", "registry"),
    },
  });
  let log = "";
  let startupError;
  child.stdout.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr.on("data", (chunk) => {
    log += chunk;
  });
  child.on("error", (error) => {
    startupError = error;
  });
  async function stop() {
    if (child.exitCode === null && !startupError) {
      // Terminate only the process tree created by this helper, never a shared development server.
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else child.kill("SIGTERM");
    }
    await writeFile(path.join(evidenceDir, "server.log"), log);
  }
  try {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (child.exitCode !== null)
        throw new Error("Synthetic server exited: " + child.exitCode + "\n" + log.slice(-3000));
      try {
        const response = await fetch(baseURL + "/api/state", { signal: AbortSignal.timeout(2000) });
        if (response.status === 401) return { baseURL, stateDir, evidenceDir, stop };
      } catch {
        /* Wait for this server's route compilation. */
      }
      await delay(500);
    }
    throw new Error("Synthetic server did not become ready within 180 seconds. See server.log.");
  } catch (error) {
    await stop();
    throw error;
  }
}
