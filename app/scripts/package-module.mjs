import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const appRoot = fileURLToPath(new URL("../", import.meta.url));

function inventory(root) {
  const files = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      const status = lstatSync(file);
      if (status.isSymbolicLink()) throw new Error("No se empaquetan enlaces simbólicos.");
      if (status.isDirectory()) visit(file);
      else if (status.isFile())
        files.push({
          path: relative(root, file).split(sep).join("/"),
          bytes: status.size,
          sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
        });
      else throw new Error("Archivo no regular.");
    }
  }
  visit(root);
  return files;
}

/** Creates a new installation container; never merges into or replaces an existing directory. */
export function packageModule(destination) {
  if (!isAbsolute(destination)) throw new Error("Seleccione un destino absoluto nuevo.");
  if (existsSync(destination)) throw new Error("El destino ya existe; no se sobrescribe.");
  const target = join(realpathSync(dirname(destination)), resolve(destination).split(sep).at(-1));
  const location = relative(realpathSync(join(appRoot, "..")), target);
  if (!location || (!isAbsolute(location) && location !== ".." && !location.startsWith(".." + sep)))
    throw new Error("El paquete debe quedar fuera del repositorio.");
  const checked = spawnSync(process.execPath, [join(appRoot, "scripts/check-distribution.mjs")], {
    cwd: appRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (checked.error) throw checked.error;
  if (checked.status !== 0) throw new Error("La distribución no supera la auditoría: " + checked.stderr);
  const source = join(appRoot, "dist-node");
  const files = inventory(source);
  mkdirSync(target);
  cpSync(source, join(target, "app"), { recursive: true, errorOnExist: true, force: false });
  assert.deepEqual(inventory(join(target, "app")), files, "La copia no coincide con el artefacto auditado.");
  writeFileSync(
    join(target, "MODULE-MANIFEST.json"),
    JSON.stringify(
      {
        format: 1,
        node: ">=24.18.0",
        entrypoint: "app/server/main.mjs",
        files,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  return { destination: target, files: files.length, manifest: "MODULE-MANIFEST.json" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4 || process.argv[2] !== "--destination")
    throw new Error("Uso: package-module.mjs --destination RUTA_ABSOLUTA_NUEVA");
  console.log(JSON.stringify(packageModule(process.argv[3])));
}
