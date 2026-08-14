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

  // WS5: AA secondary intelligence sub-indices — nullable, 0–100 when present.
  describe("WS5 secondary intelligence axes (coding_index / agentic_index)", () => {
    const prices = { price_in_per_M: 1, price_out_per_M: 2, blended_price_per_M: 1.7 };

    it.each(["coding_index", "agentic_index"] as const)(
      "rejects an out-of-range %s loudly",
      (field) => {
        expect(() =>
          validateModels([{ ...model(prices), [field]: 100.5 } as Model]),
        ).toThrow(new RegExp(`${field} must be null or within 0-100`));
        expect(() =>
          validateModels([{ ...model(prices), [field]: -1 } as Model]),
        ).toThrow(new RegExp(`${field} must be null or within 0-100`));
        expect(() =>
          validateModels([{ ...model(prices), [field]: Number.NaN } as Model]),
        ).toThrow(new RegExp(`${field} must be null or within 0-100`));
      },
    );

    it("accepts null and the full 0–100 range for both sub-indices", () => {
      expect(() =>
        validateModels([
          { ...model(prices), coding_index: null, agentic_index: null },
          { ...model(prices), model: "fixture-2", coding_index: 0, agentic_index: 100 },
          { ...model(prices), model: "fixture-3", coding_index: 47.3, agentic_index: 12.9 },
        ]),
      ).not.toThrow();
    });

    it("round-trips aa-api measured provenance keys through validateModels", () => {
      expect(() =>
        validateModels([
          {
            ...model(prices),
            coding_index: 63,
            agentic_index: 41,
            time_per_index_task_s: 9.09,
            sources: {
              coding_index: { origin: "aa-api", kind: "measured" },
              agentic_index: { origin: "aa-api", kind: "measured" },
              time_per_index_task_s: { origin: "aa-api", kind: "measured" },
            },
          },
        ]),
      ).not.toThrow();
    });
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
