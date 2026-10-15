import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourcePrefix = resolve(root).replaceAll("\\", "/") + "/";
const client = (name: string) => resolve(root, "client", name);
export default defineConfig({
  root: client(""),
  publicDir: resolve(root, "public"),
  resolve: {
    alias: [{ find: "@", replacement: root }],
  },
  plugins: [
    {
      name: "nutrequine-client-boundary",
      enforce: "pre",
      load(id) {
        const path = id.split("?")[0].replaceAll("\\", "/");
        const sourcePath = path.startsWith(sourcePrefix) ? path.slice(sourcePrefix.length) : "";
        if (
          !sourcePath.startsWith("node_modules/") &&
          (/^(?:server|db|lib\/(?:adapters|sqlite))\//.test(sourcePath) ||
            /^lib\/(?:application-store|persistence|store|execute-command|seed-state)\.(?:mjs|ts)$/.test(
              sourcePath,
            ) ||
            /\/domain\/(?:commands|operations)\.mjs$/.test(sourcePath))
        )
          throw new Error("Módulo de servidor fuera de la frontera del cliente: " + path);
      },
      generateBundle() {
        const modules = [...this.getModuleIds()];
        for (const id of modules)
          if (
            /^node:|__vite-browser-external|cloudflare:|\/node_modules\/(?:next|vinext|wrangler|miniflare)\//.test(
              id,
            )
          )
            throw new Error("Dependencia de plataforma en el cliente: " + id);
        const visited = new Set<string>();
        const visit = (id: string, chain: string[]) => {
          if (!id.startsWith(sourcePrefix) || id.includes("/node_modules/")) return;
          if (chain.includes(id)) throw new Error("Ciclo del cliente: " + [...chain, id].join(" -> "));
          if (visited.has(id)) return;
          for (const dependency of this.getModuleInfo(id)?.importedIds ?? [])
            visit(dependency, [...chain, id]);
          visited.add(id);
        };
        for (const id of modules) visit(id, []);
      },
    },
    react(),
  ],
  css: { postcss: root },
  build: { outDir: resolve(root, "dist-client"), emptyOutDir: false, sourcemap: false },
  server: {
    host: "127.0.0.1",
    strictPort: true,
    cors: false,
    allowedHosts: ["127.0.0.1"],
    fs: {
      strict: true,
      allow: [
        client(""),
        resolve(root, "features"),
        resolve(root, "shared"),
        resolve(root, "lib"),
        resolve(root, "node_modules"),
        resolve(root, "public"),
      ],
      deny: [
        "**/.env*",
        "**/.git/**",
        "**/server/**",
        "**/db/**",
        "**/drizzle/**",
        "**/lib/adapters/**",
        "**/lib/sqlite/**",
        "**/lib/application-store*",
        "**/lib/persistence*",
        "**/lib/store.*",
        "**/lib/execute-command*",
        "**/lib/seed-state*",
      ],
    },
  },
});
