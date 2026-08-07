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
import { isScorable, deriveFamilyId } from "./lib/aa-extract.mjs";
import {
  mergeBySpine,
  applyOpenRouterPricing,
  applyAaDerivedBlend,
  applyArenaElo,
  stampAaMeasured,
  canAdmitPlotTriple,
} from "./lib/catalog-join.mjs";
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

function buildEffortGaps(aaRows, laddersDoc, partialByFamily = new Map()) {
  const byFamily = new Map();
  for (const row of aaRows) {
    const list = byFamily.get(row.family_id) ?? [];
    list.push(row.effort_tier);
    byFamily.set(row.family_id, list);
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
        provider: meta.provider,
        expected_tiers: expected,
        published_tiers: [...have],
        missing_tiers: missing,
        published_rows: have.size,
        complete: missing.length === 0 && have.size >= 2,
        partial_cards: partial,
      });
    }
  }
  for (const [family, tiers] of byFamily) {
    if (ladders[family]) continue;
    if (tiers.length < 2 && tiers.some((t) => t === "default" || t === "max")) {
      gaps.push({
        family,
        provider: null,
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

const aaMapped = aa.models.map((m) =>
  stampAaMeasured(mapAaApiModel(m, today, "AA Data API free")),
);
let merged = mergeBySpine([], aaMapped);
sourceStats.push({
  source: aa.source,
  ok: true,
  raw: aa.models.length,
  mapped: aaMapped.length,
  scorable: aaMapped.filter(isScorable).length,
  tier: aa.tier,
  pages: aa.pages,
});

// --- 2. Arena Elo via HF CC BY 4.0 dataset (not arena.ai HTML) ---
const arena = await fetchArenaEntriesFromHf({ cacheDir: path.join(root, "data") });
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

// --- 3. AA-derived blend, then OpenRouter list prices ---
merged = applyAaDerivedBlend(merged);
const or = await fetchOpenRouterModels();
if (or.ok) {
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
}
const priced = applyOpenRouterPricing(merged, or.models || []);
merged = priced.rows;
sourceStats.push({
  source: "OpenRouter /api/v1/models",
  ok: or.ok,
  models: or.models?.length ?? 0,
  price_overlays: priced.overlays,
  authenticated: or.authenticated ?? false,
  error: or.error,
});

// --- 4. Admit scorable product catalog ---
const scorable = merged.filter(canAdmitPlotTriple);
scorable.sort(
  (a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model),
);

fs.writeFileSync(dataPath, `${JSON.stringify(scorable, null, 2)}\n`);

let laddersDoc = { ladders: {} };
if (fs.existsSync(laddersPath)) {
  laddersDoc = JSON.parse(fs.readFileSync(laddersPath, "utf8"));
}
const gaps = buildEffortGaps(scorable, laddersDoc, new Map());
fs.writeFileSync(
  gapsPath,
  `${JSON.stringify(
    {
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
      },
      arena: {
        ok: arena.ok,
        entries: arena.entries?.length ?? 0,
        attaches: arenaAttaches,
        error: arena.error,
        license: "CC BY 4.0",
      },
      gaps,
      fable: gaps.find((g) => g.family === "Claude Fable 5") ?? null,
    },
    null,
    2,
  )}\n`,
);

const byFamily = new Map();
for (const row of scorable) {
  const list = byFamily.get(row.family_id) ?? [];
  list.push(row.effort_tier);
  byFamily.set(row.family_id, list);
}
const multi = [...byFamily.entries()].filter(([, tiers]) => tiers.length > 1);

console.log(
  JSON.stringify(
    {
      rows: scorable.length,
      partials_in_memory: merged.length - scorable.length,
      families: byFamily.size,
      multiEffortFamilies: multi.length,
      source_stats: sourceStats,
      openrouter_overlays: priced.overlays,
      arena_attaches: arenaAttaches,
      effort_gaps: gaps.length,
      aa_key_present: Boolean(resolveAaApiKey()),
      examples: multi
        .slice(0, 10)
        .map(([fam, tiers]) => ({ family: fam, tiers: [...new Set(tiers)], n: tiers.length })),
    },
    null,
    2,
  ),
);
