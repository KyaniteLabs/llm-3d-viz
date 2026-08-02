import rawModels from "../../data/models.v0.draft.json";
import { formatTps, formatPricePerM, formatIntelligence } from "../lib/format";

export type Openness = "open" | "closed";
export type Modality = "text" | "vision" | "audio" | "video";
export type Plotly3dSymbol =
  | "circle"
  | "circle-open"
  | "cross"
  | "diamond"
  | "diamond-open"
  | "square"
  | "square-open"
  | "x";

/** Curated model record; optional benchmark metrics remain null when not measured. */
export interface Model {
  model: string;
  provider: string;
  openness: Openness;
  modality: Modality[];
  /**
   * Authoritative flag: is this a reasoning / thinking-effort model — the only
   * kind whose measured TTFT can honestly include substantial thinking time.
   * Set explicitly per row so reasoning-gated behaviour (the TTFT caveat, etc.)
   * reads structured data instead of guessing from the curated name. Optional:
   * when absent, src/lib/format.ts falls back to a conservative name heuristic
   * for legacy/incomplete rows.
   */
  reasoning?: boolean;
  context_length: number;
  release_date: string;
  source_url: string;
  tps: number | null;
  ttft: number | null;
  price_in_per_M: number | null;
  price_out_per_M: number | null;
  blended_price_per_M: number | null;
  aa_intelligence_index: number | null;
  arena_elo: number | null;
  gpqa: number | null;
  swe_bench: number | null;
  aider_pct: number | null;
  data_date: string;
  source: string;
  null_reason?: string;
}

export const DATA_ERROR = "data_error" as const;

/**
 * Plotly Scatter3d has eight useful glyphs. The first eight providers retain a
 * dedicated glyph; the remaining long tail intentionally shares an open or
 * closed "other" variant. This makes those collisions semantic, not accidental,
 * while preserving openness as a non-colour cue.
 */
export const PROVIDER_SHAPES: Readonly<Record<string, Plotly3dSymbol>> = {
  OpenAI: "circle",
  Anthropic: "circle-open",
  Google: "cross",
  Meta: "diamond",
  DeepSeek: "diamond-open",
  Alibaba: "square",
  Mistral: "square-open",
  Cohere: "x",
  Amazon: "circle",
  Kimi: "circle-open",
  Microsoft: "circle-open",
  MiniMax: "circle-open",
  NVIDIA: "circle-open",
  SpaceXAI: "circle",
  "Thinking Machines": "circle-open",
  Xiaomi: "circle-open",
  "Z AI": "circle-open",
};

export const models: Model[] = rawModels as Model[];

/** Complete rows eligible for three-axis frontier and value-score math. */
export function isScorable(model: Model): boolean {
  return (
    model.tps !== null &&
    model.blended_price_per_M !== null &&
    model.blended_price_per_M >= 0 &&
    model.aa_intelligence_index !== null
  );
}

function isMissingString(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function hasNegativePrice(model: Model): boolean {
  return (
    (model.price_in_per_M !== null && model.price_in_per_M < 0) ||
    (model.price_out_per_M !== null && model.price_out_per_M < 0) ||
    (model.blended_price_per_M !== null && model.blended_price_per_M < 0)
  );
}

/** Throws a descriptive error so Vite aborts before emitting an invalid dataset build. */
export function validateModels(candidateModels: readonly Model[]): void {
  candidateModels.forEach((row, index) => {
    const label = `models[${index}]`;
    if (isMissingString(row.model) || isMissingString(row.provider)) {
      throw new Error(`${label}: model and provider must be non-empty strings`);
    }
    if (row.reasoning !== undefined && typeof row.reasoning !== "boolean") {
      throw new Error(`${label} (${row.model}): reasoning must be a boolean when present`);
    }
    if (!Number.isFinite(row.context_length) || row.context_length <= 0) {
      throw new Error(`${label} (${row.model}): context_length is required and must be positive`);
    }
    if (row.tps !== null && (!Number.isFinite(row.tps) || row.tps < 0)) {
      throw new Error(`${label} (${row.model}): tps must be null or a number >= 0`);
    }
    if (hasNegativePrice(row)) {
      throw new Error(
        `${label} (${row.model}): price_in_per_M, price_out_per_M, and blended_price_per_M must be null or >= 0`,
      );
    }
    if (
      row.aa_intelligence_index !== null &&
      (!Number.isFinite(row.aa_intelligence_index) ||
        row.aa_intelligence_index < 0 ||
        row.aa_intelligence_index > 100)
    ) {
      throw new Error(`${label} (${row.model}): aa_intelligence_index must be null or within 0-100`);
    }
    const excluded =
      row.tps === null ||
      row.blended_price_per_M === null ||
      row.aa_intelligence_index === null;
    if (excluded && isMissingString(row.null_reason)) {
      throw new Error(`${label} (${row.model}): excluded rows require a null_reason`);
    }
  });
}

export interface IncompleteModel extends Model {
  null_reason: string;
}

export interface QuarantinedModel extends Model {
  reason: typeof DATA_ERROR;
}

/** Models excluded from the three-axis view, retaining the source-supplied missing-data reason. */
export function incompleteModels(): IncompleteModel[] {
  return models.filter(
    (model): model is IncompleteModel =>
      (model.tps === null ||
        model.blended_price_per_M === null ||
        model.aa_intelligence_index === null) &&
      typeof model.null_reason === "string" &&
      model.null_reason.length > 0,
  );
}

/** The three benchmark axes, in display order. */
export type IncompleteAxis = "speed" | "cost" | "intelligence";

export interface AxisCoverage {
  axis: IncompleteAxis;
  /** Human-facing axis label, e.g. "Speed". */
  label: string;
  /** True when this axis has a measured value for the model. */
  measured: boolean;
  /** Per-axis reason ("not measured" / "unpublished" / "not applicable") when missing; "" when measured. */
  reason: string;
  /** Formatted value when measured, else the reason label. */
  display: string;
}

/** Human label for a row's null_reason enum (frontier-math §5.2 schema). */
const AXIS_REASON_LABELS: Record<string, string> = {
  not_measured: "not measured",
  unpublished: "unpublished",
  not_applicable: "not applicable",
};

function missingAxisReason(model: Model): string {
  if (!model.null_reason) return "not measured";
  return AXIS_REASON_LABELS[model.null_reason] ?? model.null_reason.replaceAll("_", " ");
}

/**
 * Per-axis coverage for an excluded model (frontier-math §5.2): each axis shows
 * its measured value when known, or the row's missing-data reason when not — so
 * the dataset's coverage gaps read per axis instead of as one generic "missing"
 * line. GPT-5.5 Pro (xhigh) lacks all three; DeepSeek V4 Flash 0731 lacks only
 * speed (price + index are published, so they are shown).
 */
export function incompleteAxisCoverage(model: Model): AxisCoverage[] {
  const reason = missingAxisReason(model);
  return [
    {
      axis: "speed",
      label: "Speed",
      measured: model.tps !== null,
      reason: model.tps === null ? reason : "",
      display: model.tps !== null ? formatTps(model.tps) : reason,
    },
    {
      axis: "cost",
      label: "Cost",
      measured: model.blended_price_per_M !== null,
      reason: model.blended_price_per_M === null ? reason : "",
      display: model.blended_price_per_M !== null ? formatPricePerM(model.blended_price_per_M) : reason,
    },
    {
      axis: "intelligence",
      label: "Intelligence",
      measured: model.aa_intelligence_index !== null,
      reason: model.aa_intelligence_index === null ? reason : "",
      display: model.aa_intelligence_index !== null ? formatIntelligence(model.aa_intelligence_index) : reason,
    },
  ];
}

/** Negative-price rows are quarantined as data errors for defense in depth. */
export function quarantinedModels(candidateModels: readonly Model[] = models): QuarantinedModel[] {
  return candidateModels
    .filter(hasNegativePrice)
    .map((model) => ({ ...model, reason: DATA_ERROR }));
}
