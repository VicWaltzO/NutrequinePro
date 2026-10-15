import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { resetBuildDirectory } from "./build-paths.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const destination = resetBuildDirectory("dist-node");
const result = spawnSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "server/tsconfig.build.json"],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
// Declaration files can satisfy TypeScript without emitting their adjacent .mjs runtime.
const runtimeFiles = new Set();
function includeRuntime(target) {
  if (runtimeFiles.has(target)) return;
  runtimeFiles.add(target);
  const location = relative(destination, target);
  if (isAbsolute(location) || location.startsWith(".." + sep))
    throw new Error("Import fuera de la distribución.");
  const source = join(root, location);
  if (existsSync(source)) {
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  for (const imported of ts.preProcessFile(readFileSync(target, "utf8")).importedFiles) {
    if (imported.fileName.startsWith(".")) includeRuntime(resolve(dirname(target), imported.fileName));
  }
}
for (const file of readdirSync(join(destination, "server")))
  if (file.endsWith(".mjs")) includeRuntime(join(destination, "server", file));
includeRuntime(join(destination, "scripts/sqlite-admin.mjs"));
cpSync(join(root, "drizzle"), join(destination, "drizzle"), { recursive: true });
for (const file of readdirSync(join(root, "vendor")))
  if (/LICENSE|NOTICE/i.test(file)) {
    mkdirSync(join(destination, "vendor"), { recursive: true });
    cpSync(join(root, "vendor", file), join(destination, "vendor", file));
  }
for (const name of ["react", "react-dom", "lucide-react", "scheduler", "tailwindcss"]) {
  cpSync(join(root, "node_modules", name, "LICENSE"), join(destination, "vendor", name + ".LICENSE"));
}
mkdirSync(join(destination, "integration"), { recursive: true });
for (const file of ["README.md", "CONTRATO_INTEGRACION.md", "EJEMPLO_PORTAL.md", "portal.mjs", "paths.mjs"])
  cpSync(join(root, "integration", file), join(destination, "integration", file));
const project = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
writeFileSync(
  join(destination, "package.json"),
  JSON.stringify(
    {
      name: "nutrequine-local-backend",
      version: project.version,
      private: true,
      type: "module",
      engines: { node: ">=24.18.0" },
    },
    null,
    2,
  ) + "\n",
);
const copied = new Set();
function copyDependency(name, parentRequire) {
  let packageDirectory = dirname(parentRequire.resolve(name));
  while (
    !existsSync(join(packageDirectory, "package.json")) ||
    JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")).name !== name
  ) {
    const parent = dirname(packageDirectory);
    if (parent === packageDirectory) throw new Error("No se encontró el manifiesto de " + name);
    packageDirectory = parent;
  }
  const manifest = join(packageDirectory, "package.json");
  if (copied.has(manifest)) return;
  copied.add(manifest);
  const location = relative(join(root, "node_modules"), dirname(manifest));
  if (isAbsolute(location) || location === ".." || location.startsWith(".." + sep))
    throw new Error("Dependencia fuera del árbol instalado.");
  const target = join(destination, "node_modules", location);
  mkdirSync(dirname(target), { recursive: true });
  const developmentDirectories = new Set([
    "test",
    "tests",
    "__tests__",
    "docs",
    "examples",
    "benchmarks",
    ".github",
    "node_modules",
  ]);
  cpSync(dirname(manifest), target, {
    recursive: true,
    filter: (source) =>
      source === dirname(manifest) ||
      (!source.endsWith(".map") &&
        !relative(dirname(manifest), source)
          .split(sep)
          .some((part) => developmentDirectories.has(part))),
  });
  const metadata = JSON.parse(readFileSync(manifest, "utf8"));
  const dependencyRequire = createRequire(manifest);
  for (const dependency of Object.keys(metadata.dependencies ?? {}))
    copyDependency(dependency, dependencyRequire);
}
copyDependency("fastify", require);
console.log(
  `Backend compilado: dist-node/server/main.mjs; ${copied.size} paquetes de runtime, sin infraestructura Cloudflare.`,
);
