import { describe, expect, it } from "vitest";
import {
  DATA_ERROR,
  incompleteAxisCoverage,
  incompleteModels,
  quarantinedModels,
  validateModels,
  type Model,
} from "../src/data/models";

const model = (prices: Pick<Model, "price_in_per_M" | "price_out_per_M" | "blended_price_per_M">): Model => ({
  model: "fixture",
  provider: "fixture",
  openness: "open",
  modality: ["text"],
  context_length: 128_000,
  release_date: "2026-01-01",
  source_url: "https://example.test",
  tps: 100,
  ttft: 100,
  ...prices,
  aa_intelligence_index: 80,
  arena_elo: null,
  gpqa: null,
  swe_bench: null,
  aider_pct: null,
  data_date: "2026-01-01",
  source: "fixture",
});

describe("model data validation", () => {
  it.each(["price_in_per_M", "price_out_per_M", "blended_price_per_M"] as const)(
    "rejects a negative %s",
    (field) => {
      const prices = { price_in_per_M: 1, price_out_per_M: 2, blended_price_per_M: 1.7 };
      prices[field] = -1;

      expect(() => validateModels([model(prices)])).toThrow(/must be null or >= 0/);
    },
  );

  it("allows null prices for incomplete rows", () => {
    expect(() =>
      validateModels([
        {
          ...model({ price_in_per_M: null, price_out_per_M: null, blended_price_per_M: null }),
          null_reason: "unpublished",
        },
      ]),
    ).not.toThrow();
  });

  it("accepts an optional boolean `reasoning` field and rejects a non-boolean", () => {
    expect(() => validateModels([{ ...model({ price_in_per_M: 1, price_out_per_M: 2, blended_price_per_M: 1.7 }), reasoning: true }])).not.toThrow();
    expect(() => validateModels([{ ...model({ price_in_per_M: 1, price_out_per_M: 2, blended_price_per_M: 1.7 }), reasoning: false }])).not.toThrow();
    expect(() => validateModels([{ ...model({ price_in_per_M: 1, price_out_per_M: 2, blended_price_per_M: 1.7 }) }])).not.toThrow();
    expect(() =>
      validateModels([{ ...model({ price_in_per_M: 1, price_out_per_M: 2, blended_price_per_M: 1.7 }), reasoning: "yes" as unknown as boolean }]),
    ).toThrow(/reasoning must be a boolean when present/);
  });

  it("classifies negative-price rows as data_error quarantine entries", () => {
    const negative = model({ price_in_per_M: -1, price_out_per_M: 2, blended_price_per_M: 1.7 });
    const quarantined = quarantinedModels([negative]);

    expect(quarantined).toEqual([{ ...negative, reason: DATA_ERROR }]);
    expect(incompleteModels().every(({ null_reason }) => null_reason.length > 0)).toBe(true);
  });
});

describe("incompleteAxisCoverage (FIX-C #28: per-axis missing-data labels)", () => {
  it("marks all three axes missing for a fully-unmeasured model (GPT-5.5 Pro xhigh)", () => {
    const allMissing: Model = {
      ...model({ price_in_per_M: null, price_out_per_M: null, blended_price_per_M: null }),
      model: "GPT-5.5 Pro (xhigh)",
      tps: null,
      aa_intelligence_index: null,
      null_reason: "not_measured",
    };
    const cov = incompleteAxisCoverage(allMissing);
    expect(cov.map((c) => [c.axis, c.measured])).toEqual([
      ["speed", false],
      ["cost", false],
      ["intelligence", false],
    ]);
    expect(cov.map((c) => c.display)).toEqual([
      "not measured",
      "not measured",
      "not measured",
    ]);
  });

  it("shows published values and marks only the missing axis (DeepSeek V4 Flash 0731)", () => {
    const deepseek: Model = {
      ...model({ price_in_per_M: 0.14, price_out_per_M: 0.28, blended_price_per_M: 0.05796 }),
      model: "DeepSeek V4 Flash 0731 (Reasoning, Max Effort)",
      tps: null, // only speed is missing
      aa_intelligence_index: 49.9,
      null_reason: "not_measured",
    };
    const byAxis = Object.fromEntries(incompleteAxisCoverage(deepseek).map((c) => [c.axis, c]));
    expect(byAxis.speed).toMatchObject({ measured: false, display: "not measured" });
    expect(byAxis.cost).toMatchObject({ measured: true, display: "$0.06 /M tokens" });
    expect(byAxis.intelligence).toMatchObject({ measured: true, display: "49.9" });
  });

  it("translates the null_reason enum to a per-axis human label", () => {
    const unpublished: Model = {
      ...model({ price_in_per_M: null, price_out_per_M: null, blended_price_per_M: null }),
      tps: null,
      aa_intelligence_index: null,
      null_reason: "unpublished",
    };
    expect(incompleteAxisCoverage(unpublished).map((c) => c.display)).toEqual([
      "unpublished",
      "unpublished",
      "unpublished",
    ]);
  });
});
