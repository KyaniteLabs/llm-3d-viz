/**
 * AA Intelligence Index ↔ Arena Elo consistency report
 * (data-stewardship v2, W7 / ticket #194).
 *
 * The catalog's intelligence axis is single-sourced from the AA Intelligence
 * Index; Arena Elo covers only part of the pool (~19% attach). This helper
 * MEASURES how far the two signals agree on the rows where both exist, so the
 * single-source risk is quantified instead of merely documented.
 *
 * It is a consistency measurement — NOT a replacement score. The AA Index
 * stays the product's only intelligence axis; this report never feeds
 * admission, scoring, or UI ranking (presentation is deferred to the UI/UX
 * audit line).
 *
 * Semantics:
 *  - A row qualifies only when BOTH aa_intelligence_index (finite, 0–100) and
 *    arena_elo (finite) are non-null on that same row; families without at
 *    least one qualifying row are excluded cleanly.
 *  - Per family: index_min/index_max and elo_min/elo_max describe the
 *    within-family effort spread (max − min across the family's qualifying
 *    rows, both directions).
 *  - Ranks order the shared pool (all qualifying families) by family MEAN of
 *    each metric, rank 1 = highest, deterministic family-name tie-break.
 *    rank_gap = |rank_by_index − rank_by_elo| is the ordering disagreement.
 */
export const INTEL_CONSISTENCY_TITLE =
  "AA Intelligence Index vs Arena Elo — consistency measurement, not a replacement score";
/** The entries list is capped at this many items (full pool still ranked). */
export const INTEL_CONSISTENCY_MAX_ENTRIES = 50;

/** Finite AA Intelligence Index in the documented 0–100 range, else null. */
function finiteIndex(v) {
  // Number(null)/Number("") coerce to 0 — reject nullish/empty before coercing.
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/** Finite Arena Elo, else null. */
function finiteElo(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mean(list) {
  return list.reduce((a, b) => a + b, 0) / list.length;
}

/** Round to 2 decimals for a stable, diffable report. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Ordinal ranks (1 = highest value) over the pool, with a deterministic
 * family-name tie-break so identical values cannot wobble ranks run over run.
 * @param {object[]} pool
 * @param {(f: object) => number} valueOf
 */
function rankBy(pool, valueOf) {
  const sorted = [...pool].sort(
    (a, b) => valueOf(b) - valueOf(a) || a.family.localeCompare(b.family),
  );
  const ranks = new Map();
  sorted.forEach((f, i) => ranks.set(f.family, i + 1));
  return ranks;
}

/**
 * Build the AA-Index ↔ Arena-Elo consistency report. Pure: no I/O, never
 * mutates the rows passed in, never feeds admission.
 *
 * @param {object[]} rows — draft rows (only rows carrying BOTH metrics count)
 * @param {{ maxEntries?: number }} [opts] — entries cap (default
 *   INTEL_CONSISTENCY_MAX_ENTRIES); ranks and max_rank_gap always cover the
 *   full pool regardless of the cap
 * @returns {{ title: string, families: number, ranked_pool: number,
 *   entries: Array<{family: string, provider: string, index_min: number,
 *   index_max: number, elo_min: number, elo_max: number, rank_by_index:
 *   number, rank_by_elo: number, rank_gap: number}>, max_rank_gap: number,
 *   note: string }} sorted by rank_gap desc, entries capped
 */
export function buildIntelConsistency(rows, opts = {}) {
  const cap = Number.isFinite(opts.maxEntries)
    ? opts.maxEntries
    : INTEL_CONSISTENCY_MAX_ENTRIES;

  // Group qualifying rows per family (same row must carry BOTH metrics).
  const byFamily = new Map();
  for (const row of rows ?? []) {
    if (!row) continue;
    const index = finiteIndex(row.aa_intelligence_index);
    const elo = finiteElo(row.arena_elo);
    if (index == null || elo == null) continue;
    const family = row.family_id || row.model || "";
    let fam = byFamily.get(family);
    if (!fam) {
      fam = {
        family,
        provider: row.provider || "Unknown",
        indexes: [],
        elos: [],
      };
      byFamily.set(family, fam);
    }
    if ((!fam.provider || fam.provider === "Unknown") && row.provider) {
      fam.provider = row.provider;
    }
    fam.indexes.push(index);
    fam.elos.push(elo);
  }

  // Shared pool: every qualifying family carries both metrics, so all of them
  // are ranked (families === ranked_pool by construction).
  const pool = [...byFamily.values()].map((f) => ({
    family: f.family,
    provider: f.provider,
    index_min: Math.min(...f.indexes),
    index_max: Math.max(...f.indexes),
    elo_min: Math.min(...f.elos),
    elo_max: Math.max(...f.elos),
    avg_index: mean(f.indexes),
    avg_elo: mean(f.elos),
  }));

  const indexRanks = rankBy(pool, (f) => f.avg_index);
  const eloRanks = rankBy(pool, (f) => f.avg_elo);

  const entries = pool
    .map((f) => {
      const rankByIndex = indexRanks.get(f.family);
      const rankByElo = eloRanks.get(f.family);
      return {
        family: f.family,
        provider: f.provider,
        index_min: round2(f.index_min),
        index_max: round2(f.index_max),
        elo_min: round2(f.elo_min),
        elo_max: round2(f.elo_max),
        rank_by_index: rankByIndex,
        rank_by_elo: rankByElo,
        rank_gap: Math.abs(rankByIndex - rankByElo),
      };
    })
    .sort(
      (a, b) =>
        b.rank_gap - a.rank_gap ||
        a.rank_by_index - b.rank_by_index ||
        a.family.localeCompare(b.family),
    );

  return {
    title: INTEL_CONSISTENCY_TITLE,
    families: pool.length,
    ranked_pool: pool.length,
    entries: entries.slice(0, cap),
    max_rank_gap: entries.length ? entries[0].rank_gap : 0,
    note: "Report-only (W7 / ticket #194): per-family effort spread of AA Intelligence Index vs Arena Elo plus the rank disagreement between the two orderings. Only rows carrying BOTH metrics on the same row qualify; ranks order that shared pool by family mean (rank 1 = highest, family-name tie-break); rank_gap = |rank_by_index − rank_by_elo|. A consistency measurement — not a replacement score: the AA Index remains the product's single intelligence source and this report never feeds admission or scoring. UI surfacing deferred to the UI/UX line.",
  };
}
