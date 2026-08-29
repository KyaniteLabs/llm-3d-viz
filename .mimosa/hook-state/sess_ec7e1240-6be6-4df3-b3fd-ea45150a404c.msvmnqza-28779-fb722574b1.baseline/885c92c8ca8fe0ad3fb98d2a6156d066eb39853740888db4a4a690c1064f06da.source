/**
 * Catalog field coverage — pure report for ops + honesty badges.
 * Never invents metrics; only counts null vs present.
 */

export type CoverageFieldKey =
  | "aa_intelligence_index"
  | "tps"
  | "ttft"
  | "blended_price_per_M"
  | "price_in_per_M"
  | "price_out_per_M"
  | "cost_per_index_task_usd"
  | "time_per_index_task_s"
  | "arena_elo"
  | "gpqa"
  | "swe_bench"
  | "aider_pct";

export interface CoverageRow {
  field: CoverageFieldKey;
  present: number;
  missing: number;
  total: number;
  pct_present: number;
  /** Product role of this field. */
  role: string;
}

export interface CatalogCoverageReport {
  model_count: number;
  data_dates: string[];
  decide_ready: number;
  decide_ready_pct: number;
  floor50_decide_ready: number;
  open_count: number;
  closed_count: number;
  multi_effort_families: number;
  fields: CoverageRow[];
  generated_at?: string;
}

const FIELD_ROLES: Record<CoverageFieldKey, string> = {
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

const KEYS: CoverageFieldKey[] = [
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

function isMissing(v: unknown): boolean {
  return v == null || v === "";
}

/** Duck-typed model row — works on draft JSON and Model. */
export function buildCatalogCoverage(
  models: readonly Record<string, unknown>[],
): CatalogCoverageReport {
  const total = models.length;
  const fields: CoverageRow[] = KEYS.map((field) => {
    let present = 0;
    for (const m of models) {
      if (!isMissing(m[field])) present += 1;
    }
    return {
      field,
      present,
      missing: total - present,
      total,
      pct_present: total === 0 ? 0 : Math.round((1000 * present) / total) / 10,
      role: FIELD_ROLES[field],
    };
  });

  let decide_ready = 0;
  let floor50_decide_ready = 0;
  let open_count = 0;
  let closed_count = 0;
  const dates = new Set<string>();
  const familyCounts = new Map<string, number>();

  for (const m of models) {
    if (typeof m.data_date === "string" && m.data_date) dates.add(m.data_date);
    if (m.openness === "open") open_count += 1;
    else if (m.openness === "closed") closed_count += 1;
    const iq = m.aa_intelligence_index;
    const tps = m.tps;
    const price = m.blended_price_per_M;
    const ready =
      iq != null &&
      typeof iq === "number" &&
      tps != null &&
      typeof tps === "number" &&
      price != null &&
      typeof price === "number";
    if (ready) {
      decide_ready += 1;
      if (iq >= 50) floor50_decide_ready += 1;
    }
    const fam =
      (typeof m.family_id === "string" && m.family_id.trim()) ||
      (typeof m.model === "string" ? m.model : "?");
    familyCounts.set(fam, (familyCounts.get(fam) ?? 0) + 1);
  }

  let multi_effort_families = 0;
  for (const c of familyCounts.values()) {
    if (c >= 2) multi_effort_families += 1;
  }

  return {
    model_count: total,
    data_dates: [...dates].sort(),
    decide_ready,
    decide_ready_pct: total === 0 ? 0 : Math.round((1000 * decide_ready) / total) / 10,
    floor50_decide_ready,
    open_count,
    closed_count,
    multi_effort_families,
    fields,
  };
}

export function formatCoverageTable(report: CatalogCoverageReport): string {
  const lines = [
    `Catalog coverage · N=${report.model_count} · as of ${report.data_dates.join(",") || "—"}`,
    `Decide-ready (IQ+TPS+price): ${report.decide_ready} (${report.decide_ready_pct}%) · floor≥50 ready: ${report.floor50_decide_ready}`,
    `Open ${report.open_count} · closed ${report.closed_count} · multi-effort families ${report.multi_effort_families}`,
    "",
    "field\tpresent\tmissing\tpct\trole",
  ];
  for (const f of report.fields) {
    lines.push(
      `${f.field}\t${f.present}\t${f.missing}\t${f.pct_present}%\t${f.role}`,
    );
  }
  return lines.join("\n");
}
