import rawModels from "../../data/models.v0.draft.json";
import { formatTps, formatPricePerM, formatIntelligence } from "../lib/format";
import { deriveEffortTier, deriveFamilyId } from "../lib/family";
import {
  catalogScopeFromSearch,
  filterProductCatalog,
  type CatalogScope,
} from "./catalog-scope";

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
  /** Stable family key for multi-effort trails; derived from name when absent. */
  family_id?: string;
  /** Effort intensity tier (none|low|medium|high|max|xhigh|…); derived when absent. */
  effort_tier?: string;
  /** Context window in tokens; null when unknown (never 0 to signal unknown). */
  context_length: number | null;
  release_date: string;
  source_url: string;
  tps: number | null;
  ttft: number | null;
  price_in_per_M: number | null;
  price_out_per_M: number | null;
  blended_price_per_M: number | null;
  aa_intelligence_index: number | null;
  /**
   * WS5 (SPEC §5 switchable-axis intent): AA secondary intelligence sub-indices,
   * mapped data-layer-only from the AA Data API (artificial_analysis_coding_index
   * / artificial_analysis_agentic_index). Nullable passthrough — null when AA
   * has not measured them; validated 0–100 when present. Axis-switching UI is
   * explicitly out of scope for WS5.
   */
  coding_index?: number | null;
  agentic_index?: number | null;
  /** AA Cost per Intelligence Index Task (USD); null until scraped. */
  cost_per_index_task_usd?: number | null;
  /** AA Time per Intelligence Index Task (seconds); null until scraped. */
  time_per_index_task_s?: number | null;
  arena_elo: number | null;
  /**
   * Provider-published curated benchmarks (2026-08-14 amendment): the AA free
   * API does not supply these, but provider announcements do — manual-additions
   * rows may carry them as PRELIMINARY vendor-reported values (origin
   * "provider", kind "list"), auto-superseded when AA measures the family.
   * Not yet axis-switchable UI; provenance always shown.
   */
  gpqa: number | null;
  swe_bench: number | null;
  aider_pct: number | null;
  data_date: string;
  source: string;
  null_reason?: string;
  /**
   * Per-axis provenance from multi-source catalog join (optional).
   * Non-AA writes (Arena Elo, OpenRouter list/derived prices) should set this.
   */
  sources?: Partial<
    Record<
      "aa_intelligence_index" | "tps" | "ttft" | "blended_price_per_M" | "price_in_per_M" | "price_out_per_M" | "price_cache_per_M" | "context_length" | "modality" | "cost_per_index_task_usd" | "time_per_index_task_s" | "coding_index" | "agentic_index" | "arena_elo",
      { origin: "aa" | "aa-api" | "arena" | "openrouter" | "provider"; kind: "measured" | "list" | "derived" | "derived_list_blend" }
    >
  >;
}

export const DATA_ERROR = "data_error" as const;

/**
 * @deprecated Lab is color, not shape. Glyphs encode openness via
 * `src/viz/mark-encoding.ts` (wire sphere = closed · wire octa = open). Kept only for any
 * residual test fixtures that still import the old provider→symbol map.
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

/** Full draft enrichment (every lab in the scrape). Prefer `models` for product UI. */
export const allModels: Model[] = (rawModels as Model[]).map((row) => ({
  ...row,
  family_id: row.family_id?.trim() || deriveFamilyId(row.model),
  effort_tier: row.effort_tier?.trim() || deriveEffortTier(row),
  coding_index: row.coding_index ?? null,
  agentic_index: row.agentic_index ?? null,
  cost_per_index_task_usd: row.cost_per_index_task_usd ?? null,
  time_per_index_task_s: row.time_per_index_task_s ?? null,
}));

/**
 * Active product catalog.
 * Default = cloud API labs + **release_date ≥ 2026-01-01**.
 * `?catalog=all` = every lab, still post–Jan 2026. Raw scrape = `allModels` (no floor).
 */
export const catalogScope: CatalogScope = catalogScopeFromSearch(
  typeof window !== "undefined" ? window.location.search : "",
);

export const models: Model[] = filterProductCatalog(allModels, catalogScope);

/** Complete rows eligible for three-axis frontier and value-score math. */
export function isScorable(model: Model): boolean {
  return (
    model.tps !== null &&
    Number.isFinite(model.tps) &&
    model.tps >= 0 &&
    model.blended_price_per_M !== null &&
    Number.isFinite(model.blended_price_per_M) &&
    model.blended_price_per_M >= 0 &&
    model.aa_intelligence_index !== null &&
    Number.isFinite(model.aa_intelligence_index) &&
    model.aa_intelligence_index >= 0 &&
    model.aa_intelligence_index <= 100
  );
}
/**
 * Cloud-scoped scorable model count. Test thresholds bind to this constant
 * instead of a hardcoded magic number, so catalog-scope changes (CLOUD_LABS
 * additions, release-floor moves) automatically update test expectations.
 *
 * Note: UI default filters (multiEffortOnly + excludeNonReasoning) further
 * reduce the visible set below this count. Tests should bind to
 * `CLOUD_SCORABLE_FLOOR` (or `Math.floor(CLOUD_SCORABLE_FLOOR / 3)` as a
 * visible-count floor) rather than any hardcoded row count, so catalog
 * refreshes don't leave stale numbers behind.
 */
export const CLOUD_SCORABLE_FLOOR = models.filter(isScorable).length;

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
  const seenModelIds = new Set<string>();
  const seenSpineKeys = new Set<string>();
  candidateModels.forEach((row, index) => {
    const label = `models[${index}]`;
    if (isMissingString(row.model) || isMissingString(row.provider)) {
      throw new Error(`${label}: model and provider must be non-empty strings`);
    }
    // D18: unique model IDs
    if (seenModelIds.has(row.model)) {
      throw new Error(`${label} (${row.model}): duplicate model ID`);
    }
    seenModelIds.add(row.model);
    if (row.reasoning !== undefined && typeof row.reasoning !== "boolean") {
      throw new Error(`${label} (${row.model}): reasoning must be a boolean when present`);
    }
    // D01: context_length must be null (unknown) or a finite positive number.
    if (row.context_length !== null) {
      if (!Number.isFinite(row.context_length) || row.context_length <= 0) {
        throw new Error(`${label} (${row.model}): context_length must be null or a positive number`);
      }
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
    // WS5: AA secondary sub-indices share the 0–100 instrument range.
    for (const [field, value] of [
      ["coding_index", row.coding_index],
      ["agentic_index", row.agentic_index],
    ] as const) {
      if (value != null && (!Number.isFinite(value) || value < 0 || value > 100)) {
        throw new Error(`${label} (${row.model}): ${field} must be null or within 0-100`);
      }
    }
    // D18: openness enum
    if (row.openness !== "open" && row.openness !== "closed") {
      throw new Error(`${label} (${row.model}): openness must be "open" or "closed"`);
    }
    // D18: modality array shape + vocabulary
    if (!Array.isArray(row.modality) || row.modality.length === 0) {
      throw new Error(`${label} (${row.model}): modality must be a non-empty array`);
    }
    for (const mod of row.modality) {
      if (!["text", "vision", "audio", "video"].includes(mod)) {
        throw new Error(`${label} (${row.model}): modality contains invalid value "${mod}"`);
      }
    }
    // D18: valid release_date (ISO calendar)
    if (typeof row.release_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.release_date.slice(0, 10))) {
      throw new Error(`${label} (${row.model}): release_date must be a valid YYYY-MM-DD date`);
    }
    // D18: valid data_date
    if (typeof row.data_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.data_date.slice(0, 10))) {
      throw new Error(`${label} (${row.model}): data_date must be a valid YYYY-MM-DD date`);
    }
    // D18: source_url required
    if (isMissingString(row.source_url)) {
      throw new Error(`${label} (${row.model}): source_url is required`);
    }
    // D18: unique spine keys (model + effort)
    const spine = `${row.model}::${String(row.effort_tier || "none").toLowerCase()}`;
    if (seenSpineKeys.has(spine)) {
      throw new Error(`${label} (${row.model}): duplicate spine key "${spine}"`);
    }
    seenSpineKeys.add(spine);
    const excluded =
      row.tps === null ||
      row.blended_price_per_M === null ||
      row.aa_intelligence_index === null;
    if (excluded && isMissingString(row.null_reason)) {
      throw new Error(`${label} (${row.model}): excluded rows require a null_reason`);
    }
    if (row.sources !== undefined) {
      if (typeof row.sources !== "object" || row.sources === null || Array.isArray(row.sources)) {
        throw new Error(`${label} (${row.model}): sources must be an object when present`);
      }
      for (const [field, meta] of Object.entries(row.sources)) {
        if (!meta || typeof meta !== "object") {
          throw new Error(`${label} (${row.model}): sources.${field} must be an object`);
        }
        const origin = (meta as { origin?: string }).origin;
        const kind = (meta as { kind?: string }).kind;
        if (origin && !["aa", "aa-api", "arena", "openrouter", "provider"].includes(origin)) {
          throw new Error(`${label} (${row.model}): sources.${field}.origin invalid`);
        }
        if (
          kind &&
          !["measured", "list", "derived", "derived_list_blend"].includes(kind)
        ) {
          throw new Error(`${label} (${row.model}): sources.${field}.kind invalid`);
        }
      }
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
