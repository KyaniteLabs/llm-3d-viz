#!/usr/bin/env node
/**
 * Multi-source catalog build — official APIs / licensed datasets only.
 *
 * Run: node --experimental-strip-types scripts/expand-aa-multi-effort.mjs
 *
 * Two-layer join (ADR-0001):
 *  1. Enrich: AA Data API free → merge → Arena Elo (HF CC BY 4.0) → OpenRouter prices
 *  2. Admit: assembled speed×cost×intelligence triple (canAdmitPlotTriple)
 *
 * Official sources (no HTML scrape of AA or arena.ai):
 *  1. Artificial Analysis Data API — GET /api/v2/language/models/free (x-api-key)
 *     https://artificialanalysis.ai/data-api/docs
 *  2. Arena leaderboard — Hugging Face lmarena-ai/leaderboard-dataset (CC BY 4.0)
 *  3. OpenRouter — GET https://openrouter.ai/api/v1/models (optional Bearer key)
 *
 * Env:
 *  AA_API_KEY | ARTIFICIAL_ANALYSIS_API_KEY — required for live AA fetch
 *  OPENROUTER_API_KEY — optional
 *  SKIP_ARENA=1 — skip Arena Elo overlay
 *  ARENA_HF_FIXTURE — path to JSON fixture of HF rows (tests)
 *  AA_FIXTURE_JSON — path to { data: FreeModelData[] } when offline (no live AA)
 *
 * Attribution: show AA + OpenRouter + Arena (CC BY) in product UI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { isScorable, deriveFamilyId } from "./lib/aa-extract.mjs";
import {
  mergeBySpine,
  spineKey,
  applyOpenRouterPricing,
  applyOpenRouterModality,
  applyOpenRouterContext,
  applyAaDerivedBlend,
  applyArenaElo,
  stampAaMeasured,
  canAdmitPlotTriple,
} from "./lib/catalog-join.mjs";
import {
  loadManualAdditions,
  selectManualAdmissions,
} from "./lib/manual-additions.mjs";
import { diffDrafts } from "./lib/draft-diff.mjs";
import {
  computeCurrentDivergences,
  mergeDivergenceRecords,
} from "./lib/price-divergence.mjs";
import {
  buildWatchlistReport,
  loadWatchlistEntries,
} from "./lib/model-watchlist.mjs";
import {
  buildAwaitingMeasurement,
  buildArenaMatchFailures,
  buildHiddenByScope,
  buildNonUserTierDrops,
} from "./lib/annex-report.mjs";
import { buildOrOverlayTelemetry } from "./lib/or-telemetry.mjs";
import {
  CLOUD_LABS,
  RELEASE_FLOOR_ISO,
} from "../src/data/catalog-scope.ts";
import { fetchAaLanguageModelsFree, mapAaApiModel, resolveAaApiKey } from "./lib/aa-api.mjs";
import { fetchArenaEntriesFromHf } from "./lib/arena-hf.mjs";
import { fetchOpenRouterModels } from "./lib/openrouter-api.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data/models.v0.draft.json");
const gapsPath = path.join(root, "data/effort-gaps.generated.json");
const openrouterPath = path.join(root, "data/openrouter-snapshot.json");
const laddersPath = path.join(root, "data/expected-effort-ladders.json");
const aaSnapshotPath = path.join(root, "data/aa-api-snapshot.json");
const snapshotPath = path.join(root, "data/atlas-catalog-snapshot.json");
const metaPath = path.join(root, "data/atlas-catalog-meta.json");
const MIN_ROWS = Number(process.env.MIN_ROWS ?? 50);

function buildEffortGaps(aaRows, laddersDoc, partialByFamily = new Map()) {
  const byFamily = new Map();
  const providerByFamily = new Map();
  for (const row of aaRows) {
    const list = byFamily.get(row.family_id) ?? [];
    list.push(row.effort_tier);
    byFamily.set(row.family_id, list);
    if (row.provider && !providerByFamily.has(row.family_id)) {
      providerByFamily.set(row.family_id, row.provider);
    }
  }
  const ladders = laddersDoc?.ladders ?? {};
  const gaps = [];
  for (const [family, meta] of Object.entries(ladders)) {
    const have = new Set(byFamily.get(family) ?? []);
    const expected = meta.expected_tiers || [];
    const missing = expected.filter((t) => !have.has(t));
    const partial = partialByFamily.get(family) || [];
    if (missing.length || have.size < 2) {
      gaps.push({
        family,
        provider: meta.provider || providerByFamily.get(family) || "Unknown",
        expected_tiers: expected,
        published_tiers: [...have],
        missing_tiers: missing,
        published_rows: have.size,
        complete: missing.length === 0 && have.size >= 2,
        notes: "",
        partial_tiers: partial,
      });
    }
  }
  for (const [family, tiers] of byFamily) {
    if (ladders[family]) continue;
    if (tiers.length < 2 && tiers.some((t) => t === "default" || t === "max")) {
      gaps.push({
        family,
        provider: providerByFamily.get(family) || "Unknown",
        expected_tiers: [],
        published_tiers: [...new Set(tiers)],
        missing_tiers: ["(additional efforts may exist at product level)"],
        published_rows: tiers.length,
        complete: false,
        notes: "Heuristic: single published row for a reasoning/adaptive model name.",
      });
    }
  }
  gaps.sort((a, b) => a.family.localeCompare(b.family));
  return gaps;
}

async function loadAaModels(today) {
  const fixture = process.env.AA_FIXTURE_JSON;
  if (fixture && fs.existsSync(fixture)) {
    const raw = JSON.parse(fs.readFileSync(fixture, "utf8"));
    const data = Array.isArray(raw) ? raw : raw.data || [];
    return {
      ok: true,
      models: data,
      tier: raw.tier || "fixture",
      pages: 0,
      source: `fixture:${fixture}`,
    };
  }
  const result = await fetchAaLanguageModelsFree({ delayMs: 50 });
  if (result.ok) {
    fs.writeFileSync(
      aaSnapshotPath,
      `${JSON.stringify(
        {
          data_date: today,
          tier: result.tier,
          pages: result.pages,
          count: result.models.length,
          data: result.models,
        },
        null,
        2,
      )}\n`,
    );
  }
  return { ...result, source: "AA Data API /language/models/free" };
}

const today = new Date().toISOString().slice(0, 10);
const sourceStats = [];

// --- 1. Artificial Analysis official Data API (free language models) ---
const aa = await loadAaModels(today);
if (!aa.ok) {
  console.error(
    JSON.stringify(
      {
        fatal: true,
        error: aa.error,
        hint: "Set AA_API_KEY from https://artificialanalysis.ai/data-api (free). HTML scraping is disabled.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
// D02: Reject empty/unexpected response shapes BEFORE writing.
if (!aa.models?.length) {
  console.error(
    JSON.stringify(
      {
        fatal: true,
        error: "AA returned 0 models — empty response or schema change. Aborting before write.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const aaMapped = aa.models.map((m) =>
  stampAaMeasured(mapAaApiModel(m, today, "AA Data API free")),
);
// Free API often omits blended $/M until applyAaDerivedBlend — count scorable after blend later.
let merged = mergeBySpine([], aaMapped);

// --- 1b. Provider-announced manual additions (pre-AA rows) ---
// Vetted + AA-superseded inside loadManualAdditions; merged into the spine
// BEFORE the overlays so OpenRouter/Arena enrich them like any AA row.
const manual = loadManualAdditions(
  path.join(root, "data/manual-additions.json"),
  aaMapped,
);
merged = mergeBySpine(merged, manual.active);
sourceStats.push({
  source: "manual additions (provider announcements)",
  active: manual.active.length,
  superseded: manual.superseded.length,
  rejected: manual.rejected,
});
sourceStats.push({
  source: aa.source,
  ok: true,
  raw: aa.models.length,
  mapped: aaMapped.length,
  scorable_pre_blend: aaMapped.filter(isScorable).length,
  tier: aa.tier,
  pages: aa.pages,
});

// --- 2. Arena Elo via HF CC BY 4.0 dataset (not arena.ai HTML) ---
const arena = await fetchArenaEntriesFromHf({ cacheDir: path.join(root, "data") });
// D06: When a source is enabled and fails, fail the refresh instead of silently
// producing a degraded catalog with null Arena Elo.
if (!arena.ok && !arena.skipped) {
  console.error(
    JSON.stringify(
      { fatal: true, error: `Arena source failed: ${arena.error}. Set SKIP_ARENA=1 to skip.` },
      null,
      2,
    ),
  );
  process.exit(1);
}
let arenaAttaches = 0;
let arenaLogs = [];
if (arena.entries?.length) {
  const applied = applyArenaElo(merged, arena.entries);
  merged = applied.rows;
  arenaAttaches = applied.attaches;
  arenaLogs = applied.logs;
}
sourceStats.push({
  source: "Arena HF leaderboard-dataset text_style_control (CC BY 4.0)",
  ok: arena.ok,
  skipped: arena.skipped ?? false,
  error: arena.error,
  entries: arena.entries?.length ?? 0,
  attaches: arenaAttaches,
  log_sample: arenaLogs.slice(0, 8),
});

// --- 3. AA-derived blend, then OpenRouter list prices + modality + context ---
merged = applyAaDerivedBlend(merged);
sourceStats[0].scorable_after_blend = merged.filter(isScorable).length;
const or = await fetchOpenRouterModels();
// D06: OpenRouter failure → fail the refresh (do not silently overlay empty data).
if (!or.ok) {
  console.error(
    JSON.stringify(
      { fatal: true, error: `OpenRouter source failed: ${or.error}.` },
      null,
      2,
    ),
  );
  process.exit(1);
}
fs.writeFileSync(
  openrouterPath,
  `${JSON.stringify(
    {
      data_date: today,
      count: or.models.length,
      authenticated: or.authenticated,
      models: or.models,
    },
    null,
    2,
  )}\n`,
);
// D04: Apply modality overlay (vision/audio/video) from OpenRouter.
const modal = applyOpenRouterModality(merged, or.models || []);
merged = modal.rows;
// D05: Apply pricing overlay (with cache-read price support).
const priced = applyOpenRouterPricing(merged, or.models || []);
merged = priced.rows;
// D01: Apply context_length overlay from OpenRouter.
const ctx = applyOpenRouterContext(merged, or.models || []);
merged = ctx.rows;

// --- 3b. AA↔OpenRouter price-divergence canary (plan WS2 stage 1) ---
// Records level divergences with aging + flap grace; alerts fire on DELTA
// (scripts/lib/catalog-alerts.mjs --evaluate). Never mutates prices.
let prevGapsDoc = {};
if (fs.existsSync(gapsPath)) {
  try {
    prevGapsDoc = JSON.parse(fs.readFileSync(gapsPath, "utf8"));
  } catch { /* corrupt/truncated gaps file: start from empty divergence state */ }
}
const currentDivergences = computeCurrentDivergences(merged, or.models || [], today);
const divergenceRecords = mergeDivergenceRecords(
  currentDivergences,
  prevGapsDoc?.price_divergences?.records ?? null,
  today,
);
const divergenceDeltaCount = divergenceRecords.filter((r) => r.changed && !r.stale).length;
sourceStats.push({
  source: "price-divergence canary (AA vs OpenRouter)",
  records: divergenceRecords.length,
  delta_changed: divergenceDeltaCount,
});
sourceStats.push({
  source: "OpenRouter /api/v1/models",
  ok: or.ok,
  models: or.models?.length ?? 0,
  price_overlays: priced.overlays,
  modality_overlays: modal.attaches,
  context_overlays: ctx.overlays,
  authenticated: or.authenticated ?? false,
  error: or.error,
});

// --- 3c. OR overlay telemetry (plan WS6, M3): report-only match-rate histogram.
// Reuses the production matcher over the same merged rows — no behavior change.
const orTelemetry = buildOrOverlayTelemetry(merged, or.models || []);

/**
 * Effort tiers dropped from the product catalog per provider — rungs above the
 * lab's highest user-selectable effort. Artificial Analysis sometimes publishes
 * measured points for privileged/internal tiers real users cannot choose; those
 * would distort the instrument, so they are cut before admission.
 *
 *   OpenAI `max` — AA measures it, but OpenAI's API/playground exposes effort
 *   only up to `xhigh` ("extra high"); `max` is not user-selectable.
 */
const NON_USER_TIERS = {
  OpenAI: ["max"],
};
function isUserSelectableTier(row) {
  const drop = NON_USER_TIERS[row.provider];
  if (!drop?.length) return true;
  return !drop.includes((row.effort_tier || "").toLowerCase());
}

// --- 4. Admit product catalog ---
// Measured rows require the complete speed×cost×intelligence triple; vetted
// manual additions (provider announcements) are admitted without it, deduped
// by spine in case an overlay completed their triple upstream.
const measured = merged.filter(canAdmitPlotTriple).filter(isUserSelectableTier);
const manualAdmitted = selectManualAdmissions(manual.active, measured, {
  spineKeyOf: spineKey,
  isUserSelectable: isUserSelectableTier,
});
const admitted = [...measured, ...manualAdmitted];
admitted.sort(
  (a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model),
);

// D02: Validate the complete candidate in memory BEFORE writing.
// Reject empty catalogs and enforce a shrink gate vs the previous draft.
if (!admitted.length) {
  console.error(
    JSON.stringify(
      { fatal: true, error: "0 admitted rows after join — aborting before write." },
      null,
      2,
    ),
  );
  process.exit(1);
}
let prevRowCount = 0;
let prevDraftRows = null;
if (fs.existsSync(dataPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    if (Array.isArray(prev)) {
      prevRowCount = prev.length;
      prevDraftRows = prev; // kept whole for the WS1 row diff below
    }
  } catch { /* ignore parse error on stale file */ }
}
if (prevRowCount > 0) {
  const shrinkPct = Math.round(((prevRowCount - admitted.length) / prevRowCount) * 100);
  if (shrinkPct > 50) {
    console.error(
      JSON.stringify(
        {
          fatal: true,
          error: `admitted rows dropped ${shrinkPct}% (${prevRowCount} → ${admitted.length}) — aborting before write.`,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}
if (admitted.length < MIN_ROWS) {
  console.error(
    JSON.stringify(
      { fatal: true, error: `admitted rows ${admitted.length} < MIN_ROWS=${MIN_ROWS} — aborting before write.` },
      null,
      2,
    ),
  );
  process.exit(1);
}

// --- 4b. Pre-admission visibility annex (plan WS3): report-only, no admission ---
// Awaiting-measurement pool from in-memory merged rows; NON_USER_TIERS drops
// named; hidden_by_scope evidence for decision item D-H4. Scope semantics come
// from the imported scope module — never re-hardcoded lists.
const awaitingMeasurement = buildAwaitingMeasurement(merged, admitted);
const nonUserTierDrops = buildNonUserTierDrops(merged, NON_USER_TIERS);
const hiddenByScope = buildHiddenByScope(admitted, CLOUD_LABS, {
  floorIso: RELEASE_FLOOR_ISO,
});

// --- 5. Build effort gaps (D17: include partial tiers from rows missing only IQ) ---
let laddersDoc = { ladders: {} };
if (fs.existsSync(laddersPath)) {
  laddersDoc = JSON.parse(fs.readFileSync(laddersPath, "utf8"));
}
// D17: partialByFamily from joined rows that have speed+price but are missing IQ.
const partialByFamily = new Map();
for (const row of merged) {
  if (
    row.aa_intelligence_index == null &&
    row.tps != null &&
    Number.isFinite(row.tps) &&
    row.blended_price_per_M != null &&
    Number.isFinite(row.blended_price_per_M)
  ) {
    const family = row.family_id || row.model;
    let list = partialByFamily.get(family);
    if (!list) {
      list = [];
      partialByFamily.set(family, list);
    }
    list.push({ tier: row.effort_tier, slug: String(row.source_url || "").split("/").pop() || row.model || "" });
  }
}
const gaps = buildEffortGaps(admitted, laddersDoc, partialByFamily);

// --- 5a. Arena match-failure persistence (plan WS6, M2): counts by code +
// top unmatched names from the join logs — attach-rate regressions become
// diffable run over run. Report-only.
const arenaMatchFailures = buildArenaMatchFailures(arenaLogs);

// --- 5b. Watchlist report (plan WS4): announced-but-unmeasured models ---
const watchlistEntries = loadWatchlistEntries(
  path.join(root, "data/model-watchlist.json"),
  fs,
);
const watchlist = buildWatchlistReport(watchlistEntries, aaMapped, manual.active, today);

// --- 5c. Draft diff (plan WS1): previous → admitted, rename-aware ---
const draftDiff = diffDrafts(prevDraftRows, admitted);
const diffPath = path.join(root, "data/catalog-diff.generated.json");
const diffDoc = {
  data_date: today,
  available: draftDiff.available,
  prev_row_count: prevRowCount,
  next_row_count: admitted.length,
  ...draftDiff,
};

const gapsDoc = {
  data_date: today,
  ingestion: "official-api-only",
  attribution: {
    artificial_analysis: "https://artificialanalysis.ai (Data API)",
    openrouter: "https://openrouter.ai (models list prices)",
    arena: "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset (CC BY 4.0)",
  },
  source_stats: sourceStats,
  openrouter: {
    ok: or.ok,
    models: or.models?.length ?? 0,
    price_overlays: priced.overlays,
    modality_overlays: modal.attaches,
    context_overlays: ctx.overlays,
  },
  arena: {
    ok: arena.ok,
    entries: arena.entries?.length ?? 0,
    attaches: arenaAttaches,
    error: arena.error,
    license: "CC BY 4.0",
  },
  arena_match_failures: arenaMatchFailures,
  or_overlay_telemetry: {
    note: "Report-only (WS6, M3): overlay attach counts + OpenRouter match-rate histogram over merged rows (production matcher, no behavior change). The unmatched-provider histogram tells us whether context/modality null-coverage is fixable by org-map growth.",
    price_overlays: priced.overlays,
    modality_overlays: modal.attaches,
    context_overlays: ctx.overlays,
    ...orTelemetry,
  },
  price_divergences: {
    count: divergenceRecords.length,
    delta_count: divergenceDeltaCount,
    record_ratio_threshold: 1.25,
    note: "Level records with aging (first_seen/age_days) + one-run flap grace. Alert on delta only — see scripts/lib/catalog-alerts.mjs. Weekly operator review while any age_days > 7.",
    records: divergenceRecords,
  },
  watchlist,
  awaiting_measurement: awaitingMeasurement,
  non_user_tier_drops: nonUserTierDrops,
  hidden_by_scope: hiddenByScope,
  gaps,
  fable: gaps.find((g) => g.family === "Claude Fable 5") ?? null,
};

// --- 6. D02+D07: Atomic transaction — write all outputs to temp, then rename ---
const draftJson = `${JSON.stringify(admitted, null, 2)}\n`;
const gapsJson = `${JSON.stringify(gapsDoc, null, 2)}\n`;
const diffJson = `${JSON.stringify(diffDoc, null, 2)}\n`;
const sourceHash = crypto.createHash("sha256").update(draftJson).digest("hex");
const snapshotJson = draftJson; // snapshot is a copy of the draft
const meta = {
  schema_version: "1.1",
  exported_at: new Date().toISOString(),
  model_count: admitted.length,
  source: "data/models.v0.draft.json",
  snapshot_file: "data/atlas-catalog-snapshot.json",
  source_sha256: sourceHash,
  data_date: today,
  note: "Null metrics preserved. Never invent Index/tok/s/price client-side. Snapshot duplicates data/models.v0.draft.json byte-for-byte; dedupe is leader-gated (WS7/L2).",
};
const metaJson = `${JSON.stringify(meta, null, 2)}\n`;

const tempFiles = [
  [dataPath, draftJson],
  [gapsPath, gapsJson],
  [snapshotPath, snapshotJson],
  [metaPath, metaJson],
  [diffPath, diffJson],
];
try {
  // Write all temp files first
  for (const [dest, content] of tempFiles) {
    fs.writeFileSync(`${dest}.tmp`, content);
  }
  // Rename all atomically (on same filesystem, rename is atomic)
  for (const [dest] of tempFiles) {
    fs.renameSync(`${dest}.tmp`, dest);
  }
} catch (err) {
  // Clean up any leftover temp files
  for (const [dest] of tempFiles) {
    try { fs.unlinkSync(`${dest}.tmp`); } catch { /* ignore */ }
  }
  console.error(
    JSON.stringify({ fatal: true, error: `Atomic write failed: ${err}` }, null, 2),
  );
  process.exit(1);
}

const byFamily = new Map();
for (const row of admitted) {
  const list = byFamily.get(row.family_id) ?? [];
  list.push(row.effort_tier);
  byFamily.set(row.family_id, list);
}
const multi = [...byFamily.entries()].filter(([, tiers]) => tiers.length > 1);

console.log(
  JSON.stringify(
    {
      rows: admitted.length,
      measured_rows: measured.length,
      manual_additions: manualAdmitted.length,
      manual_superseded: manual.superseded.length,
      partials_in_memory: merged.length - measured.length,
      awaiting_measurement:
        awaitingMeasurement.missing_tps.count +
        awaitingMeasurement.missing_iq.count +
        awaitingMeasurement.missing_price.count,
      non_user_tier_drops: nonUserTierDrops.count,
      hidden_by_scope: {
        a1_floor_hidden_all_labs: hiddenByScope.a1_floor_hidden_all_labs.count,
        a2_floor_hidden_cloud_labs: hiddenByScope.a2_floor_hidden_cloud_labs.count,
        b_held_2026_rows: hiddenByScope.b_held_2026_rows.count,
      },
      diff: draftDiff.available ? draftDiff.counts : "unavailable-first-run",
      price_divergences: divergenceRecords.length,
      price_divergence_deltas: divergenceDeltaCount,
      watchlist_awaiting: watchlist.filter((w) => w.status === "awaiting_aa_measurement").length,
      families: byFamily.size,
      multiEffortFamilies: multi.length,
      source_stats: sourceStats,
      openrouter_overlays: priced.overlays,
      arena_attaches: arenaAttaches,
      arena_match_failures: {
        total: arenaMatchFailures.total_failures,
        counts_by_code: arenaMatchFailures.counts_by_code,
        unmatched_top: arenaMatchFailures.unmatched_top,
      },
      or_overlay_telemetry: {
        price_overlays: priced.overlays,
        modality_overlays: modal.attaches,
        context_overlays: ctx.overlays,
        rows_matched: orTelemetry.rows_matched,
        rows_unmatched: orTelemetry.rows_unmatched,
      },
      effort_gaps: gaps.length,
      aa_key_present: Boolean(resolveAaApiKey()),
      source_sha256: sourceHash,
      examples: multi
        .slice(0, 10)
        .map(([fam, tiers]) => ({ family: fam, tiers: [...new Set(tiers)], n: tiers.length })),
    },
    null,
    2,
  ),
);