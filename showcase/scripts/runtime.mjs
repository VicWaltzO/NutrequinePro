import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const dir = fileURLToPath(new URL("../", import.meta.url));
export const repoRoot = path.dirname(dir);
export const appDir = path.join(repoRoot, "app");
const require = createRequire(import.meta.url);
export function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    path.join(appDir, "demo-linkedin/node_modules/playwright"),
    path.join(
      homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
  ].filter(Boolean);
  const shimCandidates = [
    path.join(dir, ".tools/playwright"),
    path.join(appDir, "demo-linkedin/.tools/playwright"),
  ];
  const shim = shimCandidates.find((location) =>
    existsSync(path.join(location, "ffmpeg-1011/ffmpeg-win64.exe")),
  );
  if (shim && !process.env.PLAYWRIGHT_BROWSERS_PATH)
    process.env.PLAYWRIGHT_BROWSERS_PATH = shim;
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      /* Try the next documented local installation. */
    }
  }
  throw new Error(
    "Instale las herramientas con npm.cmd ci --prefix ../showcase desde app/.",
  );
}
export function binaries() {
  const resolve = (key, name) => {
    if (process.env[key]) return process.env[key];
    const locations = [
      path.join(dir, ".tools", `${name}.exe`),
      path.join(appDir, "demo-linkedin/.tools", `${name}.exe`),
    ];
    return locations.find(existsSync) || name;
  };
  return {
    ffmpeg: resolve("FFMPEG_BINARY", "ffmpeg"),
    ffprobe: resolve("FFPROBE_BINARY", "ffprobe"),
  };
}
export async function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: dir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-64000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      try {
        assert.equal(code, 0, `${path.basename(binary)} falló: ${stderr}`);
        resolve({ stdout: Buffer.concat(chunks).toString("utf8"), stderr });
      } catch (error) {
        reject(error);
      }
    });
  });
}
