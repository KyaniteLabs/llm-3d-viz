import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

function cli(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "bin/atlas-cli.ts", ...args], {
    encoding: "utf8",
    env: { ...process.env, ATLAS_CATALOG_PATH: "" },
  });
}

it.each([
  [["rank", "--floor", "abc"], 1, "--floor"],
  [["rank", "--n", "-5"], 1, "--n"],
  [["rank", "--objective", "bogus"], 1, "--objective"],
  [["compare"], 1, "compare"],
  [["compare", "definitely-missing", "also-missing"], 2, "missing:"],
  [["floor", "--anchor", "definitely-not-a-model-xyz-999"], 2, "not found"],
  [["--help"], 0, "Atlas CLI"],
  [["meta", "--catalog", "/nonexistent.json"], 3, "Cannot read catalog"],
])("validates %j with exit %i", (args, status, diagnostic) => {
  const r = cli(...args);
  expect(r.status).toBe(status);
  expect(status === 0 ? r.stdout : r.stderr).toContain(diagnostic);
});
