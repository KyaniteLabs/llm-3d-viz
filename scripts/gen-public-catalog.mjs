#!/usr/bin/env node
// Path C data-plane transform (docs/plans/2026-08-29-path-c-data-plane.md).
// Derives the PUBLIC catalog from the full draft: every field whose
// provenance origin is aa-api / aa / openrouter is nulled and its sources
// entry dropped, EXCEPT public-spec facts (modality, context_length) which
// are re-sourced to curated/provider. Private plane never runs this.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FULL_PATH = join(ROOT, "data", "models.v0.draft.json");
export const PUBLIC_PATH = join(ROOT, "data", "generated", "public-catalog.json");

const STRIP_ORIGINS = new Set(["aa-api", "aa", "openrouter"]);
const RESOURCE_FIELDS = new Map([
  ["modality", { origin: "curated", kind: "public-spec" }],
  ["context_length", { origin: "provider", kind: "public-spec" }],
]);

export function buildPublicCatalog(rows) {
  return rows.map((row) => {
    const out = { ...row };
    const sources = { ...(row.sources ?? {}) };
    let touched = false;
    for (const [field, prov] of Object.entries(sources)) {
      const origin = prov?.origin;
      if (RESOURCE_FIELDS.has(field) && STRIP_ORIGINS.has(origin)) {
        sources[field] = { ...RESOURCE_FIELDS.get(field) };
        touched = true;
      } else if (STRIP_ORIGINS.has(origin)) {
        if (field in out) out[field] = null;
        delete sources[field];
        touched = true;
      }
    }
    if (touched) {
      out.sources = sources;
      // null_reason tells the honesty-core UI why a value is absent.
      out.null_reason =
        (row.null_reason ? `${row.null_reason}; ` : "") +
        "public plane: not republished (source license)";
    }
    return out;
  });
}

export function assertPublicCatalogClean(rows) {
  const bad = [];
  for (const row of rows) {
    for (const [field, prov] of Object.entries(row.sources ?? {})) {
      if (STRIP_ORIGINS.has(prov?.origin)) bad.push(`${row.model}:${field}:${prov?.origin}`);
    }
  }
  if (bad.length) {
    throw new Error(`public catalog still carries stripped-origin provenance: ${bad.slice(0, 5).join(", ")}`);
  }
}

export function main() {
  const rows = JSON.parse(readFileSync(FULL_PATH, "utf8"));
  const pub = buildPublicCatalog(rows);
  assertPublicCatalogClean(pub);
  mkdirSync(dirname(PUBLIC_PATH), { recursive: true });
  writeFileSync(PUBLIC_PATH, JSON.stringify(pub, null, 2) + "\n");
  const measured = pub.filter((r) => r.aa_intelligence_index != null || r.tps != null || r.blended_price_per_M != null);
  console.log(`public catalog: ${pub.length} rows -> ${PUBLIC_PATH} (${measured.length} rows retain measured axis data)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
