import { describe, expect, it } from "vitest";
import {
  applyOpenRouterPricing,
  applyAaDerivedBlend,
} from "../scripts/lib/catalog-join.mjs";

function aaRow(p) {
  return {
    model: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    family_id: "DeepSeek V4 Pro",
    effort_tier: "none",
    source_url: "https://artificialanalysis.ai/models/deepseek-v4-pro",
    price_in_per_M: 0.43,
    price_out_per_M: 0.87,
    price_cache_per_M: 0,
    ...p,
  };
}

const orWithCache = [
  {
    id: "deepseek/deepseek-v4-pro",
    pricing: { prompt: "0.000001168", completion: "0.000002336", input_cache_read: "0.0000000986" },
  },
];

describe("WS2 stage-3 — OR cache-slot completion + blend re-derivation", () => {
  it("completes a sentinel-0 cache from OR and re-derives our fallback blend", () => {
    // C1 fallback blend first (cache slot = input price)
    const withFallback = applyAaDerivedBlend([aaRow()]);
    expect(withFallback[0].sources.blended_price_per_M).toEqual({ origin: "aa", kind: "derived" });
    const { rows } = applyOpenRouterPricing(withFallback, orWithCache);
    const row = rows[0];
    expect(row.price_cache_per_M).toBeCloseTo(0.0986, 4);
    expect(row.sources.price_cache_per_M).toEqual({ origin: "openrouter", kind: "list" });
    expect(row.blended_price_per_M).toBeCloseTo((0.0986 * 7 + 0.43 * 2 + 0.87) / 10, 5);
    expect(row.sources.blended_price_per_M).toEqual({
      origin: "openrouter",
      kind: "derived_list_blend",
    });
  });

  it("completes an absent (null) cache slot the same way", () => {
    const row = { ...aaRow({ price_cache_per_M: null }), blended_price_per_M: null };
    const { rows } = applyOpenRouterPricing([row], orWithCache);
    expect(rows[0].price_cache_per_M).toBeCloseTo(0.0986, 4);
    expect(rows[0].sources.blended_price_per_M?.kind).toBe("derived_list_blend");
  });

  it("never recomputes an AA-measured blend (only the cache slot completes)", () => {
    const row = aaRow({
      blended_price_per_M: 0.5,
      sources: { blended_price_per_M: { origin: "aa-api", kind: "measured" } },
    });
    const { rows } = applyOpenRouterPricing([row], orWithCache);
    expect(rows[0].blended_price_per_M).toBe(0.5);
    expect(rows[0].sources.blended_price_per_M).toEqual({ origin: "aa-api", kind: "measured" });
    expect(rows[0].price_cache_per_M).toBeCloseTo(0.0986, 4);
  });

  it("derives a missing blend from a positive AA cache price (cache itself untouched)", () => {
    const row = aaRow({ price_cache_per_M: 0.04, blended_price_per_M: null });
    const { rows } = applyOpenRouterPricing([row], orWithCache);
    expect(rows[0].price_cache_per_M).toBe(0.04);
    expect(rows[0].blended_price_per_M).toBeCloseTo((0.04 * 7 + 0.43 * 2 + 0.87) / 10, 5);
    expect(rows[0].sources.blended_price_per_M).toEqual({
      origin: "openrouter",
      kind: "derived_list_blend",
    });
  });

  it("keeps the C1 input fallback when OR has no cache price either", () => {
    const noCacheOr = [
      {
        id: "deepseek/deepseek-v4-pro",
        pricing: { prompt: "0.000001168", completion: "0.000002336" },
      },
    ];
    const withFallback = applyAaDerivedBlend([aaRow()]);
    const { rows } = applyOpenRouterPricing(withFallback, noCacheOr);
    expect(rows[0].price_cache_per_M).toBe(0);
    expect(rows[0].blended_price_per_M).toBeCloseTo((0.43 * 7 + 0.43 * 2 + 0.87) / 10, 5);
    expect(rows[0].sources.blended_price_per_M).toEqual({ origin: "aa", kind: "derived" });
  });
});
