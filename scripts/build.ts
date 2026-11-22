import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { build } from "vite";
import { isOssEdition } from "../src/config/edition";

const cache = resolve(".cache");
mkdirSync(cache, { recursive: true });
const staging = mkdtempSync(join(cache, "build-"));
const publicDir = join(staging, "public");
const isPublic = process.argv.includes("--public") || process.env.VIZ_DATA_PLANE === "public" || isOssEdition;
const generated = new Set(["m", "compare", "embed", "frontier-watch.json", "frontier-watch.md", "frontier-watch.xml"]);
const source = resolve("public");

function run(...args: string[]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${args.join(" ")} exited with ${result.status ?? result.signal}`);
}

try {
  // Replace stale generated pages in the staged copy, including legacy frontier measurements.
  cpSync(source, publicDir, { recursive: true, filter: (path) => path === source || !generated.has(basename(path)) });
  process.env.VIZ_BUILD_PUBLIC_DIR = publicDir;
  if (isPublic) {
    process.env.VIZ_DATA_PLANE = "public";
    process.env.VIZ_PUBLIC_CATALOG_PATH = join(staging, "catalog.json");
    run("scripts/gen-public-catalog.mjs");
  }
  run("scripts/gen-model-pages.mjs");
  run("scripts/gen-compare-pages.mjs");
  if (isPublic) run("--import", "tsx", "scripts/gen-public-frontier.ts", publicDir);
  else run("scripts/frontier-watch.mjs");
  await build({ publicDir });
} finally {
  rmSync(staging, { recursive: true, force: true });
}
