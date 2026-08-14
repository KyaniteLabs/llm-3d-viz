#!/usr/bin/env node
/**
 * Export catalog snapshot for CLI/MCP (copy + light meta).
 * Source of truth remains data/models.v0.draft.json.
 *
 * D07: Includes source SHA-256 and data_date so consumers can detect drift.
 * Note: expand-aa-multi-effort.mjs now exports snapshot+meta atomically as part
 * of the refresh transaction; this script remains for manual re-export.
 */
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
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

const draftContent = readFileSync(SRC, "utf8");
const sourceHash = createHash("sha256").update(draftContent).digest("hex");

const dataDate =
  models.length > 0 && models[0].data_date
    ? models[0].data_date
    : new Date().toISOString().slice(0, 10);

const meta = {
  schema_version: "1.1",
  exported_at: new Date().toISOString(),
  model_count: models.length,
  source: "data/models.v0.draft.json",
  snapshot_file: "data/atlas-catalog-snapshot.json",
  source_sha256: sourceHash,
  data_date: dataDate,
  note: "Null metrics preserved. Never invent Index/tok/s/price client-side. Snapshot duplicates data/models.v0.draft.json byte-for-byte; dedupe is leader-gated (WS7/L2).",
};

writeFileSync(META, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`[export-catalog-snapshot] ${models.length} models → ${OUT}`);
console.log(`[export-catalog-snapshot] meta → ${META} (sha256=${sourceHash.slice(0, 12)}…)`);
