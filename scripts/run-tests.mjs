import { spawnSync } from "node:child_process";

const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this script with npm test.");
const args = process.argv.slice(2);
const scripts = args.length ? ["test:vitest"] : ["test:vitest", "test:desktop"];

for (const script of scripts) {
  const result = spawnSync(process.execPath, [npm, "run", script, "--", ...args], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
