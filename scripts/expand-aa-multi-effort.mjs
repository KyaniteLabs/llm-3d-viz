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
  mapAaRow,
  isScorable,
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
];

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
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

function buildEffortGaps(aaRows, laddersDoc) {
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
    if (missing.length || have.size < 2) {
      gaps.push({
        family,
        provider: meta.provider,
        expected_tiers: expected,
        published_tiers: [...have].sort(),
        missing_tiers: missing,
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

for (const { url, label } of AA_URLS) {
  try {
    const html = await fetchHtml(url);
    const raw = extractRichModels(html);
    const mapped = raw
      .filter((m) => !m.deprecated)
      .map((m) => mapAaRow(m, today, label))
      .filter(isScorable);
    const before = merged.length;
    merged = mergeAaRows(merged, mapped);
    sourceStats.push({
      source: label,
      url,
      raw: raw.length,
      scorable: mapped.length,
      added: merged.length - before,
    });
  } catch (err) {
    sourceStats.push({ source: label, url, error: String(err) });
  }
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
const gaps = buildEffortGaps(merged, laddersDoc);
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
