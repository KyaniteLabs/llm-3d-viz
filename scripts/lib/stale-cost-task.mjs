/**
 * Cost-per-task staleness flag (data-stewardship v2, W4 / ticket #190).
 *
 * `cost_per_index_task_usd` is measured at AA measurement time, but list
 * prices (in/out/blended per M) can move afterwards, which silently changes
 * what the measured cost/task implies. This helper flags rows whose cost/task
 * is likely stale because prices moved since measurement.
 *
 * Approximation rule (measurement-time prices are NOT stored): a row is
 * flagged when its CURRENT price side differs by >25% from the price side of
 * the SAME family+effort spine in the PREVIOUS draft — the pre-write previous
 * draft the expand script already loads for the WS1 row diff, passed in as
 * `prevRows`. Spine identity is the production spineKey (model slug from the
 * AA source URL, plus effort tier), which uniquely identifies admitted rows;
 * a bare family_id+tier would conflate sibling variants (e.g. "(Reasoning)"
 * vs "(Non-reasoning)" share family and tier but not prices). The first run
 * (no previous draft) flags nothing. Data flag only; UI surfacing is deferred
 * to the UI/UX line.
 */
import { aaSlugFromSourceUrl, lastSlugSegment } from "../../src/lib/family-effort.shared.ts";

/** A price side is "moved" when it changed by more than this many percent. */
export const STALE_PRICE_MOVE_PCT = 25;
/** The entries list (and count) are capped at this many items. */
export const STALE_COST_TASK_MAX_ENTRIES = 100;

const PRICE_SIDES = ["price_in_per_M", "price_out_per_M", "blended_price_per_M"];

/**
 * Family+effort spine key — same identity the catalog join's spineKey uses
 * (AA source-URL slug, falling back to the model name's slug, plus
 * lowercased effort tier).
 * @param {object} row
 */
function spineOf(row) {
  const slug = aaSlugFromSourceUrl(row?.source_url || "") || lastSlugSegment(row?.model || "");
  const effort = String(row?.effort_tier || "none").toLowerCase().trim();
  return `${slug}::${effort}`;
}

/** Positive finite number, or null when absent/zero/non-finite. */
function positiveFinite(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Flag cost/task rows whose price side moved >25% vs the previous draft.
 *
 * @param {object[]} rows — current admitted rows
 * @param {{ prevRows?: object[] | null }} opts — previous pre-write draft rows
 *   (null/omitted/empty on first run → nothing flagged)
 * @returns {{ count: number, entries: Array<{model: string, provider: string,
 *   field: string, from: number, to: number, pct: number}> }} count and
 *   entries are both capped at STALE_COST_TASK_MAX_ENTRIES (count always
 *   equals entries.length); pct is the signed percent change, e.g. +30% → 30.
 */
export function buildStaleCostTask(rows, { prevRows } = {}) {
  const out = { count: 0, entries: [] };
  if (!Array.isArray(prevRows) || prevRows.length === 0) return out;

  const prevBySpine = new Map();
  for (const prev of prevRows) {
    prevBySpine.set(spineOf(prev), prev);
  }

  const entries = [];
  for (const row of rows ?? []) {
    if (row?.cost_per_index_task_usd == null) continue;
    const prev = prevBySpine.get(spineOf(row));
    if (!prev) continue;
    for (const field of PRICE_SIDES) {
      const from = positiveFinite(prev[field]);
      const to = positiveFinite(row[field]);
      if (from == null || to == null) continue;
      const pct = ((to - from) / from) * 100;
      if (Math.abs(pct) <= STALE_PRICE_MOVE_PCT) continue;
      entries.push({
        model: row.model,
        provider: row.provider,
        field,
        from,
        to,
        pct: Math.round(pct * 100) / 100,
      });
    }
  }

  out.entries = entries.slice(0, STALE_COST_TASK_MAX_ENTRIES);
  out.count = out.entries.length;
  return out;
}
