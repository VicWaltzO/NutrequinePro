import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resetBuildDirectory } from "./build-paths.mjs";
import { validateBasePath } from "../integration/paths.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
let clientOnly = false;
let basePath = "/";
const options = new Set();
for (let index = 0; index < args.length; index++) {
  const option = args[index];
  if (options.has(option)) throw new Error("Opción repetida: " + option);
  options.add(option);
  if (option === "--client-only") clientOnly = true;
  else if (option === "--base-path") basePath = validateBasePath(args[++index]);
  else throw new Error("Uso: build-local.mjs [--client-only] [--base-path /ruta/]");
}
resetBuildDirectory("dist-client");
for (const buildArguments of [
  [
    join(dirname(require.resolve("vite/package.json")), "bin/vite.js"),
    "build",
    "--config",
    "client/vite.config.mts",
    "--base",
    basePath,
  ],
  ...(clientOnly ? [] : [["scripts/build-node.mjs"]]),
]) {
  const result = spawnSync(process.execPath, buildArguments, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (clientOnly) process.exit(0);
cpSync(new URL("../dist-client/", import.meta.url), new URL("../dist-node/public-client/", import.meta.url), {
  recursive: true,
});
console.log(
  "Distribución local: dist-node, frontend compilado en public-client/. Seleccione ese directorio en la configuración privada.",
);
