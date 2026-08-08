#!/usr/bin/env node
/**
 * Print / write catalog field coverage (null honesty).
 * D16: Reuses production admission predicates, counts distinct effort tiers,
 * reports invalid/duplicate/unknown buckets, and includes context/modality/
 * reasoning coverage.
 *
 * Usage:
 *   node scripts/catalog-coverage-report.mjs
 *   node scripts/catalog-coverage-report.mjs --json > logs/coverage.json
 *   node scripts/catalog-coverage-report.mjs --out logs/catalog-coverage.txt
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = resolve(ROOT, "data/models.v0.draft.json");

const KEYS = [
  "aa_intelligence_index",
  "tps",
  "ttft",
  "blended_price_per_M",
  "price_in_per_M",
  "price_out_per_M",
  "price_cache_per_M",
  "cost_per_index_task_usd",
  "time_per_index_task_s",
  "arena_elo",
  "gpqa",
  "swe_bench",
  "aider_pct",
  "context_length",
];

const ROLES = {
  aa_intelligence_index: "Y / Decide floor",
  tps: "Z speed",
  ttft: "TTFT axis",
  blended_price_per_M: "X cost",
  price_in_per_M: "Input cost axis",
  price_out_per_M: "Output cost axis",
  price_cache_per_M: "Cache-read cost",
  cost_per_index_task_usd: "Task economy cost",
  time_per_index_task_s: "Task economy time (measured)",
  arena_elo: "Arena preference (optional)",
  gpqa: "Science bench (optional Y)",
  swe_bench: "Coding bench (optional Y)",
  aider_pct: "Aider polyglot (optional)",
  context_length: "Context window (unknown=null)",
};

/** D16: production admission predicate — finite + range, not just non-null. */
function isDecideReady(m) {
  return (
    m.aa_intelligence_index != null &&
    Number.isFinite(Number(m.aa_intelligence_index)) &&
    Number(m.aa_intelligence_index) >= 0 &&
    Number(m.aa_intelligence_index) <= 100 &&
    m.tps != null &&
    Number.isFinite(Number(m.tps)) &&
    Number(m.tps) >= 0 &&
    m.blended_price_per_M != null &&
    Number.isFinite(Number(m.blended_price_per_M)) &&
    Number(m.blended_price_per_M) >= 0
  );
}

/** D16: detect invalid values that look present but fail admission. */
function isInvalidMetric(m) {
  const iq = Number(m.aa_intelligence_index);
  const tps = Number(m.tps);
  const price = Number(m.blended_price_per_M);
  const issues = [];
  if (m.aa_intelligence_index != null && m.aa_intelligence_index !== "" && (!Number.isFinite(iq) || iq < 0 || iq > 100)) {
    issues.push("aa_intelligence_index");
  }
  if (m.tps != null && m.tps !== "" && (!Number.isFinite(tps) || tps < 0)) {
    issues.push("tps");
  }
  if (m.blended_price_per_M != null && m.blended_price_per_M !== "" && (!Number.isFinite(price) || price < 0)) {
    issues.push("blended_price_per_M");
  }
  return issues;
}

function build(models) {
  const total = models.length;
  const fields = KEYS.map((field) => {
    let present = 0;
    let invalid = 0;
    for (const m of models) {
      if (m[field] != null && m[field] !== "") {
        present += 1;
        // Check for non-finite on numeric fields
        if (typeof m[field] === "number" && !Number.isFinite(m[field])) invalid += 1;
      }
    }
    return {
      field,
      present,
      invalid,
      missing: total - present,
      total,
      pct_present: total === 0 ? 0 : Math.round((1000 * present) / total) / 10,
      role: ROLES[field],
    };
  });
  let decide_ready = 0;
  let floor50 = 0;
  let open = 0;
  let closed = 0;
  let invalid_count = 0;
  let multimodal = 0;
  let reasoning_true = 0;
  let reasoning_false = 0;
  let context_unknown = 0;
  const dates = new Set();
  const fam = new Map(); // family → Set of distinct tiers
  const modelIds = new Map(); // model → count (duplicate detection)
  for (const m of models) {
    if (m.data_date) dates.add(m.data_date);
    if (m.openness === "open") open += 1;
    else if (m.openness === "closed") closed += 1;

    if (isDecideReady(m)) {
      decide_ready += 1;
      if (Number(m.aa_intelligence_index) >= 50) floor50 += 1;
    }
    const issues = isInvalidMetric(m);
    if (issues.length) invalid_count += 1;

    // Modality coverage
    if (Array.isArray(m.modality)) {
      if (m.modality.some((mod) => mod !== "text")) multimodal += 1;
    }

    // Reasoning coverage
    if (m.reasoning === true) reasoning_true += 1;
    else if (m.reasoning === false) reasoning_false += 1;

    // Context coverage
    if (m.context_length == null) context_unknown += 1;

    // Duplicate model IDs
    const mid = m.model || "?";
    modelIds.set(mid, (modelIds.get(mid) || 0) + 1);

    // D16: count families by distinct tiers (not just row count)
    const id = (m.family_id && String(m.family_id).trim()) || m.model || "?";
    const tierSet = fam.get(id) ?? new Set();
    tierSet.add(String(m.effort_tier || "none").toLowerCase());
    fam.set(id, tierSet);
  }
  // D16: multi-effort = ≥2 distinct tiers (not ≥2 rows)
  let multi = 0;
  for (const tiers of fam.values()) {
    if (tiers.size >= 2) multi += 1;
  }
  const duplicates = [...modelIds.entries()].filter(([, c]) => c > 1);

  return {
    model_count: total,
    data_dates: [...dates].sort(),
    decide_ready,
    decide_ready_pct: total === 0 ? 0 : Math.round((1000 * decide_ready) / total) / 10,
    floor50_decide_ready: floor50,
    open_count: open,
    closed_count: closed,
    multi_effort_families: multi,
    invalid_metric_rows: invalid_count,
    duplicate_model_ids: duplicates.length,
    duplicates: duplicates.slice(0, 10),
    multimodal_rows: multimodal,
    text_only_rows: total - multimodal,
    reasoning_true,
    reasoning_false,
    reasoning_unspecified: total - reasoning_true - reasoning_false,
    context_known: total - context_unknown,
    context_unknown,
    source_sha256: createHash("sha256").update(JSON.stringify(models)).digest("hex"),
    fields,
    generated_at: new Date().toISOString(),
  };
}

function formatTable(report) {
  const lines = [
    `Catalog coverage · N=${report.model_count} · as of ${report.data_dates.join(",") || "—"}`,
    `Decide-ready (finite IQ+TPS+price): ${report.decide_ready} (${report.decide_ready_pct}%) · floor≥50 ready: ${report.floor50_decide_ready}`,
    `Open ${report.open_count} · closed ${report.closed_count} · multi-effort families (≥2 distinct tiers) ${report.multi_effort_families}`,
    `Invalid metric rows: ${report.invalid_metric_rows} · duplicate model IDs: ${report.duplicate_model_ids}`,
    `Multimodal: ${report.multimodal_rows} · text-only: ${report.text_only_rows} · reasoning: ${report.reasoning_true}/${report.reasoning_false}/${report.reasoning_unspecified} (t/f/? )`,
    `Context: ${report.context_known} known · ${report.context_unknown} unknown (null)`,
    "",
    "field\tpresent\tmissing\tinvalid\tpct\trole",
  ];
  for (const f of report.fields) {
    lines.push(`${f.field}\t${f.present}\t${f.missing}\t${f.invalid}\t${f.pct_present}%\t${f.role}`);
  }
  return `${lines.join("\n")}\n`;
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

const models = JSON.parse(readFileSync(CATALOG, "utf8"));
if (!Array.isArray(models)) {
  console.error("catalog must be a JSON array");
  process.exit(1);
}
const report = build(models);
const text = asJson ? `${JSON.stringify(report, null, 2)}\n` : formatTable(report);

if (outPath) {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, text);
  console.error(`[catalog-coverage] wrote ${outPath}`);
}
process.stdout.write(text);
