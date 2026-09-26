import { isScorable, type Model } from "../data/models";

export interface ScoreWeights {
  speed: number;
  cost: number;
  intelligence: number;
}

export interface NormalizedAxes {
  speed: number;
  cost: number;
  intelligence: number;
}

export interface NormalizedScore {
  model: Model;
  normalized: NormalizedAxes;
  score: number;
  /** Effective price used for log normalization. */
  price: number;
  price_floor: boolean;
}

export const presets = {
  coding: { speed: 0.25, cost: 0.15, intelligence: 0.6 },
  chat: { speed: 0.35, cost: 0.3, intelligence: 0.35 },
  vision: { speed: 0.15, cost: 0.25, intelligence: 0.6 },
  RAG: { speed: 0.2, cost: 0.55, intelligence: 0.25 },
  "long-context": { speed: 0.25, cost: 0.45, intelligence: 0.3 },
  /** Latency-first workload (intent: Fastest). */
  speed: { speed: 0.55, cost: 0.2, intelligence: 0.25 },
  /** Local 8 GB — slightly speed-biased (smaller models). */
  local8: { speed: 0.45, cost: 0.2, intelligence: 0.35 },
  /** Local 12 GB — smart + fast balance. */
  local12: { speed: 0.4, cost: 0.2, intelligence: 0.4 },
  /** Local 24 GB — room for larger open models; intelligence up. */
  local24: { speed: 0.35, cost: 0.15, intelligence: 0.5 },
} as const satisfies Record<string, ScoreWeights>;

export type PresetId = keyof typeof presets;

/**
 * Primary UX intents — human goals, not analyst jargon.
 * Weights still map to `presets`; advanced panel exposes raw sliders + technical chips.
 * LLM-assisted “tell me what you need” can layer on top later without replacing these intents.
 */
export const intentPresets = [
  {
    id: "chat" as const,
    label: "Best balance",
    blurb: "Everyday use — speed, price, and smarts weighted evenly.",
  },
  {
    id: "coding" as const,
    label: "Smartest",
    blurb: "Prioritize intelligence for hard reasoning and code.",
  },
  {
    id: "RAG" as const,
    label: "Budget",
    blurb: "Favor lower price while staying usable.",
  },
  {
    id: "speed" as const,
    label: "Fastest",
    blurb: "Prioritize tokens/sec when latency matters most.",
  },
  {
    id: "local8" as const,
    label: "Local · 8 GB",
    blurb: "Open weights that fit ~8 GB VRAM (≤~9B Q4) — laptops / entry GPUs.",
  },
  {
    id: "local12" as const,
    label: "Local · 12 GB",
    blurb: "Open weights that fit ~12 GB VRAM (≤~14B Q4) — mid desktops.",
  },
  {
    id: "local24" as const,
    label: "Local · 24 GB",
    blurb: "Open weights that fit ~24 GB VRAM (≤~34B Q4) — 4090-class.",
  },
] as const satisfies ReadonlyArray<{ id: PresetId; label: string; blurb: string }>;

export type IntentId = (typeof intentPresets)[number]["id"];

function minPositive(values: readonly number[]): number {
  const positive = values.filter((value) => value > 0);
  return positive.length > 0 ? Math.min(...positive) : 1;
}

function minMax(value: number, min: number, max: number): number {
  return max === min ? 1 : (value - min) / (max - min);
}

function logMinMax(value: number, min: number, max: number): number {
  const logValue = Math.log10(value);
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  return logMax === logMin ? 1 : (logValue - logMin) / (logMax - logMin);
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function composite(normalized: NormalizedAxes, weights: ScoreWeights): number {
  const total = Math.max(0, weights.speed) + Math.max(0, weights.cost) + Math.max(0, weights.intelligence);
  if (total === 0) return (normalized.speed + normalized.cost + normalized.intelligence) / 3;
  return (
    Math.max(0, weights.speed) * normalized.speed +
    Math.max(0, weights.cost) * normalized.cost +
    Math.max(0, weights.intelligence) * normalized.intelligence
  ) / total;
}

/** Scores complete, non-quarantined rows; visibleSet supplies all normalization extrema. */
export function normalizedScores(
  models: readonly Model[],
  weights: ScoreWeights,
  visibleSet: readonly Model[],
): NormalizedScore[] {
  const visible = visibleSet.filter(isScorable);
  if (visible.length === 0) return [];

  const priceFloor = minPositive(visible.map((model) => model.blended_price_per_M!)) / 2;
  const speedFloor = minPositive(visible.map((model) => model.tps!)) / 2;
  const values = visible.map((model) => ({
    speed: Math.max(model.tps!, speedFloor),
    price: model.blended_price_per_M! <= 0 ? priceFloor : model.blended_price_per_M!,
    intelligence: model.aa_intelligence_index!,
  }));
  const speedMin = Math.min(...values.map(({ speed }) => speed));
  const speedMax = Math.max(...values.map(({ speed }) => speed));
  const priceMin = Math.min(...values.map(({ price }) => price));
  const priceMax = Math.max(...values.map(({ price }) => price));
  const intelligenceMin = Math.min(...values.map(({ intelligence }) => intelligence));
  const intelligenceMax = Math.max(...values.map(({ intelligence }) => intelligence));

  return models.filter(isScorable).map((row) => {
    const speed = Math.max(row.tps!, speedFloor);
    const price = row.blended_price_per_M! <= 0 ? priceFloor : row.blended_price_per_M!;
    const normalized = {
      speed: clampUnit(logMinMax(speed, speedMin, speedMax)),
      cost: clampUnit(priceMax === priceMin ? 1 : 1 - logMinMax(price, priceMin, priceMax)),
      intelligence: clampUnit(minMax(row.aa_intelligence_index!, intelligenceMin, intelligenceMax)),
    };
    return {
      model: row,
      normalized,
      score: composite(normalized, weights),
      price,
      price_floor: row.blended_price_per_M! <= 0,
    };
  });
}

/** Positive when a is preferred over b by the weighted-score contract. */
export function compareWeightedScores(a: NormalizedScore, b: NormalizedScore): number {
  return (
    a.score - b.score ||
    a.normalized.intelligence - b.normalized.intelligence ||
    a.normalized.cost - b.normalized.cost ||
    -a.model.provider.localeCompare(b.model.provider) ||
    -a.model.model.localeCompare(b.model.model)
  );
}

/** Deterministic arg-max with the contract's intelligence, cost, provider tie-breaks. */
export function weightedOptimum(scores: readonly NormalizedScore[]): NormalizedScore | undefined {
  return scores.reduce<NormalizedScore | undefined>((best, candidate) => {
    return !best || compareWeightedScores(candidate, best) > 0 ? candidate : best;
  }, undefined);
}
