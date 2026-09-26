import { describe, expect, it } from "vitest";
import type { Model } from "../src/data/models";
import {
  intentPresets,
  normalizedScores,
  presets,
  weightedOptimum,
  type ScoreWeights,
} from "../src/lib/score";
import { frontier } from "../src/lib/pareto";

const model = (name: string, tps: number | null, price: number | null, intel: number | null): Model => ({
  model: name,
  provider: name,
  openness: "open",
  modality: ["text"],
  context_length: 128_000,
  release_date: "2026-01-01",
  source_url: "https://example.test",
  tps,
  ttft: 100,
  price_in_per_M: price,
  price_out_per_M: price,
  blended_price_per_M: price,
  aa_intelligence_index: intel,
  arena_elo: null,
  gpqa: null,
  swe_bench: null,
  aider_pct: null,
  data_date: "2026-01-01",
  source: "fixture",
});

const weights = (speed: number, cost: number, intelligence: number): ScoreWeights => ({
  speed,
  cost,
  intelligence,
});

describe("value-score normalization", () => {
  it("clamps zero to half the smallest positive price and quarantines negative prices", () => {
    const zero = model("zero", 100, 0, 80);
    const positive = model("positive", 100, 4, 80);
    const negative = model("negative", 100, -1, 80);
    const scores = normalizedScores([zero, positive, negative], weights(0, 10, 0), [zero, positive, negative]);

    expect(scores.find(({ model: row }) => row.model === "zero")?.price_floor).toBe(true);
    expect(scores.find(({ model: row }) => row.model === "zero")?.price).toBe(2);
    expect(scores.some(({ model: row }) => row.model === "negative")).toBe(false);
  });

  it("excludes a row with only intelligence missing", () => {
    const complete = model("complete", 100, 2, 80);
    const missingIntel = model("missing-intel", 120, 1, null);
    const scores = normalizedScores([complete, missingIntel], weights(1, 1, 1), [complete, missingIntel]);

    expect(scores.map(({ model: row }) => row.model)).toEqual(["complete"]);
  });

  it("normalizes speed and cost logarithmically, flips cost, and uses visible-set extrema", () => {
    const low = model("low", 10, 1, 10);
    const high = model("high", 100, 100, 100);
    const middle = model("middle", 20, 10, 50);
    const scores = normalizedScores([low, high, middle], weights(1, 1, 1), [low, high]);
    const middleScore = scores.find(({ model: row }) => row.model === "middle")!;

    expect(middleScore.normalized.speed).toBeCloseTo(Math.log10(20) - 1);
    expect(middleScore.normalized.cost).toBeCloseTo(1 - Math.log10(10) / 2);
    expect(middleScore.normalized.intelligence).toBeCloseTo(40 / 90);
  });

  it("assigns 1.0 to every degenerate axis", () => {
    const a = model("a", 10, 2, 50);
    const b = model("b", 10, 4, 80);
    const scores = normalizedScores([a, b], weights(1, 1, 1), [a, b]);

    expect(scores.every(({ normalized }) => normalized.speed === 1)).toBe(true);

    const costDegenerate = [model("cost-a", 10, 2, 50), model("cost-b", 20, 2, 80)];
    expect(normalizedScores(costDegenerate, weights(1, 1, 1), costDegenerate).every(({ normalized }) => normalized.cost === 1)).toBe(true);

    const intelligenceDegenerate = [model("intel-a", 10, 2, 50), model("intel-b", 20, 4, 50)];
    expect(normalizedScores(intelligenceDegenerate, weights(1, 1, 1), intelligenceDegenerate).every(({ normalized }) => normalized.intelligence === 1)).toBe(true);
  });

  it("clamps scores for models outside visible-set extrema", () => {
    const visible = [model("visible-low", 10, 1, 20), model("visible-high", 100, 100, 80)];
    const below = model("below", 1, 1_000, 0);
    const above = model("above", 1_000, 0.1, 100);
    const scores = normalizedScores([...visible, below, above], weights(1, 1, 1), visible);

    for (const { normalized } of scores) {
      expect(normalized.speed).toBeGreaterThanOrEqual(0);
      expect(normalized.speed).toBeLessThanOrEqual(1);
      expect(normalized.cost).toBeGreaterThanOrEqual(0);
      expect(normalized.cost).toBeLessThanOrEqual(1);
      expect(normalized.intelligence).toBeGreaterThanOrEqual(0);
      expect(normalized.intelligence).toBeLessThanOrEqual(1);
    }
    expect(scores.find(({ model: row }) => row.model === "visible-low")?.normalized).toEqual({
      speed: 0,
      cost: 1,
      intelligence: 0,
    });
    expect(scores.find(({ model: row }) => row.model === "visible-high")?.normalized).toEqual({
      speed: 1,
      cost: 0,
      intelligence: 1,
    });
    expect(scores.find(({ model: row }) => row.model === "below")?.normalized).toEqual({
      speed: 0,
      cost: 0,
      intelligence: 0,
    });
    expect(scores.find(({ model: row }) => row.model === "above")?.normalized).toEqual({
      speed: 1,
      cost: 1,
      intelligence: 1,
    });
  });

  it("computes weighted composites and falls back to equal weights at zero", () => {
    const low = model("low", 10, 1, 10);
    const high = model("high", 100, 100, 100);
    const scores = normalizedScores([low, high], weights(2, 3, 5), [low, high]);
    const highScore = scores.find(({ model: row }) => row.model === "high")!;

    expect(highScore.score).toBeCloseTo(0.7);
    expect(normalizedScores([low, high], weights(0, 0, 0), [low, high])[0].score).toBeCloseTo(1 / 3);
  });

  it("exports workload preset triples including speed/latency and local VRAM", () => {
    expect(presets).toEqual({
      coding: { speed: 0.25, cost: 0.15, intelligence: 0.6 },
      chat: { speed: 0.35, cost: 0.3, intelligence: 0.35 },
      vision: { speed: 0.15, cost: 0.25, intelligence: 0.6 },
      RAG: { speed: 0.2, cost: 0.55, intelligence: 0.25 },
      "long-context": { speed: 0.25, cost: 0.45, intelligence: 0.3 },
      speed: { speed: 0.55, cost: 0.2, intelligence: 0.25 },
      local8: { speed: 0.45, cost: 0.2, intelligence: 0.35 },
      local12: { speed: 0.4, cost: 0.2, intelligence: 0.4 },
      local24: { speed: 0.35, cost: 0.15, intelligence: 0.5 },
    });
  });

  it("exports human intents including top-3 local VRAM tiers", () => {
    expect(intentPresets).toHaveLength(7);
    expect(intentPresets.map((i) => i.label)).toEqual([
      "Best balance",
      "Smartest",
      "Budget",
      "Fastest",
      "Local · 8 GB",
      "Local · 12 GB",
      "Local · 24 GB",
    ]);
    for (const intent of intentPresets) {
      expect(presets[intent.id]).toBeTruthy();
    }
  });

  it("recomputes the optimum without changing the frontier input", () => {
    const cheap = model("cheap", 10, 1, 10);
    const smart = model("smart", 100, 10, 100);
    const first = normalizedScores([cheap, smart], weights(0, 10, 0), [cheap, smart]);
    const second = normalizedScores([cheap, smart], weights(0, 0, 10), [cheap, smart]);

    expect(weightedOptimum(first)?.model.model).toBe("cheap");
    expect(weightedOptimum(second)?.model.model).toBe("smart");
    expect(frontier([cheap, smart]).map(({ model: name }) => name)).toEqual(["cheap", "smart"]);
  });
});
