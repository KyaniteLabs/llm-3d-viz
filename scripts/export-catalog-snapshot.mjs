#!/usr/bin/env node
/**
 * Export catalog snapshot for CLI/MCP (copy + light meta).
 * Source of truth remains data/models.v0.draft.json.
 */
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "data/models.v0.draft.json");
const OUT_DIR = resolve(ROOT, "data");
const OUT = resolve(OUT_DIR, "atlas-catalog-snapshot.json");
const META = resolve(OUT_DIR, "atlas-catalog-meta.json");

const models = JSON.parse(readFileSync(SRC, "utf8"));
if (!Array.isArray(models)) {
  console.error("models.v0.draft.json must be an array");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(SRC, OUT);

const meta = {
  schema_version: "1.0",
  exported_at: new Date().toISOString(),
  model_count: models.length,
  source: "data/models.v0.draft.json",
  snapshot_file: "data/atlas-catalog-snapshot.json",
  note: "Null metrics preserved. Never invent Index/tok/s/price client-side.",
};

writeFileSync(META, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`[export-catalog-snapshot] ${models.length} models → ${OUT}`);
console.log(`[export-catalog-snapshot] meta → ${META}`);
