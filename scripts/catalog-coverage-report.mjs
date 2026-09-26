#!/usr/bin/env node
/**
 * Print / write catalog field coverage (null honesty).
 * Usage:
 *   node scripts/catalog-coverage-report.mjs
 *   node scripts/catalog-coverage-report.mjs --json > logs/coverage.json
 *   node scripts/catalog-coverage-report.mjs --out logs/catalog-coverage.txt
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
  "cost_per_index_task_usd",
  "time_per_index_task_s",
  "arena_elo",
  "gpqa",
  "swe_bench",
  "aider_pct",
];

const ROLES = {
  aa_intelligence_index: "Y / Decide floor",
  tps: "Z speed",
  ttft: "TTFT axis",
  blended_price_per_M: "X cost",
  price_in_per_M: "Input cost axis",
  price_out_per_M: "Output cost axis",
  cost_per_index_task_usd: "Task economy cost",
  time_per_index_task_s: "Task economy time (measured)",
  arena_elo: "Arena preference (optional)",
  gpqa: "Science bench (optional Y)",
  swe_bench: "Coding bench (optional Y)",
  aider_pct: "Aider polyglot (optional)",
};

function build(models) {
  const total = models.length;
  const fields = KEYS.map((field) => {
    let present = 0;
    for (const m of models) {
      if (m[field] != null && m[field] !== "") present += 1;
    }
    return {
      field,
      present,
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
  const dates = new Set();
  const fam = new Map();
  for (const m of models) {
    if (m.data_date) dates.add(m.data_date);
    if (m.openness === "open") open += 1;
    else if (m.openness === "closed") closed += 1;
    const ready =
      m.aa_intelligence_index != null && m.tps != null && m.blended_price_per_M != null;
    if (ready) {
      decide_ready += 1;
      if (m.aa_intelligence_index >= 50) floor50 += 1;
    }
    const id = (m.family_id && String(m.family_id).trim()) || m.model || "?";
    fam.set(id, (fam.get(id) || 0) + 1);
  }
  let multi = 0;
  for (const c of fam.values()) if (c >= 2) multi += 1;
  return {
    model_count: total,
    data_dates: [...dates].sort(),
    decide_ready,
    decide_ready_pct: total === 0 ? 0 : Math.round((1000 * decide_ready) / total) / 10,
    floor50_decide_ready: floor50,
    open_count: open,
    closed_count: closed,
    multi_effort_families: multi,
    fields,
    generated_at: new Date().toISOString(),
  };
}

function formatTable(report) {
  const lines = [
    `Catalog coverage · N=${report.model_count} · as of ${report.data_dates.join(",") || "—"}`,
    `Decide-ready (IQ+TPS+price): ${report.decide_ready} (${report.decide_ready_pct}%) · floor≥50 ready: ${report.floor50_decide_ready}`,
    `Open ${report.open_count} · closed ${report.closed_count} · multi-effort families ${report.multi_effort_families}`,
    "",
    "field\tpresent\tmissing\tpct\trole",
  ];
  for (const f of report.fields) {
    lines.push(`${f.field}\t${f.present}\t${f.missing}\t${f.pct_present}%\t${f.role}`);
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
