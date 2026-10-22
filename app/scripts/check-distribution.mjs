import assert from "node:assert/strict";
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist-node/", import.meta.url));
const retired =
  /^(?:next$|vinext$|wrangler$|miniflare$|workerd$|react-server-dom-webpack$|@cloudflare\/|@next\/)/;
let packages = 0;
let files = 0;
function inspect(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const location = relative(root, path).replaceAll("\\", "/");
    const status = lstatSync(path);
    assert.ok(!status.isSymbolicLink(), "Enlace distribuido: " + location);
    if (status.isDirectory()) {
      assert.ok(
        !["tests", "test", ".git", ".openai", ".wrangler", "secrets", "private", "outputs"].includes(entry),
        "Directorio ajeno al runtime: " + location,
      );
      inspect(path);
      continue;
    }
    files++;
    assert.doesNotMatch(location, /\.(?:sqlite(?:3)?(?:-.*)?|db(?:-.*)?|pem|key|pfx|p12|log|map)$/i);
    assert.ok(!entry.startsWith(".env"), "Entorno privado distribuido.");
    if (entry === "package.json") {
      const manifest = JSON.parse(readFileSync(path, "utf8"));
      const dependency = /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+\/package.json$/.test(location);
      if (dependency || location === "package.json")
        assert.equal(typeof manifest.name, "string", "Paquete sin nombre: " + location);
      // Nested package.json files may only declare a module type; they are not separate packages.
      if (typeof manifest.name === "string") assert.doesNotMatch(manifest.name, retired, location);
      if (dependency) packages++;
    }
    if (location.startsWith("node_modules/")) continue;
    assert.doesNotMatch(location, /\.(?:ts|tsx|mts)$/);
    assert.ok(
      !location.endsWith(".json") || location === "package.json" || location.startsWith("drizzle/meta/"),
      "JSON privado o inesperado: " + location,
    );
    if (location.endsWith(".mjs"))
      assert.doesNotMatch(
        readFileSync(path, "utf8"),
        /(?:from\s*|import\s*\()\s*["'](?:cloudflare:|next(?:\/|["'])|vinext|wrangler|miniflare|workerd)/,
      );
  }
}
inspect(root);
for (const path of [
  "server/main.mjs",
  "scripts/sqlite-admin.mjs",
  "scripts/company-catalog.mjs",
  "lib/sqlite/recovery.mjs",
  "public-client/index.html",
])
  assert.ok(lstatSync(join(root, path)).isFile(), "Falta " + path);
const html = readFileSync(join(root, "public-client/index.html"), "utf8");
assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
console.log(
  JSON.stringify({
    distribution: "dist-node",
    files,
    runtimePackages: packages,
    privateFiles: 0,
    retiredPackages: 0,
  }),
);
