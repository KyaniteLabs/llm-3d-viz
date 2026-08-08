#!/usr/bin/env node
/**
 * Enrich catalog modality from OpenRouter (legal public source).
 * Targeted: fetches ONLY OpenRouter /models and unions input modalities
 * (image→vision, audio, video) into data/models.v0.draft.json. Never downgrades
 * existing curated modalities; never refetches AA/Arena/pricing. Run after
 * `catalog:refresh`, or standalone to backfill the modality gap.
 *
 * Usage: node scripts/enrich-modality.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchOpenRouterModels } from "./lib/openrouter-api.mjs";
import { applyOpenRouterModality } from "./lib/catalog-join.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = resolve(ROOT, "data/models.v0.draft.json");
const dry = process.argv.includes("--dry-run");

const or = await fetchOpenRouterModels();
if (!or.ok || !or.models.length) {
  console.error(`[enrich-modality] OpenRouter fetch failed: ${or.error || "no models"}`);
  process.exit(1);
}

const rows = JSON.parse(readFileSync(CATALOG, "utf8"));
const before = new Map(); // modality tally before
for (const r of rows) for (const m of r.modality ?? []) before.set(m, (before.get(m) ?? 0) + 1);

const { rows: next, attaches } = applyOpenRouterModality(rows, or.models);

const after = new Map();
for (const r of next) for (const m of r.modality ?? []) after.set(m, (after.get(m) ?? 0) + 1);

console.log(`[enrich-modality] OpenRouter models: ${or.models.length}`);
console.log(`[enrich-modality] catalog rows: ${rows.length}`);
console.log(`[enrich-modality] modality attached to ${attaches} row(s)`);
console.log("[enrich-modality] modality tally:");
for (const k of [...after.keys()].sort()) {
  console.log(`    ${k.padEnd(8)} ${String(before.get(k) ?? 0).padStart(4)} → ${String(after.get(k) ?? 0).padStart(4)}`);
}

if (dry) {
  console.log("[enrich-modality] --dry-run: no write");
} else if (attaches > 0) {
  writeFileSync(CATALOG, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`[enrich-modality] wrote ${CATALOG}`);
  console.log("[enrich-modality] re-export the snapshot: node scripts/export-catalog-snapshot.mjs");
} else {
  console.log("[enrich-modality] no changes; catalog already has full modalities");
}
