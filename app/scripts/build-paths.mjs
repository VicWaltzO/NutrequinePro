import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));

/** Only replace these generated build directories; private data must live outside installation. */
export function resetBuildDirectory(name) {
  if (!["dist-client", "dist-node"].includes(name)) throw new Error("Destino de compilación inválido.");
  const target = join(root, name);
  const location = relative(root, target);
  if (location !== name || isAbsolute(location)) throw new Error("Destino fuera de la aplicación.");
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink() || realpathSync(target) !== target)
      throw new Error("El directorio de compilación no admite enlaces.");
    rmSync(target, { recursive: true });
  }
  mkdirSync(target);
  return target;
}
