#!/usr/bin/env node
/**
 * Multi-source catalog build (public pages only — no invented metrics).
 *
 * Run with: node --experimental-strip-types scripts/expand-aa-multi-effort.mjs
 * (imports pure TypeScript normalizers under src/lib/)
 *
 * Two-layer join (ralplan):
 *  1. Enrich partials: AA map → merge → Arena Elo → OpenRouter prices + provenance
 *  2. Admit: scorable filter only at product JSON write
 *
 * Sources:
 *  1. AA leaderboard / catalog / model cards HTML
 *  2. Arena text style-control board (Elo overlay; soft-fail)
 *  3. OpenRouter /api/v1/models (list price overlay; never invents IQ/speed)
 *  4. data/expected-effort-ladders.json → effort-gaps.generated.json
 *
 * Env:
 *  ARENA_FIXTURE=1 — read scripts/fixtures/arena-text-style-control.snippet.html
 *  SKIP_ARENA=1 — skip Arena entirely
 *
 * Usage: node scripts/expand-aa-multi-effort.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  UA,
  extractRichModels,
  extractAllModelsBySlug,
  mapAaRow,
  isScorable,
  deriveFamilyId,
} from "./lib/aa-extract.mjs";
import {
  mergeBySpine,
  applyOpenRouterPricing,
  applyAaDerivedBlend,
  applyArenaElo,
  extractArenaEntriesFromHtml,
  stampAaMeasured,
} from "./lib/catalog-join.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data/models.v0.draft.json");
const gapsPath = path.join(root, "data/effort-gaps.generated.json");
const openrouterPath = path.join(root, "data/openrouter-snapshot.json");
const laddersPath = path.join(root, "data/expected-effort-ladders.json");
const arenaFixturePath = path.join(
  root,
  "scripts/fixtures/arena-text-style-control.snippet.html",
);

const AA_URLS = [
  { url: "https://artificialanalysis.ai/leaderboards/models", label: "Artificial Analysis leaderboard scrape" },
  { url: "https://artificialanalysis.ai/models", label: "Artificial Analysis models catalog scrape" },
  { url: "https://artificialanalysis.ai/models/claude-fable-5", label: "AA model card: claude-fable-5" },
  { url: "https://artificialanalysis.ai/models/claude-opus-5", label: "AA model card: claude-opus-5" },
  { url: "https://artificialanalysis.ai/models/claude-sonnet-5", label: "AA model card: claude-sonnet-5" },
  { url: "https://artificialanalysis.ai/models/gpt-5-6-sol", label: "AA model card: gpt-5-6-sol" },
  { url: "https://artificialanalysis.ai/models/gpt-5-6-luna", label: "AA model card: gpt-5-6-luna" },
  { url: "https://artificialanalysis.ai/models/gpt-5-6-terra", label: "AA model card: gpt-5-6-terra" },
  { url: "https://artificialanalysis.ai/models/gemini-3-5-flash", label: "AA model card: gemini-3-5-flash" },
  { url: "https://artificialanalysis.ai/providers/anthropic", label: "AA provider: anthropic" },
];

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

/** Deep-scrape effort-variant cards — keep partials (no early isScorable). */
async function deepScrapeSlugs(slugs, today, limit = 40) {
  const out = [];
  const unique = [...new Set(slugs)].slice(0, limit);
  for (const slug of unique) {
    const url = `https://artificialanalysis.ai/models/${slug}`;
    try {
      const html = await fetchHtml(url);
      const raw = extractAllModelsBySlug(html);
      const self = raw.find((m) => m.slug === slug);
      const pool = self ? [self, ...raw] : raw;
      for (const m of pool) {
        if (m.deprecated) continue;
        out.push(mapAaRow(m, today, `AA model card deep: ${slug}`));
      }
    } catch {
      /* 404 or parse fail — skip */
    }
  }
  return out;
}

async function scrapeOpenRouter() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, status: res.status, models: [] };
    const body = await res.json();
    const models = Array.isArray(body.data) ? body.data : [];
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: String(err), models: [] };
  }
}

/** Arena Elo scrape — soft-fail, never throws out of expand. */
async function scrapeArenaEntries() {
  if (process.env.SKIP_ARENA === "1") {
    return { ok: true, skipped: true, entries: [], error: null };
  }
  try {
    let html;
    if (process.env.ARENA_FIXTURE === "1") {
      html = fs.readFileSync(arenaFixturePath, "utf8");
    } else {
      html = await fetchHtml("https://arena.ai/leaderboard/text");
    }
    const entries = extractArenaEntriesFromHtml(html);
    return { ok: true, skipped: false, entries, error: null };
  } catch (err) {
    return { ok: false, skipped: false, entries: [], error: String(err) };
  }
}

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
        published_tiers: [...have].sort(),
        missing_tiers: missing,
        partial_tiers: partial,
        published_rows: (byFamily.get(family) ?? []).length,
        complete: missing.length === 0 && have.size >= 2,
        notes: meta.notes || "",
      });
    }
  }
  for (const [family, tiers] of byFamily) {
    if (tiers.length >= 2) continue;
    if (ladders[family]) continue;
    const sample = aaRows.find((r) => r.family_id === family);
    if (!sample) continue;
    if (!/adaptive|reasoning|effort|thinking/i.test(sample.model)) continue;
    gaps.push({
      family,
      provider: sample.provider,
      expected_tiers: ["(unknown product ladder)"],
      published_tiers: [...new Set(tiers)],
      missing_tiers: ["(additional efforts may exist at product level)"],
      published_rows: tiers.length,
      complete: false,
      notes: "Heuristic: single published row for a reasoning/adaptive model name.",
    });
  }
  gaps.sort((a, b) => a.family.localeCompare(b.family));
  return gaps;
}

const today = new Date().toISOString().slice(0, 10);
let merged = [];
const sourceStats = [];
const allRawBySlug = new Map();

// --- 1–2. AA list/catalog/cards: map all non-deprecated (including partials) ---
for (const { url, label } of AA_URLS) {
  try {
    const html = await fetchHtml(url);
    let raw = [];
    try {
      raw = extractRichModels(html);
    } catch {
      raw = [];
    }
    const allOnPage = extractAllModelsBySlug(html);
    for (const m of allOnPage) {
      if (m?.slug) allRawBySlug.set(m.slug, m);
    }
    const pool = allOnPage.length ? allOnPage : raw;
    const mapped = pool
      .filter((m) => !m.deprecated)
      .map((m) => stampAaMeasured(mapAaRow(m, today, label)));
    const before = merged.length;
    merged = mergeBySpine(merged, mapped);
    sourceStats.push({
      source: label,
      url,
      raw: pool.length,
      mapped: mapped.length,
      scorable: mapped.filter(isScorable).length,
      added: merged.length - before,
    });
  } catch (err) {
    sourceStats.push({ source: label, url, error: String(err) });
  }
}

// --- Deep scrape: keep partials ---
const incompleteSlugs = [...allRawBySlug.entries()]
  .filter(([, m]) => {
    if (m.deprecated) return false;
    const tps = m.medianOutputTokensPerSecond ?? m.timescaleData?.medianOutputSpeed;
    const blend = m.price1mBlended7To2To1;
    return m.intelligenceIndex == null && tps != null && blend != null;
  })
  .map(([slug]) => slug);

let laddersDocEarly = { ladders: {} };
if (fs.existsSync(laddersPath)) {
  laddersDocEarly = JSON.parse(fs.readFileSync(laddersPath, "utf8"));
}
const suffixGuess = ["", "-low", "-medium", "-high", "-xhigh", "-max", "-non-reasoning", "-minimal"];
const ladderSlugs = [];
for (const [family, meta] of Object.entries(laddersDocEarly.ladders || {})) {
  const base = family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  for (const s of suffixGuess) ladderSlugs.push(`${base}${s}`);
  if (meta.provider === "Anthropic") {
    for (const s of suffixGuess) ladderSlugs.push(`claude-${base.replace(/^claude-/, "")}${s}`);
  }
}
for (const s of suffixGuess) ladderSlugs.push(`claude-fable-5${s}`);

const deepTargets = [...new Set([...incompleteSlugs, ...ladderSlugs])];
const deepRows = (await deepScrapeSlugs(deepTargets, today, 60)).map(stampAaMeasured);
const beforeDeep = merged.length;
merged = mergeBySpine(merged, deepRows);
sourceStats.push({
  source: "AA model card deep scrape",
  targets: deepTargets.length,
  incomplete_list_slugs: incompleteSlugs.length,
  mapped: deepRows.length,
  scorable: deepRows.filter(isScorable).length,
  added: merged.length - beforeDeep,
});

// Partial cards for gap reporting
const partialByFamily = new Map();
for (const [slug, m] of allRawBySlug) {
  if (m.deprecated) continue;
  const tps = m.medianOutputTokensPerSecond ?? m.timescaleData?.medianOutputSpeed;
  const blend = m.price1mBlended7To2To1;
  if (m.intelligenceIndex != null || tps == null || blend == null) continue;
  const fam = deriveFamilyId(m.name || slug);
  const tier = (m.name && mapAaRow(m, today, "partial").effort_tier) || "unknown";
  const list = partialByFamily.get(fam) ?? [];
  list.push({ tier, slug, tps, blend });
  partialByFamily.set(fam, list);
}

// --- 3. Arena Elo overlay (soft-fail) ---
const arena = await scrapeArenaEntries();
let arenaAttaches = 0;
let arenaLogs = [];
if (arena.entries.length) {
  const applied = applyArenaElo(merged, arena.entries);
  merged = applied.rows;
  arenaAttaches = applied.attaches;
  arenaLogs = applied.logs;
}
sourceStats.push({
  source: "Arena text style-control",
  ok: arena.ok,
  skipped: arena.skipped ?? false,
  error: arena.error,
  entries: arena.entries.length,
  attaches: arenaAttaches,
  log_sample: arenaLogs.slice(0, 8),
});

// --- 4. AA-derived blend (when in/out present), then OpenRouter list overlay ---
merged = applyAaDerivedBlend(merged);
const or = await scrapeOpenRouter();
if (or.ok) {
  fs.writeFileSync(
    openrouterPath,
    `${JSON.stringify({ data_date: today, count: or.models.length, models: or.models }, null, 2)}\n`,
  );
}
const priced = applyOpenRouterPricing(merged, or.models || []);
merged = priced.rows;

// --- 5. Emit scorable-only product catalog ---
const scorable = merged.filter(isScorable);
scorable.sort(
  (a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model),
);

fs.writeFileSync(dataPath, `${JSON.stringify(scorable, null, 2)}\n`);

let laddersDoc = { ladders: {} };
if (fs.existsSync(laddersPath)) {
  laddersDoc = JSON.parse(fs.readFileSync(laddersPath, "utf8"));
}
// Gaps from scorable published tiers (product view) + partial cards
const gaps = buildEffortGaps(scorable, laddersDoc, partialByFamily);
fs.writeFileSync(
  gapsPath,
  `${JSON.stringify(
    {
      data_date: today,
      source_stats: sourceStats,
      openrouter: { ok: or.ok, models: or.models?.length ?? 0, price_overlays: priced.overlays },
      arena: {
        ok: arena.ok,
        entries: arena.entries.length,
        attaches: arenaAttaches,
        error: arena.error,
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
      fable_gap: gaps.find((g) => g.family === "Claude Fable 5") ?? null,
      examples: multi
        .slice(0, 10)
        .map(([fam, tiers]) => ({ family: fam, tiers: [...new Set(tiers)], n: tiers.length })),
    },
    null,
    2,
  ),
);
