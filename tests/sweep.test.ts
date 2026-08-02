import { describe, expect, it, vi } from "vitest";
import type { Model } from "../src/data/models";
import { normalizedScores, weightedOptimum, type ScoreWeights } from "../src/lib/score";
import { ignitionOrder } from "../src/viz/sweep";

vi.mock("plotly.js-dist-min", () => ({}));

const model = (name: string, tps: number, price: number, intelligence: number): Model => ({
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
  aa_intelligence_index: intelligence,
  arena_elo: null,
  gpqa: null,
  swe_bench: null,
  aider_pct: null,
  data_date: "2026-01-01",
  source: "fixture",
});

describe("sweep ignition order", () => {
  it("ends on the documented optimum when frontier composites tie", () => {
    const alpha = model("alpha", 10, 10, 100);
    const zeta = model("zeta", 100, 1, 0);
    const models = [alpha, zeta];
    const weights: ScoreWeights = { speed: 1, cost: 1, intelligence: 2 };
    const scores = normalizedScores(models, weights, models);

    expect(scores.map(({ score }) => score)).toEqual([0.5, 0.5]);
    expect(weightedOptimum(scores)?.model.model).toBe("alpha");
    expect(ignitionOrder(models, weights, true).at(-1)).toBe("alpha");
  });
});
