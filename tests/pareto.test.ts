import { describe, expect, it } from "vitest";
import type { Model } from "../src/data/models";
import { dominates, frontier, ridgeOrder } from "../src/lib/pareto";

const model = (name: string, tps: number, price: number, intel: number): Model => ({
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

describe("Pareto frontier", () => {
  it("uses linear dominance and does not dominate all-equal points", () => {
    const a = model("a", 100, 1, 80);
    const b = model("b", 100, 1, 80);
    const better = model("better", 110, 1, 80);

    expect(dominates(a, b)).toBe(false);
    expect(dominates(b, a)).toBe(false);
    expect(dominates(better, a)).toBe(true);
  });

  it("compares dominance and tied triples at published precision", () => {
    const a = model("a", 100.04, 2.004, 80.04);
    const b = model("b", 100.03, 2.003, 80.03);

    expect(dominates(a, b)).toBe(false);
    expect(dominates(b, a)).toBe(false);
    const ridge = ridgeOrder([a, b]);
    expect(ridge).toHaveLength(1);
    expect(ridge[0].aliases).toHaveLength(1);
    expect(new Set([ridge[0].model.model, ...ridge[0].aliases.map(({ model: name }) => name)])).toEqual(
      new Set(["a", "b"]),
    );
  });

  it("returns the three expected frontier models in deterministic ridge order", () => {
    const fixture = [
      model("cheap", 80, 1, 60),
      model("middle", 100, 2, 75),
      model("smart", 90, 4, 90),
      model("dominated-1", 70, 3, 65),
      model("dominated-2", 95, 3, 70),
      model("dominated-3", 85, 5, 80),
    ];

    const result = frontier(fixture);
    expect(result.map(({ model: name }) => name)).toEqual(["cheap", "middle", "smart"]);
    expect(ridgeOrder(result).map((vertex) => vertex.model.model)).toEqual([
      "cheap",
      "middle",
      "smart",
    ]);
  });

  it("deduplicates tied triples into one ridge vertex while preserving aliases", () => {
    const first = model("first", 100, 2, 80);
    const second = model("second", 100, 2, 80);
    const ridge = ridgeOrder(frontier([first, second]));

    expect(ridge).toHaveLength(1);
    expect(ridge[0].model.model).toBe("first");
    expect(ridge[0].aliases.map(({ model: name }) => name)).toEqual(["second"]);
  });

  it("excludes incomplete and negative-price rows from the frontier", () => {
    const complete = model("complete", 100, 2, 80);
    const missingIntel = { ...complete, model: "missing-intel", aa_intelligence_index: null };
    const negative = { ...complete, model: "negative", blended_price_per_M: -1 };

    expect(frontier([complete, missingIntel, negative]).map(({ model: name }) => name)).toEqual([
      "complete",
    ]);
  });
});
