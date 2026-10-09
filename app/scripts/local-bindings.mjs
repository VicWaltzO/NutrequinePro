import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const localStatePath = fileURLToPath(new URL("../.wrangler/state", import.meta.url));
const { d1, r2 } = JSON.parse(readFileSync(new URL("../.openai/hosting.json", import.meta.url), "utf8"));

// The migration CLI and Vite must use the same database identity and directory.
export const localBindingConfig = {
  main: "./build/sites-worker.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1 ? [{
    binding: d1,
    database_name: "site-creator-d1",
    database_id: "00000000-0000-4000-8000-000000000000",
  }] : [],
  r2_buckets: r2 ? [{ binding: r2, bucket_name: "site-creator-r2" }] : [],
};
