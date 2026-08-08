import { describe, expect, it } from "vitest";
import type { Model } from "../src/data/models";
import {
  describeConstraints,
  isCompositional,
  parseConstraints,
  toolQueryCatalog,
  unsupportedDataAxes,
} from "../src/lib/atlas-agent/query-catalog";
import { runOfflineAtlas } from "../src/lib/atlas-agent/offline-router";
import { validateProposal, type AtlasAgentContext } from "../src/lib/atlas-agent/types";
import { DEFAULT_FILTERS } from "../src/lib/filters";

type Overrides = Partial<
  Pick<
    Model,
    | "openness"
    | "modality"
    | "provider"
    | "swe_bench"
    | "gpqa"
    | "context_length"
    | "reasoning"
  >
>;

function m(
  name: string,
  iq: number | null,
  tps: number | null,
  price: number | null,
  over: Overrides = {},
): Model {
  return {
    model: name,
    provider: over.provider ?? "Test",
    openness: over.openness ?? "closed",
    modality: over.modality ?? ["text"],
    context_length: over.context_length ?? 128000,
    release_date: "2026-06-01",
    source_url: "https://example.test",
    tps,
    ttft: 100,
    price_in_per_M: price,
    price_out_per_M: price,
    blended_price_per_M: price,
    aa_intelligence_index: iq,
    arena_elo: null,
    gpqa: over.gpqa ?? null,
    swe_bench: over.swe_bench ?? null,
    aider_pct: null,
    data_date: "2026-08-01",
    source: "test",
    reasoning: over.reasoning ?? true,
  };
}

const catalog: Model[] = [
  m("Open Coder", 60, 80, 4, { openness: "open", modality: ["text", "vision"], swe_bench: 72, gpqa: 55 }),
  m("Closed Speed", 55, 200, 8, { openness: "closed", provider: "Anthropic" }),
  m("Cheap Dumb", 40, 50, 0.5, { openness: "open" }),
  m("Dominated", 30, 30, 9, { openness: "closed" }),
  m("Brainy Local", 66, 40, 6, { openness: "open", reasoning: true }),
  m("No Index", null, 90, 2, { openness: "open" }),
];

function ctx(floor = 50): AtlasAgentContext {
  return {
    catalog,
    visible: catalog,
    floor,
    costSpeedBias: 0,
    catalogSnapshotId: "cat_query",
    filters: { ...DEFAULT_FILTERS },
  };
}

describe("toolQueryCatalog", () => {
  it("ranks by min_cost ascending", () => {
    const { result } = toolQueryCatalog(ctx(), { objective: "min_cost" });
    expect(result.length).toBeGreaterThan(0);
    const prices = result.map((r) => r.price);
    expect(prices).toEqual([...prices].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("ranks by max_speed descending", () => {
    const { result } = toolQueryCatalog(ctx(), { objective: "max_speed" });
    const tps = result.map((r) => r.tps);
    expect(tps).toEqual([...tps].sort((a, b) => (b ?? 0) - (a ?? 0)));
  });

  it("honors the intelligence floor", () => {
    const { result } = toolQueryCatalog(ctx(), { floor: 55 });
    expect(result.every((r) => (r.index ?? -1) >= 55)).toBe(true);
    expect(result.some((r) => r.id === "Cheap Dumb")).toBe(false);
  });

  it("filters by openness", () => {
    const { result } = toolQueryCatalog(ctx(), { openness: "open" });
    expect(result.every((r) => r.openness === "open")).toBe(true);
    expect(result.some((r) => r.id === "Closed Speed")).toBe(false);
  });

  it("filters by modality (vision)", () => {
    const { result } = toolQueryCatalog(ctx(), { modality: "vision" });
    expect(result.every((r) => (r.modalities ?? []).includes("vision"))).toBe(true);
    expect(result.map((r) => r.id)).toContain("Open Coder");
  });

  it("filters by price ceiling", () => {
    const { result } = toolQueryCatalog(ctx(), { maxPrice: 5 });
    expect(result.every((r) => (r.price ?? Infinity) <= 5)).toBe(true);
  });

  it("filters by SWE-bench (coding)", () => {
    const { result } = toolQueryCatalog(ctx(), { minSweBench: 60 });
    expect(result.map((r) => r.id)).toContain("Open Coder");
    expect(result.length).toBe(1);
  });

  it("provider include / exclude", () => {
    expect(toolQueryCatalog(ctx(), { provider: "anthropic" }).result.map((r) => r.id)).toEqual([
      "Closed Speed",
    ]);
    const excl = toolQueryCatalog(ctx(), { excludeProvider: "anthropic" }).result;
    expect(excl.every((r) => r.id !== "Closed Speed")).toBe(true);
  });

  it("frontierOnly excludes dominated models", () => {
    const { result } = toolQueryCatalog(ctx(), { frontierOnly: true });
    expect(result.some((r) => r.id === "Dominated")).toBe(false);
    // Non-dominated models survive.
    expect(result.length).toBeGreaterThan(0);
  });

  it("composes multiple constraints", () => {
    const { result } = toolQueryCatalog(ctx(), {
      objective: "min_cost",
      openness: "open",
      floor: 50,
      modality: "vision",
    });
    expect(result.every((r) => r.openness === "open")).toBe(true);
    expect(result.every((r) => (r.index ?? -1) >= 50)).toBe(true);
    expect(result.every((r) => (r.modalities ?? []).includes("vision"))).toBe(true);
  });

  it("returns empty when nothing matches", () => {
    const { result, trace } = toolQueryCatalog(ctx(), { maxPrice: 0.1, floor: 80 });
    expect(result).toEqual([]);
    expect(trace.ok).toBe(true);
  });
});

describe("parseConstraints", () => {
  const cases: Array<[string, (c: ReturnType<typeof parseConstraints>["constraints"]) => boolean]> = [
    ["cheapest open model above floor 50", (c) => c.objective === "min_cost" && c.openness === "open" && c.floor === 50],
    ["fastest model with vision", (c) => c.objective === "max_speed" && c.modality === "vision"],
    ["smartest model", (c) => c.objective === "max_intelligence"],
    ["under $5 per million", (c) => c.maxPrice === 5],
    ["models with 128k context", (c) => c.minContext === 128000],
    ["good at coding", (c) => c.minSweBench === 40],
    ["from anthropic", (c) => c.provider === "anthropic"],
    ["not openai", (c) => c.excludeProvider === "openai"],
    ["on the frontier", (c) => c.frontierOnly === true],
    ["reasoning models", (c) => c.reasoning === true],
  ];
  for (const [utterance, check] of cases) {
    it(`parses "${utterance}"`, () => {
      const { constraints } = parseConstraints(utterance, ctx());
      expect(check(constraints)).toBe(true);
    });
  }

  it("resolves 'smarter than <model>' to that model's Index", () => {
    const { constraints } = parseConstraints("cheapest smarter than Closed Speed", ctx());
    expect(constraints.floor).toBe(55); // Closed Speed iq=55
    expect(constraints.objective).toBe("min_cost");
  });

  it("counts signals across axes", () => {
    const { signals } = parseConstraints("cheapest open model above floor 50 with vision", ctx());
    expect(signals).toBeGreaterThanOrEqual(4);
  });
  it("parses bare 'open' and coding together", () => {
    const { constraints } = parseConstraints("good at coding and open", ctx());
    expect(constraints.openness).toBe("open");
    expect(constraints.minSweBench).toBe(40);
  });
  it("does not treat 'openai' as open weights", () => {
    const { constraints } = parseConstraints("cheapest from openai", ctx());
    expect(constraints.openness).toBeUndefined();
  });
});

describe("isCompositional", () => {
  it("is false for a plain single-objective shorthand", () => {
    expect(isCompositional(parseConstraints("cheapest", ctx()))).toBe(false);
  });
  it("is true for a single new-axis query", () => {
    expect(isCompositional(parseConstraints("vision models", ctx()))).toBe(true);
  });
  it("is true for a multi-axis query", () => {
    expect(isCompositional(parseConstraints("cheapest open above 50", ctx()))).toBe(true);
  });
});

describe("runOfflineAtlas — compositional queries", () => {
  it("answers a multi-axis question with a valid shortlist proposal", () => {
    const p = runOfflineAtlas("cheapest open model above floor 50 with vision", ctx());
    expect(validateProposal(p)).toBe(true);
    expect(p.shortlist_ids?.length).toBeGreaterThan(0);
    expect(p.decide_mode).toBe(true);
    expect(p.cost_speed_bias).toBe(-1);
    expect(p.summary.toLowerCase()).toContain("open");
  });

  it("answers a pure filter query without forcing Decide", () => {
    const p = runOfflineAtlas("show vision models", ctx(0));
    expect(validateProposal(p)).toBe(true);
    expect(p.highlight_model_ids?.length).toBeGreaterThan(0);
    expect(p.decide_mode).not.toBe(true);
  });

  it("falls back gracefully when no model matches", () => {
    const p = runOfflineAtlas("cheapest open above floor 99", ctx());
    expect(validateProposal(p)).toBe(true);
    expect(p.refuse_reason).toBeTruthy();
  });

  it("preserves the legacy single-intent path (floor 50 still works)", () => {
    const p = runOfflineAtlas("floor 50", ctx());
    expect(validateProposal(p)).toBe(true);
    expect(p.floor).toBe(50);
  });

  it("preserves the legacy cheapest-eligible path", () => {
    const p = runOfflineAtlas("cheapest eligible", ctx());
    expect(validateProposal(p)).toBe(true);
    expect(p.shortlist_ids?.length).toBeGreaterThan(0);
  });
});

describe("describeConstraints", () => {
  it("renders a readable label", () => {
    const label = describeConstraints({ objective: "min_cost", openness: "open", floor: 50 });
    expect(label).toContain("cheapest");
    expect(label).toContain("open");
    expect(label).toContain("50");
  });
});

// Catalog with NO vision / SWE-bench / GPQA data — exercises data-gap handling.
const plainCatalog: Model[] = [
  m("Plain Open Cheap", 60, 80, 1, { openness: "open" }),
  m("Plain Closed Fast", 55, 200, 9, { openness: "closed", provider: "Anthropic" }),
  m("Plain Smart", 70, 40, 5, { openness: "open" }),
];
function plainCtx(floor = 50): AtlasAgentContext {
  return {
    catalog: plainCatalog,
    visible: plainCatalog,
    floor,
    costSpeedBias: 0,
    catalogSnapshotId: "plain",
    filters: { ...DEFAULT_FILTERS },
  };
}

describe("data-gap handling", () => {
  it("detects axes the catalog has no data for", () => {
    expect(unsupportedDataAxes(plainCtx(), { modality: "vision" })).toContain("vision modality");
    expect(unsupportedDataAxes(plainCtx(), { minSweBench: 40 })).toContain("SWE-bench (coding)");
    // The rich fixture HAS vision + swe data → no gap reported.
    expect(unsupportedDataAxes(ctx(), { modality: "vision", minSweBench: 40 })).toEqual([]);
  });

  it("de-scopes an unsupported axis and still returns real results", () => {
    const p = runOfflineAtlas("cheapest open above floor 50 with vision", plainCtx());
    expect(validateProposal(p)).toBe(true);
    expect(p.shortlist_ids?.length).toBeGreaterThan(0);
    expect(p.summary.toLowerCase()).toContain("ignored");
    expect(p.summary).toContain("Plain Open Cheap");
  });

  it("honestly refuses when the ONLY constraint is an unsupported axis", () => {
    const p = runOfflineAtlas("show vision models", plainCtx());
    expect(validateProposal(p)).toBe(true);
    expect(p.refuse_reason).toBe("unsupported data");
    expect(p.summary.toLowerCase()).toContain("don't track");
  });
});
