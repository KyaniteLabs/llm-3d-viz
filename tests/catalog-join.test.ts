import { describe, expect, it } from "vitest";
import {
  joinCatalog,
  applyArenaElo,
  applyOpenRouterPricing,
  candidatesForArena,
  spineKey,
  isScorable,
} from "../scripts/lib/catalog-join.mjs";
import { parseArenaIdentity } from "../src/lib/family-effort.shared";

function aaRow(partial: Record<string, unknown>) {
  return {
    model: "Test",
    provider: "Anthropic",
    openness: "closed",
    modality: ["text"],
    context_length: 200000,
    release_date: "2026-06-01",
    data_date: "2026-08-05",
    source: "test",
    source_url: "https://artificialanalysis.ai/models/test",
    tps: 50,
    ttft: 1000,
    price_in_per_M: 5,
    price_out_per_M: 25,
    blended_price_per_M: 3.85,
    aa_intelligence_index: 55,
    arena_elo: null,
    gpqa: null,
    swe_bench: null,
    aider_pct: null,
    reasoning: true,
    family_id: "Test",
    effort_tier: "max",
    ...partial,
  };
}

describe("catalog-join", () => {
  it("spineKey uses slug + effort", () => {
    const r = aaRow({
      source_url: "https://artificialanalysis.ai/models/claude-opus-5-medium",
      effort_tier: "medium",
    });
    expect(spineKey(r)).toBe("claude-opus-5-medium::medium");
  });

  it("fixture: Opus multi-effort ladder stays scorable", () => {
    const tiers = ["low", "medium", "high", "xhigh", "max"] as const;
    const rows = tiers.map((t, i) =>
      aaRow({
        model: `Claude Opus 5 (${t})`,
        family_id: "Claude Opus 5",
        effort_tier: t,
        source_url: `https://artificialanalysis.ai/models/claude-opus-5-${t}`,
        aa_intelligence_index: 50 + i,
      }),
    );
    const out = joinCatalog(rows);
    expect(out.scorable).toHaveLength(5);
    expect(new Set(out.scorable.map((r) => r.effort_tier)).size).toBe(5);
  });

  it("fixture: Fable max + Arena bare claude-fable-5 attaches Elo to max", () => {
    const fable = aaRow({
      model: "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
      family_id: "Claude Fable 5",
      effort_tier: "max",
      source_url: "https://artificialanalysis.ai/models/claude-fable-5",
      aa_intelligence_index: 60,
    });
    const { rows, attaches } = applyArenaElo([fable], [
      {
        modelDisplayName: "claude-fable-5",
        modelKey: "claude-fable-5-text",
        modelOrganization: "Anthropic",
        rating: 1508.57,
      },
    ]);
    expect(attaches).toBe(1);
    expect(rows[0].arena_elo).toBeCloseTo(1508.57);
    expect(rows[0].sources?.arena_elo?.origin).toBe("arena");
    expect(rows[0].tps).toBe(50); // Elo-only: tps untouched
    expect(rows[0].aa_intelligence_index).toBe(60);
  });

  it("rejects cross-effort Elo (Arena high not on AA max)", () => {
    const max = aaRow({
      model: "Claude Opus 5 (Max)",
      family_id: "Claude Opus 5",
      effort_tier: "max",
      source_url: "https://artificialanalysis.ai/models/claude-opus-5-max",
    });
    const low = aaRow({
      model: "Claude Opus 5 (Low)",
      family_id: "Claude Opus 5",
      effort_tier: "low",
      source_url: "https://artificialanalysis.ai/models/claude-opus-5-low",
      aa_intelligence_index: 50,
    });
    const { rows, attaches } = applyArenaElo([max, low], [
      {
        modelDisplayName: "claude-opus-5-high",
        modelKey: "claude-opus-5-high",
        modelOrganization: "Anthropic",
        rating: 1491,
      },
    ]);
    expect(attaches).toBe(0);
    expect(rows.every((r) => r.arena_elo == null)).toBe(true);
  });

  it("attaches Arena high only to AA high", () => {
    const high = aaRow({
      model: "Claude Opus 5 (High)",
      family_id: "Claude Opus 5",
      effort_tier: "high",
      source_url: "https://artificialanalysis.ai/models/claude-opus-5-high",
    });
    const max = aaRow({
      model: "Claude Opus 5 (Max)",
      family_id: "Claude Opus 5",
      effort_tier: "max",
      source_url: "https://artificialanalysis.ai/models/claude-opus-5-max",
    });
    const { rows, attaches } = applyArenaElo([high, max], [
      {
        modelDisplayName: "claude-opus-5-high",
        modelKey: "claude-opus-5-high",
        modelOrganization: "Anthropic",
        rating: 1491.8,
      },
    ]);
    expect(attaches).toBe(1);
    expect(rows.find((r) => r.effort_tier === "high")?.arena_elo).toBeCloseTo(1491.8);
    expect(rows.find((r) => r.effort_tier === "max")?.arena_elo).toBeNull();
  });

  it("OpenRouter never writes IQ/TPS; labels derived blend", () => {
    const row = aaRow({
      price_in_per_M: null,
      price_out_per_M: null,
      blended_price_per_M: null,
      source_url: "https://artificialanalysis.ai/models/claude-fable-5",
    });
    // not scorable without price
    expect(isScorable(row)).toBe(false);
    const { rows, overlays } = applyOpenRouterPricing([row], [
      {
        id: "anthropic/claude-fable-5",
        pricing: { prompt: "0.00001", completion: "0.00005" },
      },
    ]);
    expect(overlays).toBe(1);
    expect(rows[0].aa_intelligence_index).toBe(55);
    expect(rows[0].tps).toBe(50);
    expect(rows[0].price_in_per_M).toBeCloseTo(10);
    expect(rows[0].price_out_per_M).toBeCloseTo(50);
    expect(rows[0].blended_price_per_M).toBeGreaterThan(0);
    expect(rows[0].sources?.blended_price_per_M?.kind).toBe("derived_list_blend");
    expect(isScorable(rows[0])).toBe(true);
  });

  it("candidatesForArena uses normalizeFamily bridge", () => {
    const fable = aaRow({
      family_id: "Claude Fable 5",
      source_url: "https://artificialanalysis.ai/models/claude-fable-5",
    });
    const id = parseArenaIdentity({
      modelDisplayName: "claude-fable-5",
      modelKey: "claude-fable-5-text",
    });
    expect(candidatesForArena([fable], id)).toHaveLength(1);
  });

  it("does not prefix-match Arena gpt-5 onto gpt-5-6-sol", () => {
    const sol = aaRow({
      model: "GPT-5.6 Sol (High)",
      provider: "OpenAI",
      family_id: "GPT-5.6 Sol",
      effort_tier: "high",
      source_url: "https://artificialanalysis.ai/models/gpt-5-6-sol-high",
    });
    const { attaches, rows } = applyArenaElo([sol], [
      {
        modelDisplayName: "gpt-5-high",
        modelKey: "gpt-5-high",
        modelOrganization: "OpenAI",
        rating: 1400,
      },
    ]);
    expect(attaches).toBe(0);
    expect(rows[0].arena_elo).toBeNull();
  });

  it("AA-derived blend when in/out present and blend missing", () => {
    const row = aaRow({
      blended_price_per_M: null,
      price_in_per_M: 10,
      price_out_per_M: 50,
    });
    const out = joinCatalog([row]);
    expect(out.scorable).toHaveLength(1);
    expect(out.scorable[0].blended_price_per_M).toBeCloseTo((10 * 7 + 50 * 2) / 10);
    expect(out.scorable[0].sources?.blended_price_per_M?.origin).toBe("aa");
    expect(out.scorable[0].sources?.blended_price_per_M?.kind).toBe("derived");
  });

  it("fixture set attaches at least 3 Elo rows", () => {
    const rows = [
      aaRow({
        model: "Claude Fable 5 Max",
        family_id: "Claude Fable 5",
        effort_tier: "max",
        source_url: "https://artificialanalysis.ai/models/claude-fable-5",
      }),
      aaRow({
        model: "Claude Opus 5 High",
        family_id: "Claude Opus 5",
        effort_tier: "high",
        source_url: "https://artificialanalysis.ai/models/claude-opus-5-high",
      }),
      aaRow({
        model: "Claude Opus 5 Max",
        family_id: "Claude Opus 5",
        effort_tier: "max",
        source_url: "https://artificialanalysis.ai/models/claude-opus-5-max",
      }),
      aaRow({
        model: "Claude Sonnet 5 High",
        family_id: "Claude Sonnet 5",
        effort_tier: "high",
        source_url: "https://artificialanalysis.ai/models/claude-sonnet-5-high",
      }),
    ];
    const arena = [
      {
        modelDisplayName: "claude-fable-5",
        modelKey: "claude-fable-5-text",
        modelOrganization: "Anthropic",
        rating: 1508,
      },
      {
        modelDisplayName: "claude-opus-5-high",
        modelKey: "claude-opus-5-high",
        modelOrganization: "Anthropic",
        rating: 1491,
      },
      {
        modelDisplayName: "claude-opus-5-max",
        modelKey: "claude-opus-5-max",
        modelOrganization: "Anthropic",
        rating: 1490,
      },
      {
        modelDisplayName: "claude-sonnet-5-high",
        modelKey: "claude-sonnet-5-high",
        modelOrganization: "Anthropic",
        rating: 1462,
      },
    ];
    const { attaches } = applyArenaElo(rows, arena);
    expect(attaches).toBeGreaterThanOrEqual(3);
  });
});
