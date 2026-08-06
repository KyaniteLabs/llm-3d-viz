import { describe, expect, it } from "vitest";
import { applyFilters, DEFAULT_FILTERS, sameFilters } from "../src/lib/filters";
import { deriveFamilyId, deriveEffortTier, groupByFamily } from "../src/lib/family";
import type { Model } from "../src/data/models";

function stub(partial: Partial<Model> & Pick<Model, "model" | "provider" | "release_date">): Model {
  return {
    openness: "closed",
    modality: ["text"],
    context_length: 128000,
    source_url: "https://example.test",
    tps: 100,
    ttft: 500,
    price_in_per_M: 1,
    price_out_per_M: 2,
    blended_price_per_M: 1.5,
    aa_intelligence_index: 50,
    arena_elo: null,
    gpqa: null,
    swe_bench: null,
    aider_pct: null,
    data_date: "2026-08-01",
    source: "test",
    ...partial,
  };
}

describe("filters", () => {
  const ref = new Date("2026-08-04T00:00:00Z");
  const models = [
    stub({ model: "New A", provider: "OpenAI", release_date: "2026-07-01", openness: "closed" }),
    stub({ model: "Old B", provider: "Anthropic", release_date: "2025-01-01", openness: "open" }),
    stub({ model: "New C", provider: "Anthropic", release_date: "2026-06-15", openness: "open" }),
  ];

  it("age ≤6 months excludes old release_date when enabled", () => {
    const visible = applyFilters(models, { ...DEFAULT_FILTERS, ageEnabled: true, multiEffortOnly: false }, ref);
    expect(visible.map((m) => m.model)).toEqual(["New A", "New C"]);
  });

  it("empty provider multi-select ≡ all", () => {
    const visible = applyFilters(
      models,
      { ...DEFAULT_FILTERS, ageEnabled: false, multiEffortOnly: false, providers: [] },
      ref,
    );
    expect(visible).toHaveLength(3);
  });

  it("provider multi-select unions", () => {
    const visible = applyFilters(
      models,
      { ...DEFAULT_FILTERS, ageEnabled: false, multiEffortOnly: false, providers: ["Anthropic"] },
      ref,
    );
    expect(visible.map((m) => m.model).sort()).toEqual(["New C", "Old B"]);
  });

  it("multiEffortOnly keeps multi-step families; low-IQ singletons drop", () => {
    const rows = [
      stub({ model: "Fam (low)", provider: "X", release_date: "2026-07-01", effort_tier: "low" }),
      stub({ model: "Fam (max)", provider: "X", release_date: "2026-07-01", effort_tier: "max" }),
      // Mid-tier singleton — not multi-effort, not frontier IQ
      stub({
        model: "Solo Mid",
        provider: "Y",
        release_date: "2026-07-01",
        aa_intelligence_index: 30,
      }),
    ];
    const visible = applyFilters(rows, { ...DEFAULT_FILTERS, ageEnabled: false, multiEffortOnly: true }, ref);
    expect(visible.map((m) => m.model).sort()).toEqual(["Fam (low)", "Fam (max)"]);
  });

  it("multiEffortOnly keeps high-IQ frontier singletons (Grok / Fable)", () => {
    const rows = [
      stub({
        model: "Grok 4.5 (high)",
        provider: "SpaceXAI",
        release_date: "2026-07-08",
        family_id: "Grok 4.5",
        aa_intelligence_index: 53.8,
      }),
      stub({
        model: "Claude Opus 5 (max)",
        provider: "Anthropic",
        release_date: "2026-07-24",
        family_id: "Claude Opus 5",
        effort_tier: "max",
        aa_intelligence_index: 60,
      }),
      stub({
        model: "Claude Opus 5 (high)",
        provider: "Anthropic",
        release_date: "2026-07-24",
        family_id: "Claude Opus 5",
        effort_tier: "high",
        aa_intelligence_index: 58,
      }),
    ];
    const browse = applyFilters(rows, { ...DEFAULT_FILTERS, ageEnabled: false, multiEffortOnly: true }, ref);
    expect(browse.map((m) => m.model).sort()).toEqual([
      "Claude Opus 5 (high)",
      "Claude Opus 5 (max)",
      "Grok 4.5 (high)",
    ]);
  });

  it("explicit family selection shows singletons even when multiEffortOnly is on (Fable)", () => {
    const rows = [
      stub({
        model: "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
        provider: "Anthropic",
        release_date: "2026-06-09",
        family_id: "Claude Fable 5",
        effort_tier: "max",
        aa_intelligence_index: 40, // below frontier singleton floor when not selected
      }),
      stub({
        model: "Claude Opus 5 (max)",
        provider: "Anthropic",
        release_date: "2026-07-24",
        family_id: "Claude Opus 5",
        effort_tier: "max",
      }),
      stub({
        model: "Claude Opus 5 (high)",
        provider: "Anthropic",
        release_date: "2026-07-24",
        family_id: "Claude Opus 5",
        effort_tier: "high",
      }),
    ];
    // Browse: low-IQ Fable singleton still hidden by multi-effort
    const browse = applyFilters(rows, { ...DEFAULT_FILTERS, ageEnabled: false, multiEffortOnly: true }, ref);
    expect(browse.every((m) => !m.model.includes("Fable"))).toBe(true);
    // Explicit solo: Fable must appear (user selected it)
    const solo = applyFilters(
      rows,
      {
        ...DEFAULT_FILTERS,
        ageEnabled: false,
        multiEffortOnly: true,
        families: ["Claude Fable 5"],
      },
      ref,
    );
    expect(solo).toHaveLength(1);
    expect(solo[0].model).toContain("Fable");
  });

  it("providers __none__ yields empty visible set", () => {
    const visible = applyFilters(
      models,
      { ...DEFAULT_FILTERS, ageEnabled: false, multiEffortOnly: false, providers: ["__none__"] },
      ref,
    );
    expect(visible).toHaveLength(0);
  });

  it("sameFilters is deep-equal on arrays", () => {
    const a = { ...DEFAULT_FILTERS, providers: ["b", "a"] };
    const b = { ...DEFAULT_FILTERS, providers: ["a", "b"] };
    expect(sameFilters(a, b)).toBe(true);
    expect(sameFilters(a, { ...b, ageEnabled: false })).toBe(false);
  });
});

describe("family", () => {
  it("strips effort suffixes for family_id", () => {
    expect(deriveFamilyId("GPT-5.6 Sol (max)")).toBe("GPT-5.6 Sol");
    expect(deriveEffortTier({ model: "GPT-5.6 Sol (max)", reasoning: true })).toBe("max");
  });

  it("groups and ranks multi-effort rows", () => {
    const rows = [
      stub({ model: "Fam (high)", provider: "X", release_date: "2026-07-01", effort_tier: "high" }),
      stub({ model: "Fam (max)", provider: "X", release_date: "2026-07-01", effort_tier: "max" }),
    ];
    const groups = groupByFamily(rows);
    const fam = groups.get(deriveFamilyId("Fam (max)"))!;
    expect(fam).toHaveLength(2);
    expect(deriveEffortTier(fam[0])).toBe("high");
    expect(deriveEffortTier(fam[1])).toBe("max");
  });
});

describe("listMultiEffortFamilies", () => {
  it("returns only families with 2+ rows, largest first", async () => {
    const { listMultiEffortFamilies } = await import("../src/lib/filters");
    const rows = [
      stub({ model: "A (low)", provider: "X", release_date: "2026-07-01" }),
      stub({ model: "A (max)", provider: "X", release_date: "2026-07-01" }),
      stub({ model: "A (high)", provider: "X", release_date: "2026-07-01" }),
      stub({ model: "B (max)", provider: "Y", release_date: "2026-07-01" }),
      stub({ model: "C (low)", provider: "Z", release_date: "2026-07-01" }),
      stub({ model: "C (max)", provider: "Z", release_date: "2026-07-01" }),
    ];
    const multi = listMultiEffortFamilies(rows);
    expect(multi.map((m) => m.family)).toEqual(["A", "C"]);
    expect(multi[0].count).toBe(3);
  });
});
