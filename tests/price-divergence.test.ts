import { describe, expect, it } from "vitest";
import {
  computeCurrentDivergences,
  mergeDivergenceRecords,
} from "../scripts/lib/price-divergence.mjs";

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

const orModels = [
  {
    id: "deepseek/deepseek-v4-pro",
    pricing: { prompt: "0.000001168", completion: "0.000002336", input_cache_read: "0.0000000986" },
  },
];

describe("price-divergence canary", () => {
  it("records per-side divergence ≥25% between AA and OpenRouter", () => {
    const recs = computeCurrentDivergences([aaRow()], orModels, "2026-08-14");
    // in: 0.43 vs 1.168 → 2.72×; out: 0.87 vs 2.336 → 2.69×; cache: 0 skipped (aa<=0)
    expect(recs).toHaveLength(2);
    expect(recs[0].ratio).toBeGreaterThanOrEqual(2.6);
    expect(recs[0].first_seen).toBe("2026-08-14");
  });

  it("records nothing when sources agree", () => {
    const agree = [
      {
        id: "deepseek/deepseek-v4-pro",
        pricing: { prompt: "0.00000043", completion: "0.00000087", input_cache_read: "0.00000043" },
      },
    ];
    expect(computeCurrentDivergences([aaRow({ price_cache_per_M: 0.43 })], agree)).toHaveLength(0);
  });

  it("merges with previous records: level-flat is recorded but changed=false", () => {
    const cur = computeCurrentDivergences([aaRow()], orModels, "2026-08-15");
    const prev = cur.map((r) => ({ ...r, first_seen: "2026-08-14" }));
    const merged = mergeDivergenceRecords(cur, prev, "2026-08-15");
    expect(merged.every((r) => !r.changed)).toBe(true);
    expect(merged.every((r) => r.age_days === 1)).toBe(true);
  });

  it("flags delta when the ratio moves vs previous run", () => {
    const cur = computeCurrentDivergences([aaRow()], orModels, "2026-08-15");
    const prev = cur.map((r) => ({ ...r, ratio: r.ratio + 0.5, first_seen: "2026-08-14" }));
    const merged = mergeDivergenceRecords(cur, prev, "2026-08-15");
    expect(merged.filter((r) => r.changed)).toHaveLength(2);
  });

  it("flap grace: one-run absence keeps the record (stale), two drops it", () => {
    const prev = [
      {
        model: "DeepSeek V4 Pro",
        provider: "DeepSeek",
        field: "price_in_per_M",
        aa_per_M: 0.43,
        or_per_M: 1.17,
        ratio: 2.72,
        first_seen: "2026-08-14",
        age_days: 1,
        changed: false,
        absent_runs: 0,
      },
    ];
    const afterOneMiss = mergeDivergenceRecords([], prev, "2026-08-15");
    expect(afterOneMiss).toHaveLength(1);
    expect(afterOneMiss[0].stale).toBe(true);
    expect(afterOneMiss[0].absent_runs).toBe(1);
    const afterTwoMisses = mergeDivergenceRecords([], afterOneMiss, "2026-08-16");
    expect(afterTwoMisses).toHaveLength(0);
  });
});
