import { describe, expect, it } from "vitest";
import {
  DATA_ERROR,
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

  it("classifies negative-price rows as data_error quarantine entries", () => {
    const negative = model({ price_in_per_M: -1, price_out_per_M: 2, blended_price_per_M: 1.7 });
    const quarantined = quarantinedModels([negative]);

    expect(quarantined).toEqual([{ ...negative, reason: DATA_ERROR }]);
    expect(incompleteModels().every(({ null_reason }) => null_reason.length > 0)).toBe(true);
  });
});
