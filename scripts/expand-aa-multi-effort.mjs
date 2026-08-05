#!/usr/bin/env node
/**
 * Multi-source catalog build (public pages only — no invented metrics).
 *
 * Sources:
 *  1. AA leaderboard HTML (primary scored rows)
 *  2. AA /models catalog HTML (second pass — sometimes carries extra rows)
 *  3. OpenRouter /api/v1/models (discovery + pricing cross-check; never invents IQ/speed)
 *  4. data/expected-effort-ladders.json → data/effort-gaps.generated.json (coverage report)
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data/models.v0.draft.json");
const gapsPath = path.join(root, "data/effort-gaps.generated.json");
const openrouterPath = path.join(root, "data/openrouter-snapshot.json");
const laddersPath = path.join(root, "data/expected-effort-ladders.json");

const AA_URLS = [
  { url: "https://artificialanalysis.ai/leaderboards/models", label: "Artificial Analysis leaderboard scrape" },
  { url: "https://artificialanalysis.ai/models", label: "Artificial Analysis models catalog scrape" },
  // High-signal model cards: full metrics payload + related effort slugs live here.
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

/** Deep-scrape individual effort-variant model cards discovered by slug. */
async function deepScrapeSlugs(slugs, today, limit = 40) {
  const out = [];
  const unique = [...new Set(slugs)].slice(0, limit);
  for (const slug of unique) {
    const url = `https://artificialanalysis.ai/models/${slug}`;
    try {
      const html = await fetchHtml(url);
      const raw = extractAllModelsBySlug(html);
      // Prefer the page's own slug record if present
      const self = raw.find((m) => m.slug === slug);
      const pool = self ? [self, ...raw] : raw;
      for (const m of pool) {
        if (m.deprecated) continue;
        const row = mapAaRow(m, today, `AA model card deep: ${slug}`);
        if (isScorable(row)) out.push(row);
      }
    } catch {
      /* 404 or parse fail — skip */
    }
  }
  return out;
}

function rowKey(row) {
  // Prefer slug path + effort; fall back to model name.
  const slug = (row.source_url || "").split("/").pop() || "";
  return `${slug}::${row.effort_tier}::${row.model}`.toLowerCase();
}

function mergeAaRows(into, rows) {
  const byKey = new Map(into.map((r) => [rowKey(r), r]));
  for (const r of rows) {
    const k = rowKey(r);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, r);
      continue;
    }
    // Prefer non-null metrics; keep earliest source label chain.
    const merged = { ...prev };
    for (const [key, val] of Object.entries(r)) {
      if (val != null && (merged[key] == null || merged[key] === "")) merged[key] = val;
    }
    if (prev.source !== r.source) {
      merged.source = `${prev.source}; ${r.source}`;
    }
    byKey.set(k, merged);
  }
  return [...byKey.values()];
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

/** Overlay OpenRouter pricing onto AA rows when AA price is missing; never invent IQ/tps. */
function applyOpenRouterPricing(aaRows, orModels) {
  if (!orModels.length) return { rows: aaRows, overlays: 0 };
  // index by simplified name fragment
  const byId = new Map();
  for (const m of orModels) {
    byId.set(String(m.id || "").toLowerCase(), m);
    byId.set(String(m.name || "").toLowerCase(), m);
  }
  let overlays = 0;
  const rows = aaRows.map((row) => {
    if (row.price_in_per_M != null && row.price_out_per_M != null) return row;
    // Match openrouter anthropic/claude-fable-5 style
    const slug = (row.source_url || "").split("/").pop() || "";
    const candidates = [
      slug,
      `anthropic/${slug}`,
      row.model.toLowerCase(),
      `anthropic: ${row.model}`.toLowerCase(),
    ];
    let hit = null;
    for (const c of candidates) {
      if (byId.has(c)) {
        hit = byId.get(c);
        break;
      }
    }
    if (!hit?.pricing) return row;
    const pin = Number(hit.pricing.prompt);
    const pout = Number(hit.pricing.completion);
    // OpenRouter stores $ per token; convert to $ per 1M
    if (!Number.isFinite(pin) || !Number.isFinite(pout)) return row;
    overlays += 1;
    const price_in_per_M = row.price_in_per_M ?? pin * 1e6;
    const price_out_per_M = row.price_out_per_M ?? pout * 1e6;
    const blended =
      row.blended_price_per_M ??
      // 7:2:1 blend matching AA convention when missing
      (price_in_per_M * 7 + price_out_per_M * 2) / 10;
    return {
      ...row,
      price_in_per_M,
      price_out_per_M,
      blended_price_per_M: blended,
      source: `${row.source}; OpenRouter pricing overlay`,
    };
  });
  return { rows, overlays };
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
        partial_tiers: partial, // card exists: speed/price but Intelligence Index null
        published_rows: (byFamily.get(family) ?? []).length,
        complete: missing.length === 0 && have.size >= 2,
        notes: meta.notes || "",
      });
    }
  }
  // Also flag singleton families that look adaptive/reasoning without a ladder entry
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
/** All AA raw models seen (including incomplete IQ) — for gap / deep scrape discovery. */
const allRawBySlug = new Map();

for (const { url, label } of AA_URLS) {
  try {
    const html = await fetchHtml(url);
    // Prefer richest single array, but also merge every slug-bearing object on the page.
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
      .map((m) => mapAaRow(m, today, label))
      .filter(isScorable);
    const before = merged.length;
    merged = mergeAaRows(merged, mapped);
    sourceStats.push({
      source: label,
      url,
      raw: pool.length,
      scorable: mapped.length,
      added: merged.length - before,
    });
  } catch (err) {
    sourceStats.push({ source: label, url, error: String(err) });
  }
}

// Deep-scrape effort-variant cards that appear as slugs but may lack IQ in list payloads.
// e.g. claude-sonnet-5-low has a model card page (speed/price) — re-fetch for metrics.
const incompleteSlugs = [...allRawBySlug.entries()]
  .filter(([, m]) => {
    if (m.deprecated) return false;
    const tps = m.medianOutputTokensPerSecond ?? m.timescaleData?.medianOutputSpeed;
    const blend = m.price1mBlended7To2To1;
    // Missing IQ but present as a product effort card — worth a dedicated page pull
    return m.intelligenceIndex == null && tps != null && blend != null;
  })
  .map(([slug]) => slug);

// Also deep-scrape every expected-ladder family base slug + common effort suffixes
let laddersDocEarly = { ladders: {} };
if (fs.existsSync(laddersPath)) {
  laddersDocEarly = JSON.parse(fs.readFileSync(laddersPath, "utf8"));
}
const suffixGuess = ["", "-low", "-medium", "-high", "-xhigh", "-max", "-non-reasoning", "-minimal"];
const ladderSlugs = [];
for (const [family, meta] of Object.entries(laddersDocEarly.ladders || {})) {
  // rough slug from family name
  const base = family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  for (const s of suffixGuess) ladderSlugs.push(`${base}${s}`);
  // Anthropic claude- prefix variants
  if (meta.provider === "Anthropic") {
    for (const s of suffixGuess) ladderSlugs.push(`claude-${base.replace(/^claude-/, "")}${s}`);
  }
}
// Known Fable only has claude-fable-5 today — still try effort suffixes
for (const s of suffixGuess) ladderSlugs.push(`claude-fable-5${s}`);

const deepTargets = [...new Set([...incompleteSlugs, ...ladderSlugs])];
const deepRows = await deepScrapeSlugs(deepTargets, today, 60);
const beforeDeep = merged.length;
merged = mergeAaRows(merged, deepRows);
sourceStats.push({
  source: "AA model card deep scrape",
  targets: deepTargets.length,
  incomplete_list_slugs: incompleteSlugs.length,
  scorable: deepRows.length,
  added: merged.length - beforeDeep,
});

// Track partial cards: product effort slug exists with speed/price but no IQ (not plottable).
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

const or = await scrapeOpenRouter();
if (or.ok) {
  fs.writeFileSync(
    openrouterPath,
    `${JSON.stringify({ data_date: today, count: or.models.length, models: or.models }, null, 2)}\n`,
  );
}
const priced = applyOpenRouterPricing(merged, or.models || []);
merged = priced.rows.filter(isScorable);

merged.sort(
  (a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model),
);

fs.writeFileSync(dataPath, `${JSON.stringify(merged, null, 2)}\n`);

let laddersDoc = { ladders: {} };
if (fs.existsSync(laddersPath)) {
  laddersDoc = JSON.parse(fs.readFileSync(laddersPath, "utf8"));
}
const gaps = buildEffortGaps(merged, laddersDoc, partialByFamily);
fs.writeFileSync(
  gapsPath,
  `${JSON.stringify(
    {
      data_date: today,
      source_stats: sourceStats,
      openrouter: { ok: or.ok, models: or.models?.length ?? 0, price_overlays: priced.overlays },
      gaps,
      fable: gaps.find((g) => g.family === "Claude Fable 5") ?? null,
    },
    null,
    2,
  )}\n`,
);

const byFamily = new Map();
for (const row of merged) {
  const list = byFamily.get(row.family_id) ?? [];
  list.push(row.effort_tier);
  byFamily.set(row.family_id, list);
}
const multi = [...byFamily.entries()].filter(([, tiers]) => tiers.length > 1);

console.log(
  JSON.stringify(
    {
      rows: merged.length,
      families: byFamily.size,
      multiEffortFamilies: multi.length,
      source_stats: sourceStats,
      openrouter_overlays: priced.overlays,
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
