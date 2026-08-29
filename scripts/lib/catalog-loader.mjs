// Single catalog entry point for all build-plane consumers. VIZ_DATA_PLANE=public
// reads the Path-C trimmed catalog; anything else reads the full draft.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_PLANE = process.env.VIZ_DATA_PLANE === "public" ? "public" : "private";
const FULL = join(ROOT, "data", "models.v0.draft.json");
const PUBLIC = join(ROOT, "data", "generated", "public-catalog.json");

export function catalogPath() {
  return DATA_PLANE === "public" ? PUBLIC : FULL;
}

export function loadCatalog() {
  const p = catalogPath();
  if (DATA_PLANE === "public" && !existsSync(p)) {
    throw new Error("public plane selected but data/generated/public-catalog.json is missing — run scripts/gen-public-catalog.mjs first");
  }
  return JSON.parse(readFileSync(p, "utf8"));
}
