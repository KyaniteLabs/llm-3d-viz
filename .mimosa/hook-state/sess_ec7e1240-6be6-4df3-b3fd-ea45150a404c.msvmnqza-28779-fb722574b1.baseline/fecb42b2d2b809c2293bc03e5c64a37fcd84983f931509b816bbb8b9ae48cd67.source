import { describe, expect, it } from "vitest";
import type { Model } from "../src/data/models";
import { runOfflineAtlas } from "../src/lib/atlas-agent/offline-router";
import { validateProposal, type AtlasAgentContext } from "../src/lib/atlas-agent/types";
import { toolListEligible, toolRankEligible, toolProposeFloor } from "../src/lib/atlas-agent/tools";
import { DEFAULT_FILTERS } from "../src/lib/filters";

function m(
  name: string,
  iq: number | null,
  tps: number | null,
  price: number | null,
): Model {
  return {
    model: name,
    provider: "Test",
    openness: "closed",
    modality: ["text"],
    context_length: 128000,
    release_date: "2026-06-01",
    source_url: "https://example.test",
    tps,
    ttft: 100,
    price_in_per_M: price,
    price_out_per_M: price,
    blended_price_per_M: price,
    aa_intelligence_index: iq,
    arena_elo: null,
    gpqa: null,
    swe_bench: null,
    aider_pct: null,
    data_date: "2026-08-01",
    source: "test",
    reasoning: true,
  };
}

const catalog = [
  m("Fast Cheap", 55, 200, 1),
  m("Slow Smart", 62, 40, 10),
  m("Mid", 48, 100, 3),
  m("No Index", null, 90, 2),
  m("Below Floor", 30, 150, 0.5),
];

function ctx(floor = 50): AtlasAgentContext {
  return {
    catalog,
    visible: catalog,
    floor,
    costSpeedBias: 0,
    catalogSnapshotId: "cat_test",
    filters: { ...DEFAULT_FILTERS },
  };
}

describe("atlas tools", () => {
  it("lists eligible only when Index≥floor and cost+speed present", () => {
    const { result } = toolListEligible(ctx(50), 50);
    const ids = result.eligible.map((e) => e.id).sort();
    expect(ids).toEqual(["Fast Cheap", "Slow Smart"]);
  });

  it("ranks cheapest among eligible", () => {
    const { result } = toolRankEligible(ctx(50), 50, "min_cost", 3);
    expect(result.shortlist[0]?.id).toBe("Fast Cheap");
  });

  it("proposes floor from anchor model Index", () => {
    const { result, trace } = toolProposeFloor(ctx(), { anchor: "Slow Smart" });
    expect(trace.ok).toBe(true);
    expect(result?.floor).toBe(62);
    expect(result?.anchor_id).toBe("Slow Smart");
  });
});

describe("offline atlas agent", () => {
  it("floor 50 returns confirmable proposal with shortlist", () => {
    const p = runOfflineAtlas("floor 50", ctx(40));
    expect(validateProposal(p)).toBe(true);
    expect(p.floor).toBe(50);
    expect(p.decide_mode).toBe(true);
    expect(p.needs_confirm).toBe(true);
    expect(p.shortlist_ids?.length).toBeGreaterThan(0);
    expect(p.tool_trace.some((t) => t.name === "propose_floor" && t.ok)).toBe(true);
  });

  it("cheapest eligible uses min_cost ranking", () => {
    const p = runOfflineAtlas("cheapest eligible", ctx(50));
    expect(p.shortlist_ids?.[0]).toBe("Fast Cheap");
    expect(p.summary.toLowerCase()).toMatch(/cheap|fast cheap/);
  });

  it("why is Below Floor out explains Index vs floor", () => {
    const p = runOfflineAtlas("why is Below Floor out", ctx(50));
    expect(p.summary).toMatch(/below floor|30/i);
    expect(p.needs_confirm).toBe(false);
  });

  it("never invents metrics for No Index", () => {
    const p = runOfflineAtlas("why is No Index out", ctx(50));
    expect(p.summary.toLowerCase()).toMatch(/unmeasured/);
    expect(p.summary).not.toMatch(/\b\d{2,3}\.\d\b/); // no fabricated float index
  });
});
