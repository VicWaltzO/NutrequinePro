import { readFileSync } from "node:fs";
import { appRoot, localD1, localPersistPath } from "./local-database.mjs";

export const projectRoot = appRoot;
export const localStatePath = localPersistPath();
const { d1, r2 } = JSON.parse(readFileSync(new URL("../.openai/hosting.json", import.meta.url), "utf8"));

// Keep the public helper from main while sharing the migration identity and test path.
export const localBindingConfig = {
  main: "./build/sites-worker.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1 ? [{ ...localD1, binding: d1 }] : [],
  r2_buckets: r2 ? [{ binding: r2, bucket_name: "site-creator-r2" }] : [],
};
