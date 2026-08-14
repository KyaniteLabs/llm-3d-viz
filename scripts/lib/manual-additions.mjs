/**
 * Provider-announced manual additions — pre-AA rows with honest provenance.
 *
 * A curated row may enter the draft BEFORE Artificial Analysis measures it,
 * carrying only what the provider has published (release date, effort shape,
 * list prices, cited figures). Rows live in data/manual-additions.json and:
 *   - are dropped the moment any AA row of the same normalized family exists
 *     (AA supersedes provider announcements — never both);
 *   - join the multi-source overlays so OpenRouter/Arena can enrich them;
 *   - are admitted to the draft without the full speed×cost×intelligence
 *     triple (that exemption exists ONLY for this curated path — pipeline
 *     rows still require canAdmitPlotTriple);
 *   - must never carry a non-null aa_intelligence_index / ttft (AA-only
 *     domains; rejecting early keeps the no-invention rule mechanical).
 *
 * Pure functions — file IO is confined to loadManualAdditions.
 */
import fs from "node:fs";
import { normalizeFamily } from "../../src/lib/family-effort.shared.ts";

/** Fields that must stay null on manual rows (AA-measured domains). */
const AA_ONLY_FIELDS = ["aa_intelligence_index", "ttft"];

/**
 * W2 (ticket #193): fill-if-unstamped provenance at the manual ingestion
 * point. Legacy manual rows carried modality without a stamp; a manual row's
 * baseline modality is a provider-announced list fact, so it stamps
 * provider/list. Existing stamps always win (never rewrites a row's own
 * provenance — e.g. an OpenRouter-listed row keeps openrouter/list).
 */
function stampLegacyManualProvenance(row) {
  if (row.modality != null && !row.sources?.modality) {
    return {
      ...row,
      sources: { ...(row.sources || {}), modality: { origin: "provider", kind: "list" } },
    };
  }
  return row;
}

/**
 * Validate + filter manual candidate rows.
 * Returns { rows, rejected } — rejected carries { model, reason } for the log.
 */
export function vetManualRows(candidates) {
  const rows = [];
  const rejected = [];
  for (const row of candidates ?? []) {
    const model = row?.model ?? "(missing model)";
    if (!row || typeof row !== "object") {
      rejected.push({ model, reason: "not_an_object" });
      continue;
    }
    if (typeof row.model !== "string" || !row.model.trim()) {
      rejected.push({ model, reason: "missing_model" });
      continue;
    }
    if (typeof row.provider !== "string" || !row.provider.trim()) {
      rejected.push({ model, reason: "missing_provider" });
      continue;
    }
    const invented = AA_ONLY_FIELDS.filter((f) => row[f] != null);
    if (invented.length) {
      rejected.push({ model, reason: `aa_only_field_present:${invented.join(",")}` });
      continue;
    }
    rows.push(stampLegacyManualProvenance({ ...row }));
  }
  return { rows, rejected };
}

/**
 * Split manual rows into active vs superseded by AA family presence.
 * Supersede key: normalizeFamily(family_id || model) — the same bridge Arena
 * matching uses, so AA's eventual "GLM-5.3 (max)" card supersedes a manual
 * "GLM-5.3" family row regardless of slug style (glm-5.3 vs glm-5-3).
 */
export function splitSupersededManualRows(manualRows, aaRows) {
  const aaFamilies = new Set(
    (aaRows ?? []).map((r) => normalizeFamily(r?.family_id || r?.model || "")),
  );
  const active = [];
  const superseded = [];
  for (const row of manualRows ?? []) {
    const fam = normalizeFamily(row.family_id || row.model || "");
    if (fam && aaFamilies.has(fam)) superseded.push(row);
    else active.push(row);
  }
  return { active, superseded };
}

/**
 * Manual rows to append to the admitted draft: not already present by spine
 * (an overlay may have completed a manual row's triple, admitting it through
 * the normal path) and passing the tier filter.
 */
export function selectManualAdmissions(
  manualActive,
  scorableRows,
  { spineKeyOf, isUserSelectable = () => true } = {},
) {
  const key = spineKeyOf ?? null;
  if (!key) return [];
  const admittedSpines = new Set((scorableRows ?? []).map(key));
  return (manualActive ?? []).filter((row) => {
    if (!isUserSelectable(row)) return false;
    const k = key(row);
    return k && !admittedSpines.has(k);
  });
}

/**
 * Load + vet + supersede in one call.
 * @param {string} manualPath — data/manual-additions.json ({ rows: [...] } or bare array)
 * @param {object[]} aaRows — AA-mapped rows for the supersede check
 */
export function loadManualAdditions(manualPath, aaRows) {
  if (!fs.existsSync(manualPath)) {
    return { active: [], superseded: [], rejected: [] };
  }
  const doc = JSON.parse(fs.readFileSync(manualPath, "utf8"));
  const candidates = Array.isArray(doc) ? doc : doc.rows ?? [];
  const { rows, rejected } = vetManualRows(candidates);
  const { active, superseded } = splitSupersededManualRows(rows, aaRows);
  return { active, superseded, rejected };
}
