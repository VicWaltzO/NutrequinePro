import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(?:tsx?|m?js|mts)$/.test(file) && !/\.d\.(?:ts|mts)$/.test(file) ? [file] : [];
  });
}
const files = ["app", "client", "features", "shared", "lib"].flatMap((folder) =>
  sources(path.join(root, folder)),
);
const graph = new Map(files.map((file) => [file, []]));

for (const file of files) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    if (node.isTypeOnly || node.importClause?.isTypeOnly) continue;
    const clause = node.importClause;
    if (
      clause &&
      !clause.name &&
      clause.namedBindings &&
      ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.length &&
      clause.namedBindings.elements.every((item) => item.isTypeOnly)
    )
      continue;
    const specifier = node.moduleSpecifier.text;
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
    const base = specifier.startsWith("@/")
      ? path.join(root, specifier.slice(2))
      : path.resolve(path.dirname(file), specifier);
    const target = [
      base,
      ...[".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"].map((ext) => base + ext),
    ].find((candidate) => graph.has(candidate) && existsSync(candidate));
    if (target) graph.get(file).push(target);
  }
}

test("los módulos de aplicación no contienen ciclos de dependencias en ejecución", () => {
  const visited = new Set(),
    pending = [];
  function visit(file) {
    assert.ok(!pending.includes(file), "Ciclo: " + [...pending, file].map(relative).join(" → "));
    if (visited.has(file)) return;
    pending.push(file);
    for (const dependency of graph.get(file)) visit(dependency);
    pending.pop();
    visited.add(file);
  }
  for (const file of files) visit(file);
});

test("dominio puro y componentes compartidos conservan sus límites de dependencia", () => {
  for (const [file, dependencies] of graph) {
    const location = relative(file);
    const pureDomain = location.startsWith("shared/domain/") || /^features\/[^/]+\/domain\//.test(location);
    const shared = location.startsWith("shared/");
    const source = readFileSync(file, "utf8");
    if (pureDomain) {
      assert.doesNotMatch(
        source,
        /from\s+["'](?:react(?:\/[^"']*)?|next\/[^"']+|cloudflare:workers|node:[^"']+)["']/,
      );
      assert.doesNotMatch(source, /\b(?:window|document|localStorage|fetch)\s*[.(]/);
    }
    for (const dependency of dependencies) {
      const target = relative(dependency);
      if (pureDomain) {
        assert.ok(
          target.startsWith("shared/domain/") || /^features\/[^/]+\/domain\//.test(target),
          `${location} → ${target}`,
        );
      }
      if (shared) assert.ok(target.startsWith("shared/"), `${location} → ${target}`);
    }
  }
});

test("el contrato del store es neutral y la aplicación Cloudflare no carga el driver Node", () => {
  for (const file of [
    "lib/application-store.mjs",
    "lib/application-store.d.mts",
    "lib/persistence.mjs",
    "lib/persistence-port.ts",
  ])
    assert.doesNotMatch(
      readFileSync(path.join(root, file), "utf8"),
      /cloudflare:workers|\bD1Database\b|\bD1PreparedStatement\b/,
    );
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.notEqual(
      relative(file),
      "lib/adapters/node-sqlite.mjs",
      "El driver Node debe quedar fuera del grafo de Workers",
    );
    for (const dependency of graph.get(file) ?? []) visit(dependency);
  }
  visit(path.join(root, "lib/store.ts"));
});
