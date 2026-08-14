/**
 * Pre-admission visibility annex (plan WS3, audit H1 + H4-visibility).
 *
 * Report-only: every builder here computes counts/names for the gaps doc.
 * None of them admits rows, mutates inputs, or changes scope constants —
 * visibility is not admission (principle 1).
 *
 *  - buildAwaitingMeasurement: merged (post-overlay, pre-admission) rows that
 *    hold exactly two of the three plot-triple elements — the "awaiting AA"
 *    pool (audit: 192 no-TPS / 4 no-IQ / 2 price-only on 2026-08-14).
 *  - buildNonUserTierDrops: rows that pass the triple but fall to the
 *    NON_USER_TIERS filter (privileged tiers users cannot select).
 *  - buildHiddenByScope: admitted rows the product scope hides — floor-hidden
 *    (a1/a2/a3) and held 2026 rows (b). Evidence for decision item D-H4.
 *  - buildArenaMatchFailures: counts of Arena attach failures by code plus the
 *    top unmatched model names (plan WS6, audit M2 — the ~23% attach rate's
 *    first measurable improvement target).
 */
import { meetsReleaseFloor } from "../../src/data/catalog-scope.ts";
import { aaSlugFromSourceUrl, lastSlugSegment } from "../../src/lib/family-effort.shared.ts";
import { canAdmitPlotTriple, spineKey } from "./catalog-join.mjs";

/** Same presence predicates as canAdmitPlotTriple, per element. */
function hasIq(row) {
  const v = row?.aa_intelligence_index;
  return v != null && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100;
}
function hasTps(row) {
  const v = row?.tps;
  return v != null && Number.isFinite(Number(v)) && Number(v) >= 0;
}
function hasBlendedPrice(row) {
  const v = row?.blended_price_per_M;
  return v != null && Number.isFinite(Number(v)) && Number(v) >= 0;
}

const AWAITING_ENTRY_CAP = 250;

/**
 * Rows with exactly two of the three triple elements, bucketed by the missing
 * axis. Never includes admitted rows (checked by spine key).
 *
 * @param {object[]} mergedRows — post-overlay, pre-admission in-memory rows
 * @param {object[]} admittedRows — final admitted draft rows
 * @param {{ cap?: number }} [opts]
 */
export function buildAwaitingMeasurement(mergedRows, admittedRows, opts = {}) {
  const cap = Number.isFinite(opts.cap) ? opts.cap : AWAITING_ENTRY_CAP;
  const admittedSpines = new Set((admittedRows ?? []).map(spineKey));
  const buckets = { missing_tps: [], missing_iq: [], missing_price: [] };
  for (const row of mergedRows ?? []) {
    if (admittedSpines.has(spineKey(row))) continue;
    const present = [hasIq(row), hasTps(row), hasBlendedPrice(row)].filter(Boolean).length;
    if (present !== 2) continue;
    let missing_axis = null;
    if (!hasTps(row)) missing_axis = "tps";
    else if (!hasIq(row)) missing_axis = "iq";
    else missing_axis = "price";
    buckets[`missing_${missing_axis}`].push({
      family_id: row.family_id || row.model || "",
      model: row.model || "",
      provider: row.provider || "",
      release_date: row.release_date || "",
      missing_axis,
      source_url_slug: aaSlugFromSourceUrl(row.source_url || "") || lastSlugSegment(row.model || ""),
    });
  }
  for (const entries of Object.values(buckets)) {
    entries.sort((a, b) => String(a.model).localeCompare(String(b.model)));
  }
  const section = (entries) => ({
    count: entries.length,
    capped: entries.length > cap,
    entries: entries.slice(0, cap),
  });
  return {
    note: "Report-only: merged rows with exactly two of three triple elements, not admitted. Never promoted to the draft. Entries capped per bucket.",
    entry_cap: cap,
    missing_tps: section(buckets.missing_tps),
    missing_iq: section(buckets.missing_iq),
    missing_price: section(buckets.missing_price),
  };
}

/**
 * Rows the NON_USER_TIERS filter removes from admission: they carry a full
 * triple but sit on a privileged tier users cannot select (audit: OpenAI
 * GPT-5.6 Sol/Luna/Terra `max`).
 *
 * @param {object[]} mergedRows
 * @param {Record<string, string[]>} nonUserTiers — provider → lowercase tiers to drop
 */
export function buildNonUserTierDrops(mergedRows, nonUserTiers) {
  const isUserSelectable = (row) => {
    const drop = nonUserTiers?.[row.provider];
    if (!drop?.length) return true;
    return !drop.includes((row.effort_tier || "").toLowerCase());
  };
  const entries = (mergedRows ?? [])
    .filter((row) => canAdmitPlotTriple(row) && !isUserSelectable(row))
    .map((row) => ({
      model: row.model || "",
      provider: row.provider || "",
      effort_tier: row.effort_tier || "none",
    }))
    .sort((a, b) => a.model.localeCompare(b.model));
  return {
    note: "Rows with a complete triple dropped for privileged/internal effort tiers users cannot select (NON_USER_TIERS in expand-aa-multi-effort.mjs).",
    count: entries.length,
    entries,
  };
}

const NOTABLE_CAP = 50;

/** Every failure code applyArenaElo can log (stable vocabulary for the gaps doc). */
export const ARENA_FAILURE_CODES = Object.freeze([
  "arena_no_family",
  "arena_no_tier_match",
  "arena_ambiguous_family",
  "arena_multi_candidate",
  "arena_implausible_rating",
  "arena_no_rating",
]);

/**
 * Persist Arena attach failures (plan WS6, audit M2): counts by code plus the
 * top-N unmatched model names from applyArenaElo logs. Report-only — derived
 * entirely from logs the join already produced; never feeds back into matching.
 *
 * @param {{ code?: string, key?: string, slug?: string }[]} logs
 * @param {{ topN?: number }} [opts]
 */
export function buildArenaMatchFailures(logs, opts = {}) {
  const topN = Number.isFinite(opts.topN) ? opts.topN : 10;
  const countsByCode = Object.fromEntries(ARENA_FAILURE_CODES.map((c) => [c, 0]));
  const nameCounts = new Map();
  let total = 0;
  for (const log of logs ?? []) {
    const code = log?.code;
    if (!code) continue;
    total += 1;
    if (countsByCode[code] === undefined) countsByCode[code] = 0;
    countsByCode[code] += 1;
    const name = String(log.key || log.slug || "").trim();
    if (!name) continue;
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }
  const unmatchedTop = [...nameCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }));
  return {
    note: "Counts of Arena attach failures by code + most-frequent unmatched model names (from applyArenaElo logs; names span all failure codes). Persisted so attach-rate regressions are diffable run over run.",
    total_failures: total,
    counts_by_code: countsByCode,
    unmatched_top: unmatchedTop,
  };
}


function notableNames(rows, cap) {
  return rows
    .map((r) => `${r.model} (${r.provider})`)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, cap);
}

/**
 * Admitted rows hidden from the default product catalog, bucketed for decision
 * item D-H4. Held semantics: provider NOT in CLOUD_LABS (not strict
 * HELD_LABS membership) so unlisted providers are never undercounted.
 *
 *  a1 — floor-hidden, all labs (release_date below the floor)
 *  a2 — a1 ∩ cloud labs
 *  a3 — a2 ∩ release_date on/after recentFloorIso (recent notable cloud rows)
 *  b  — meets floor AND provider not in cloud labs (held 2026 rows)
 *
 * @param {object[]} admittedRows
 * @param {readonly string[]} cloudLabs — imported from src/data/catalog-scope.ts
 * @param {{ floorIso?: string, recentFloorIso?: string, notableCap?: number }} [opts]
 */
export function buildHiddenByScope(admittedRows, cloudLabs, opts = {}) {
  const floorIso = opts.floorIso ?? "2026-01-01";
  const recentFloorIso = opts.recentFloorIso ?? "2025-09-01";
  const notableCap = Number.isFinite(opts.notableCap) ? opts.notableCap : NOTABLE_CAP;
  const cloudSet = new Set(cloudLabs ?? []);

  const a1 = (admittedRows ?? []).filter(
    (r) => !meetsReleaseFloor(r.release_date, floorIso),
  );
  const a2 = a1.filter((r) => cloudSet.has(r.provider));
  const a3 = a2.filter((r) => {
    const day = String(r.release_date || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= recentFloorIso;
  });
  const b = (admittedRows ?? []).filter(
    (r) => meetsReleaseFloor(r.release_date, floorIso) && !cloudSet.has(r.provider),
  );

  return {
    note: "Report-only evidence for decision D-H4 (floor + held-lab policy). Zero scope constants changed, zero draft rows added. Held = provider not in CLOUD_LABS, so unlisted providers count as held.",
    floor: floorIso,
    recent_floor: recentFloorIso,
    a1_floor_hidden_all_labs: {
      count: a1.length,
      notable_names: notableNames(a1, notableCap),
    },
    a2_floor_hidden_cloud_labs: {
      count: a2.length,
      notable_names: notableNames(a2, notableCap),
    },
    a3_floor_hidden_cloud_since_recent: {
      count: a3.length,
      note: `a2 rows released on/after ${recentFloorIso} — the recent notable cloud pool D-H4 weighs most.`,
    },
    b_held_2026_rows: {
      count: b.length,
      notable_names: notableNames(b, notableCap),
    },
  };
}
