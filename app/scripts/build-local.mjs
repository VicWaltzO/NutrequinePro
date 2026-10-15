import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resetBuildDirectory } from "./build-paths.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== "--client-only"))
  throw new Error("Uso: node scripts/build-local.mjs [--client-only]");
resetBuildDirectory("dist-client");
for (const buildArguments of [
  [
    join(dirname(require.resolve("vite/package.json")), "bin/vite.js"),
    "build",
    "--config",
    "client/vite.config.mts",
  ],
  ...(args.length ? [] : [["scripts/build-node.mjs"]]),
]) {
  const result = spawnSync(process.execPath, buildArguments, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (args.length) process.exit(0);
cpSync(new URL("../dist-client/", import.meta.url), new URL("../dist-node/public-client/", import.meta.url), {
  recursive: true,
});
console.log(
  "Distribución local: dist-node, frontend compilado en public-client/. Seleccione ese directorio en la configuración privada.",
);
