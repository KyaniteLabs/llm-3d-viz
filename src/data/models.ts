import rawModels from "../../data/models.v0.draft.json";

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

function isMissingString(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/** Throws a descriptive error so Vite aborts before emitting an invalid dataset build. */
export function validateModels(candidateModels: readonly Model[]): void {
  candidateModels.forEach((row, index) => {
    const label = `models[${index}]`;
    if (isMissingString(row.model) || isMissingString(row.provider)) {
      throw new Error(`${label}: model and provider must be non-empty strings`);
    }
    if (!Number.isFinite(row.context_length) || row.context_length <= 0) {
      throw new Error(`${label} (${row.model}): context_length is required and must be positive`);
    }
    if (row.tps !== null && (!Number.isFinite(row.tps) || row.tps < 0)) {
      throw new Error(`${label} (${row.model}): tps must be null or a number >= 0`);
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
