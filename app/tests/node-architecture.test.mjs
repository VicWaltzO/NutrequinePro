import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(?:mts|mjs|ts)$/.test(path) && !/\.d\.mts$/.test(path) ? [path] : [];
  });
}

test("Node arquitectura: grafo ejecutable sin ciclos, frameworks de frontend ni runtime Cloudflare", () => {
  const graph = new Map();
  function inspect(file, pending = []) {
    assert.ok(!pending.includes(file), "Ciclo: " + [...pending, file].join(" -> "));
    if (graph.has(file)) return;
    const source = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    graph.set(file, []);
    for (const node of ast.statements) {
      if (
        (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) ||
        node.isTypeOnly ||
        node.importClause?.isTypeOnly ||
        !node.moduleSpecifier
      )
        continue;
      const name = node.moduleSpecifier.text;
      assert.doesNotMatch(name, /cloudflare|wrangler|miniflare|vinext|^next|^react/);
      if (!name.startsWith(".")) {
        assert.ok(name.startsWith("node:") || ["fastify", "pdfkit"].includes(name), name);
        continue;
      }
      const path = resolve(dirname(file), name);
      assert.ok(existsSync(path), "Import explícito ausente: " + path);
      graph.get(file).push(path);
      inspect(path, [...pending, file]);
    }
  }
  for (const entry of files(join(root, "server"))) inspect(entry);
  assert.ok(graph.has(join(root, "lib/application-store.mjs")));
  assert.ok(graph.has(join(root, "lib/adapters/node-sqlite.mjs")));
});
