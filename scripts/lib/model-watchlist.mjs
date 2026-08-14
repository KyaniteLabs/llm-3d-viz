/**
 * Watchlist of announced-but-unmeasured models (plan WS4 / audit H2).
 *
 * Reporting only: an entry tells the operator "this model exists in the world
 * but AA has not measured it yet" — with an aging counter. It never admits
 * rows and never carries metrics. The moment AA publishes the family, the
 * status flips to measured; if a manual-additions row exists it is superseded
 * automatically (see scripts/lib/manual-additions.mjs).
 */
import { normalizeFamily } from "../../src/lib/family-effort.shared.ts";

function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * @param {Array<{family:string, provider:string, announced_date:string, note?:string}>} entries
 * @param {object[]} aaRows — AA-mapped rows for "has AA measured this family?"
 * @param {object[]} manualActiveRows — active manual-additions rows
 * @param {string} todayIso
 */
export function buildWatchlistReport(entries, aaRows, manualActiveRows, todayIso) {
  const aaFamilies = new Set(
    (aaRows ?? []).map((r) => normalizeFamily(r?.family_id || r?.model || "")),
  );
  const manualFamilies = new Set(
    (manualActiveRows ?? []).map((r) => normalizeFamily(r?.family_id || r?.model || "")),
  );
  return (entries ?? []).map((e) => {
    const fam = normalizeFamily(e.family || "");
    const measured = fam && aaFamilies.has(fam);
    const trackedManually = fam && manualFamilies.has(fam);
    return {
      family: e.family,
      provider: e.provider,
      announced_date: e.announced_date,
      days_since_announcement: daysBetween(e.announced_date, todayIso),
      status: measured
        ? "measured_by_aa"
        : trackedManually
          ? "tracked_via_manual_row"
          : "awaiting_aa_measurement",
      note: e.note ?? "",
    };
  });
}

/** Load watchlist entries from data/model-watchlist.json (rows or bare array). */
export function loadWatchlistEntries(path, fs) {
  if (!fs.existsSync(path)) return [];
  const doc = JSON.parse(fs.readFileSync(path, "utf8"));
  return Array.isArray(doc) ? doc : doc.entries ?? [];
}
