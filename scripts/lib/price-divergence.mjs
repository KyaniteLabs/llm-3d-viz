/**
 * AA ↔ OpenRouter price-divergence canary (plan WS2 stage 1 / audit H3).
 *
 * Records per-side divergence for every row matched in both sources. Never
 * mutates prices (plan principle 2). Alerting is on DELTA vs the previous
 * run's records, not level — level-only persistence with aging so a standing
 * 3× disagreement is visible but not noisy. A one-run absence keeps a record
 * alive (batching-lag flap grace); two consecutive absences drops it.
 */
import { buildOpenRouterIndex, matchOpenRouterModel } from "./catalog-join.mjs";

/** Record a divergence when sources disagree by ≥25% on a side. */
export const DIVERGENCE_RECORD_RATIO = 1.25;
/** A record counts as changed when its ratio moved by >2 points. */
export const DIVERGENCE_DELTA_STEP = 0.02;

function sig(record) {
  return `${record.model}::${record.field}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Compute current-run divergences for joined rows vs OpenRouter models.
 * @param {object[]} rows — joined catalog rows (AA prices already applied)
 * @param {object[]} orModels — OpenRouter models list
 */
export function computeCurrentDivergences(rows, orModels, today = todayIso()) {
  if (!orModels?.length) return [];
  const index = buildOpenRouterIndex(orModels);
  const out = [];
  for (const row of rows ?? []) {
    const match = matchOpenRouterModel(row, index);
    const pricing = match?.model?.pricing;
    if (!pricing) continue;
    const sides = [
      ["price_in_per_M", "prompt"],
      ["price_out_per_M", "completion"],
      ["price_cache_per_M", "input_cache_read"],
    ];
    for (const [field, orKey] of sides) {
      const aa = row[field];
      const orTok = Number(pricing[orKey]);
      if (typeof aa !== "number" || aa <= 0 || !Number.isFinite(orTok) || orTok <= 0) continue;
      const orPerM = orTok * 1e6;
      const ratio = Math.max(aa, orPerM) / Math.min(aa, orPerM);
      if (ratio < DIVERGENCE_RECORD_RATIO) continue;
      out.push({
        model: row.model,
        provider: row.provider,
        field,
        aa_per_M: aa,
        or_per_M: round2(orPerM),
        ratio: round2(ratio),
        first_seen: today,
      });
    }
  }
  return out;
}

/**
 * Merge current divergences with previous records: carry first_seen (age),
 * mark changed vs previous ratio, apply one-run flap grace before dropping.
 * @param {object[]} current — output of computeCurrentDivergences
 * @param {object[]|null} prevRecords — previous merged records (null on first run)
 * @param {string} today
 */
export function mergeDivergenceRecords(current, prevRecords, today = todayIso()) {
  const prevBySig = new Map((prevRecords ?? []).map((r) => [sig(r), r]));
  const records = (current ?? []).map((c) => {
    const prev = prevBySig.get(sig(c));
    if (!prev) return { ...c, age_days: 0, changed: true, absent_runs: 0 };
    return {
      ...c,
      first_seen: prev.first_seen,
      age_days: daysBetween(prev.first_seen, today),
      changed: Math.abs((prev.ratio ?? 0) - c.ratio) > DIVERGENCE_DELTA_STEP,
      absent_runs: 0,
    };
  });
  // Flap grace: previous records missing this run survive exactly one absence.
  const nowSigs = new Set(records.map(sig));
  for (const [s, prev] of prevBySig) {
    if (nowSigs.has(s)) continue;
    const absent = (prev.absent_runs ?? 0) + 1;
    if (absent >= 2) continue; // dropped after two consecutive absences
    records.push({
      ...prev,
      age_days: daysBetween(prev.first_seen, today),
      changed: false,
      absent_runs: absent,
      stale: true,
    });
  }
  records.sort((a, b) => b.ratio - a.ratio || a.model.localeCompare(b.model));
  return records;
}

function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
