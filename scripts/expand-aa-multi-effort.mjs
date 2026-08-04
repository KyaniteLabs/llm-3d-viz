#!/usr/bin/env node
/**
 * Expand models.v0.draft.json from Artificial Analysis leaderboard public HTML.
 *
 * Pulls EVERY non-deprecated row that has Intelligence Index + output speed +
 * blended price so multi-effort families plot as real points + family trails.
 * Honest scrape only — no synthesized metrics.
 *
 * Usage: node scripts/expand-aa-multi-effort.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data/models.v0.draft.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const LB_URL = "https://artificialanalysis.ai/leaderboards/models";

function extractRichModels(html) {
  const probe = html.indexOf('\\"modelCreatorLogo\\":');
  if (probe < 0) throw new Error("rich model block not found");
  let searchFrom = probe;
  let arrStart = -1;
  for (let k = 0; k < 30; k++) {
    const i = html.lastIndexOf('\\"models\\":[', searchFrom);
    if (i < 0) break;
    if (html.slice(i, i + 8000).includes("modelCreatorLogo")) {
      arrStart = i;
      break;
    }
    searchFrom = i - 1;
  }
  if (arrStart < 0) throw new Error("rich models array marker not found");
  const marker = '\\"models\\":[';
  const i = arrStart + marker.length - 1;
  let depth = 0;
  let inStr = false;
  let j = i;
  while (j < html.length) {
    if (html.slice(j, j + 2) === '\\"') {
      inStr = !inStr;
      j += 2;
      continue;
    }
    if (!inStr) {
      if (html[j] === "[" || html[j] === "{") depth += 1;
      else if (html[j] === "]" || html[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    j += 1;
  }
  const raw = html.slice(i, j).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return JSON.parse(raw);
}

function deriveFamilyId(modelName) {
  let name = modelName.trim();
  name = name.replace(
    /\s*\((?:xhigh|max|high|medium|low|default|non-reasoning|reasoning|thinking|adaptive reasoning)[^)]*\)\s*$/i,
    "",
  );
  name = name.replace(/\s*[-–]?\s*(xhigh|max effort|max|high|medium|low)\s*$/i, "");
  name = name.replace(/\s+/g, " ").trim();
  return name.length > 0 ? name : modelName.trim();
}

function deriveEffortTier(name, isReasoning) {
  const lower = name.toLowerCase();
  if (/\(xhigh\)|xhigh effort|\bxhigh\b/.test(lower)) return "xhigh";
  if (/\(max\)|max effort|\bmax\b/.test(lower)) return "max";
  if (/\(high\)|high effort|\bhigh\b/.test(lower)) return "high";
  if (/\(medium\)|medium effort|\bmedium\b|\bmid\b/.test(lower)) return "medium";
  if (/\(low\)|low effort|\blow\b/.test(lower)) return "low";
  if (/non-reasoning/.test(lower)) return "none";
  if (isReasoning) return "default";
  return "none";
}

function costPerTask(m) {
  const block = m.intelligenceIndexCostPerTask;
  if (typeof block === "number") return block;
  if (block && typeof block === "object") {
    if (typeof block.total === "number") return block.total;
    if (block.cost && typeof block.cost.total === "number") return block.cost.total;
  }
  if (typeof m.intelligenceIndexCostTotal === "number") return m.intelligenceIndexCostTotal;
  return null;
}

function mapRow(m, today) {
  const tps = m.medianOutputTokensPerSecond ?? null;
  const priceIn = m.price1mInputTokens ?? null;
  const priceOut = m.price1mOutputTokens ?? null;
  const blended = m.price1mBlended7To2To1 ?? null;
  const intel = m.intelligenceIndex ?? null;
  // TTFT: AA stores seconds; our dataset stores milliseconds.
  const ttftS =
    m.medianTimeToFirstTokenSeconds ?? m.medianTimeToFirstAnswerTokenSeconds ?? null;
  const ttftMs = typeof ttftS === "number" ? ttftS * 1000 : null;
  const openness = m.isOpenWeights ? "open" : "closed";
  const family_id = deriveFamilyId(m.name);
  const effort_tier = deriveEffortTier(m.name, Boolean(m.isReasoning));
  /** Dataset modality is a string array (e.g. ["text"] or ["text","vision"]). */
  const modality = ["text"];
  if (m.inputModalityImage) modality.push("vision");
  if (m.inputModalitySpeech) modality.push("audio");
  return {
    model: m.name,
    provider: m.modelCreatorName || "Unknown",
    openness,
    modality,
    context_length: typeof m.contextWindowTokens === "number" ? m.contextWindowTokens : 0,
    release_date: m.releaseDate || today,
    data_date: today,
    source: "Artificial Analysis leaderboard scrape",
    source_url: `https://artificialanalysis.ai/models/${m.slug}`,
    tps,
    ttft: ttftMs,
    price_in_per_M: priceIn,
    price_out_per_M: priceOut,
    blended_price_per_M: blended,
    aa_intelligence_index: intel,
    arena_elo: null,
    swe_bench: null,
    aider_pct: null,
    gpqa: typeof m.gpqa === "number" ? m.gpqa * 100 : null,
    reasoning: Boolean(m.isReasoning),
    family_id,
    effort_tier,
    cost_per_index_task_usd: costPerTask(m),
    time_per_index_task_s:
      typeof m.intelligenceIndexTimePerTask === "number"
        ? m.intelligenceIndexTimePerTask
        : null,
  };
}

function isScorable(row) {
  return (
    row.aa_intelligence_index != null &&
    row.tps != null &&
    row.blended_price_per_M != null &&
    Number.isFinite(row.aa_intelligence_index) &&
    Number.isFinite(row.tps) &&
    Number.isFinite(row.blended_price_per_M)
  );
}

const res = await fetch(LB_URL, {
  headers: { "User-Agent": UA, Accept: "text/html" },
});
if (!res.ok) throw new Error(`leaderboard fetch ${res.status}`);
const html = await res.text();
const raw = extractRichModels(html);
const today = new Date().toISOString().slice(0, 10);

const mapped = raw
  .filter((m) => !m.deprecated)
  .map((m) => mapRow(m, today))
  .filter(isScorable)
  .sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));

// Family multi-effort stats
const byFamily = new Map();
for (const row of mapped) {
  const list = byFamily.get(row.family_id) ?? [];
  list.push(row.effort_tier);
  byFamily.set(row.family_id, list);
}
const multi = [...byFamily.entries()].filter(([, tiers]) => new Set(tiers).size > 1 || tiers.length > 1);

fs.writeFileSync(dataPath, `${JSON.stringify(mapped, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      rows: mapped.length,
      families: byFamily.size,
      multiEffortFamilies: multi.length,
      multiEffortRows: multi.reduce((n, [, tiers]) => n + tiers.length, 0),
      withCostPerTask: mapped.filter((r) => r.cost_per_index_task_usd != null).length,
      withTimePerTask: mapped.filter((r) => r.time_per_index_task_s != null).length,
      examples: multi
        .slice(0, 12)
        .map(([fam, tiers]) => ({ family: fam, tiers: [...new Set(tiers)], n: tiers.length })),
    },
    null,
    2,
  ),
);
