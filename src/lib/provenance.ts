/**
 * Honest provenance + task-economy labels for inspector / tooltips.
 */

import type { Model } from "../data/models";
import {
  estimateTimePerIndexTaskS,
  INDEX_TASK_OUTPUT_TOKENS_EST,
} from "./axis-metrics";
const ORIGIN_LABEL: Record<string, string> = {
  aa: "Artificial Analysis",
  "aa-api": "Artificial Analysis",
  arena: "Arena",
  openrouter: "OpenRouter",
};

const KIND_LABEL: Record<string, string> = {
  measured: "measured",
  list: "list price",
  derived: "derived",
  derived_list_blend: "derived blend",
};

const FIELD_SHORT: Record<string, string> = {
  aa_intelligence_index: "Index",
  tps: "tok/s",
  ttft: "TTFT",
  blended_price_per_M: "blended $",
  price_in_per_M: "in $",
  price_out_per_M: "out $",
  cost_per_index_task_usd: "cost/task",
  time_per_index_task_s: "time/task",
  arena_elo: "Arena Elo",
};

/** One-line provenance from optional per-field sources map. */
export function formatProvenanceLine(model: Pick<Model, "sources" | "source">): string {
  const src = model.sources;
  if (!src || Object.keys(src).length === 0) {
    return model.source ? `Source: ${model.source}` : "Source: catalog";
  }
  const bits: string[] = [];
  for (const [field, meta] of Object.entries(src)) {
    if (!meta) continue;
    const fl = FIELD_SHORT[field] ?? field;
    const origin = ORIGIN_LABEL[meta.origin] ?? meta.origin;
    const kind = KIND_LABEL[meta.kind] ?? meta.kind;
    bits.push(`${fl}: ${origin} (${kind})`);
  }
  return bits.length ? bits.join(" · ") : model.source ? `Source: ${model.source}` : "Source: catalog";
}

export function formatArenaElo(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export type TaskTimeKind = "measured" | "estimated" | "missing";

export function taskTimeInfo(
  model: Pick<Model, "time_per_index_task_s" | "tps" | "ttft">,
): { seconds: number | null; kind: TaskTimeKind; label: string } {
  const measured =
    model.time_per_index_task_s != null && model.time_per_index_task_s > 0
      ? model.time_per_index_task_s
      : null;
  if (measured != null) {
    return {
      seconds: measured,
      kind: "measured",
      label: formatTaskSeconds(measured),
    };
  }
  const est = estimateTimePerIndexTaskS(model);
  if (est == null) {
    return { seconds: null, kind: "missing", label: "—" };
  }
  return {
    seconds: est,
    kind: "estimated",
    label: `~${formatTaskSeconds(est)} est.`,
  };
}

function formatTaskSeconds(v: number): string {
  if (v >= 100) return `${Math.round(v)}s`;
  return `${Number(v.toPrecision(3))}s`;
}

export function formatCostPerIndexTask(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value < 0.01) return `$${value.toFixed(4)} /task`;
  return `$${value.toFixed(3)} /task`;
}

/** Compact coverage badge for method strip / footer. */
export function formatCoverageBadge(opts: {
  modelCount: number;
  costTaskPresent: number;
  arenaPresent: number;
  timeTaskMeasured: number;
}): string {
  const { modelCount, costTaskPresent, arenaPresent, timeTaskMeasured } = opts;
  if (modelCount <= 0) return "coverage —";
  const ct = Math.round((100 * costTaskPresent) / modelCount);
  const ar = Math.round((100 * arenaPresent) / modelCount);
  const tm = Math.round((100 * timeTaskMeasured) / modelCount);
  return `task cost ${ct}% · Arena ${ar}% · task time measured ${tm}% (else est. ${INDEX_TASK_OUTPUT_TOKENS_EST} tok)`;
}

/** Extra inspector lines for optional metrics (Arena, task cost/time). */
export function optionalMetricDlRows(model: Model): string {
  const arena =
    model.arena_elo != null
      ? `<div><dt>Arena Elo</dt><dd>${formatArenaElo(model.arena_elo)}</dd></div>`
      : "";
  const costTask =
    model.cost_per_index_task_usd != null && model.cost_per_index_task_usd > 0
      ? `<div><dt>Cost / Index task</dt><dd>${formatCostPerIndexTask(model.cost_per_index_task_usd)}</dd></div>`
      : "";
  const tt = taskTimeInfo(model);
  const timeTask =
    tt.kind !== "missing"
      ? `<div><dt>Time / Index task</dt><dd title="${
          tt.kind === "estimated"
            ? `Estimated: TTFT + ${INDEX_TASK_OUTPUT_TOKENS_EST}/TPS — AA free API has no measured wall time`
            : "Measured Index-task wall time"
        }">${tt.label}</dd></div>`
      : "";
  return arena + costTask + timeTask;
}

/** Short selection blurb including optional Arena. */
export function selectionExtras(model: Model): string {
  const parts: string[] = [];
  if (model.arena_elo != null) parts.push(`Arena ${formatArenaElo(model.arena_elo)}`);
  if (model.cost_per_index_task_usd != null && model.cost_per_index_task_usd > 0) {
    parts.push(formatCostPerIndexTask(model.cost_per_index_task_usd));
  }
  const tt = taskTimeInfo(model);
  if (tt.kind === "estimated") parts.push(`task time ${tt.label}`);
  else if (tt.kind === "measured") parts.push(`task time ${tt.label}`);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}
