import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { DomainError } from "../../lib/domain.mjs";

// Executes the actual route source. Only the host identity and D1 connection boundary are supplied.
// It checks handlers with real Request/Response objects, not a running Vinext server.
export function httpRouteHarness(store, identity) {
  const diagnostics = [];
  function route(relativePath) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const routeModule = { exports: {} };
    vm.runInNewContext(
      compiled,
      {
        module: routeModule,
        exports: routeModule.exports,
        Response,
        URL,
        console: { error: (...args) => diagnostics.push(args) },
        require(specifier) {
          if (specifier.endsWith("chatgpt-auth")) return { getChatGPTUser: async () => identity };
          if (specifier.endsWith("lib/store")) return store;
          if (specifier.endsWith("domain.mjs")) return { DomainError };
          throw new Error("Unexpected route dependency: " + specifier);
        },
      },
      { filename: relativePath },
    );
    return routeModule.exports;
  }
  return {
    GET: route("../../app/api/state/route.ts").GET,
    POST: route("../../app/api/command/route.ts").POST,
    diagnostics,
  };
}

export function commandRequest(input, { origin = "http://127.0.0.1:5173", raw } = {}) {
  return new Request("http://127.0.0.1:5173/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin === null ? {} : { Origin: origin }) },
    body: raw ?? JSON.stringify(input),
  });
}
