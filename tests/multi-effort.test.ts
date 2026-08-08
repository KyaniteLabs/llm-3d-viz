import { describe, expect, it } from "vitest";
import { models, allModels, isScorable } from "../src/data/models";
import { RELEASE_FLOOR_ISO, meetsReleaseFloor } from "../src/data/catalog-scope";
import { deriveEffortTier, familyIdOf, groupByFamily } from "../src/lib/family";

describe("multi-effort catalog (AA expansion)", () => {
  it("has many scorable rows and multi-effort families for curves", () => {
    const scorable = models.filter(isScorable);
    expect(scorable.length).toBeGreaterThan(50);
    const byFamily = groupByFamily(scorable);
    const multi = [...byFamily.entries()].filter(([, rows]) => rows.length >= 2);
    expect(multi.length).toBeGreaterThanOrEqual(12);
  });

  it("includes full GPT-5.6 Sol and Claude Opus 5 intensity ladders", () => {
    const sol = models.filter((m) => familyIdOf(m) === "GPT-5.6 Sol" && isScorable(m));
    const opus = models.filter((m) => familyIdOf(m) === "Claude Opus 5" && isScorable(m));
    const solTiers = new Set(sol.map((m) => deriveEffortTier(m)));
    const opusTiers = new Set(opus.map((m) => deriveEffortTier(m)));
    expect(sol.length).toBeGreaterThanOrEqual(5);
    expect(opus.length).toBeGreaterThanOrEqual(4);
    expect(solTiers.has("xhigh")).toBe(true);
    expect(solTiers.has("max")).toBe(false);
    expect(solTiers.has("high") || solTiers.has("xhigh")).toBe(true);
    expect(opusTiers.has("max")).toBe(true);
  });

  it("orders family groups by effort rank (low → xhigh)", () => {
    const sol = groupByFamily(models.filter(isScorable)).get("GPT-5.6 Sol") ?? [];
    expect(sol.length).toBeGreaterThanOrEqual(5);
    const ranks = sol.map((m) => {
      const t = deriveEffortTier(m);
      const order = ["none", "low", "medium", "high", "max", "xhigh", "default"];
      return order.indexOf(t);
    });
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });
});

describe("catalog scope", () => {
  it("default cloud catalog is a subset of the full draft", () => {
    expect(allModels.length).toBeGreaterThan(models.length);
    expect(
      models.every((m) =>
        [
          "OpenAI",
          "Anthropic",
          "DeepSeek",
          "Google",
          "NVIDIA",
          "Kimi",
          "Z AI",
          "Alibaba",
          "MiniMax",
          "SpaceXAI",
          "Meta",
        ].includes(m.provider),
      ),
    ).toBe(true);
  });
});

describe("release floor", () => {
  it("product catalog has no pre-2026 release_date", () => {
    expect(models.every((m) => meetsReleaseFloor(m.release_date))).toBe(true);
    expect(models.every((m) => m.release_date.slice(0, 10) >= RELEASE_FLOOR_ISO)).toBe(true);
  });

  it("allModels still retains older archive rows", () => {
    expect(allModels.some((m) => !meetsReleaseFloor(m.release_date))).toBe(true);
  });
});

describe("M005: isScorable range guards", () => {
  it("rejects negative tps even when finite", () => {
    expect(
      isScorable({
        model: "X",
        provider: "OpenAI",
        openness: "closed",
        modality: ["text"],
        context_length: 128000,
        release_date: "2026-01-01",
        source_url: "x",
        data_date: "2026-08-08",
        source: "test",
        tps: -1,
        ttft: null,
        price_in_per_M: 1,
        price_out_per_M: 2,
        blended_price_per_M: 1.5,
        aa_intelligence_index: 60,
        arena_elo: null,
        gpqa: null,
        swe_bench: null,
        aider_pct: null,
      }),
    ).toBe(false);
  });

  it("rejects aa_intelligence_index > 100", () => {
    expect(
      isScorable({
        model: "Y",
        provider: "OpenAI",
        openness: "closed",
        modality: ["text"],
        context_length: 128000,
        release_date: "2026-01-01",
        source_url: "x",
        data_date: "2026-08-08",
        source: "test",
        tps: 10,
        ttft: null,
        price_in_per_M: 1,
        price_out_per_M: 2,
        blended_price_per_M: 1.5,
        aa_intelligence_index: 101,
        arena_elo: null,
        gpqa: null,
        swe_bench: null,
        aider_pct: null,
      }),
    ).toBe(false);
  });

  it("admits valid row with tps=0 and index=0", () => {
    expect(
      isScorable({
        model: "Z",
        provider: "OpenAI",
        openness: "closed",
        modality: ["text"],
        context_length: 128000,
        release_date: "2026-01-01",
        source_url: "x",
        data_date: "2026-08-08",
        source: "test",
        tps: 0,
        ttft: null,
        price_in_per_M: 1,
        price_out_per_M: 2,
        blended_price_per_M: 1.5,
        aa_intelligence_index: 0,
        arena_elo: null,
        gpqa: null,
        swe_bench: null,
        aider_pct: null,
      }),
    ).toBe(true);
  });
});
