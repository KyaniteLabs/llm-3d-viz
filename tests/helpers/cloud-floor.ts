/**
 * Compute the product-scope scorable floor from actual catalog data.
 *
 * Imports CLOUD_LABS + RELEASE_FLOOR_ISO from the canonical catalog-scope
 * module (no duplication). Playwright's esbuild runner can import pure TS
 * modules — only JSON imports require this file's readFileSync approach.
 *
 * Source of truth: src/data/catalog-scope.ts (CLOUD_LABS, RELEASE_FLOOR_ISO)
 *                   src/data/models.ts (isScorable)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CLOUD_LABS, RELEASE_FLOOR_ISO } from "../../src/data/catalog-scope";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CLOUD_LAB_SET = new Set<string>(CLOUD_LABS);

function isScorable(m: {
  tps: number | null;
  blended_price_per_M: number | null;
  aa_intelligence_index: number | null;
}): boolean {
  return (
    m.tps !== null &&
    Number.isFinite(m.tps) &&
    m.tps >= 0 &&
    m.blended_price_per_M !== null &&
    Number.isFinite(m.blended_price_per_M) &&
    m.blended_price_per_M >= 0 &&
    m.aa_intelligence_index !== null &&
    Number.isFinite(m.aa_intelligence_index) &&
    m.aa_intelligence_index >= 0 &&
    m.aa_intelligence_index <= 100
  );
}

const catalog = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "data", "models.v0.draft.json"), "utf-8"),
) as Array<{
  provider: string;
  release_date: string;
  tps: number | null;
  blended_price_per_M: number | null;
  aa_intelligence_index: number | null;
}>;

const cloudScoped = catalog.filter(
  (m) => CLOUD_LAB_SET.has(m.provider) && m.release_date >= RELEASE_FLOOR_ISO,
);

/** Cloud-scoped scorable model count (source: actual catalog data). */
export const CLOUD_SCORABLE_FLOOR = cloudScoped.filter(isScorable).length;

/**
 * Visible-count floor for Playwright tests. UI default filters
 * (multiEffortOnly + excludeNonReasoning) reduce CLOUD_SCORABLE_FLOOR
 * further. We assert >= 1/3 of CLOUD_SCORABLE_FLOOR as a regression guard
 * that catches empty/broken stages without masking catalog-scope changes.
 */
export const VISIBLE_FLOOR = Math.floor(CLOUD_SCORABLE_FLOOR / 3);
