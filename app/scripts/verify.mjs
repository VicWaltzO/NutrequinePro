import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Ejecute este script mediante npm run verify.");

for (const script of [
  "test",
  "check",
  "check:node",
  "check:client",
  "lint",
  "format:check",
  "build",
  "check:distribution",
]) {
  console.log(`\nVerificando ${script}…`);
  const result = spawnSync(process.execPath, [npmCli, "run", script], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
