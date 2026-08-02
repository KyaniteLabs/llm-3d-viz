import type { Model } from "../data/models";

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
} as const satisfies Record<string, ScoreWeights>;

function isScorable(model: Model): boolean {
  return (
    model.tps !== null &&
    model.blended_price_per_M !== null &&
    model.blended_price_per_M >= 0 &&
    model.aa_intelligence_index !== null
  );
}

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
      speed: logMinMax(speed, speedMin, speedMax),
      cost: 1 - logMinMax(price, priceMin, priceMax),
      intelligence: minMax(row.aa_intelligence_index!, intelligenceMin, intelligenceMax),
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

/** Deterministic arg-max with the contract's intelligence, cost, provider tie-breaks. */
export function weightedOptimum(scores: readonly NormalizedScore[]): NormalizedScore | undefined {
  return scores.reduce<NormalizedScore | undefined>((best, candidate) => {
    if (!best || candidate.score > best.score) return candidate;
    if (candidate.score < best.score) return best;
    return (
      candidate.normalized.intelligence - best.normalized.intelligence ||
      candidate.normalized.cost - best.normalized.cost ||
      -candidate.model.provider.localeCompare(best.model.provider) ||
      -candidate.model.model.localeCompare(best.model.model)
    ) > 0
      ? candidate
      : best;
  }, undefined);
}
