import { describe, expect, it } from "vitest";
import {
  applyArenaElo,
  buildOpenRouterIndex,
  candidatesForArena,
  matchOpenRouterModel,
} from "../scripts/lib/catalog-join.mjs";
import { parseArenaIdentity } from "../src/lib/family-effort.shared";

/**
 * W6 coverage lifts (ticket #192, plan data-stewardship-v2):
 *  - PROVIDER_TO_ORG growth: every added provider must match its OpenRouter
 *    org via a full `org/model` id (fixtures use ids that exist in
 *    data/openrouter-snapshot.json, 2026-08-14; a decoy org owning the same
 *    bare slug proves the ORG prefix is what matched, not the bare fallback);
 *  - Arena name-bridge: digit-dot ↔ digit-dash slug equivalence + exact-slug
 *    tie-break attach previously-failing pairs;
 *  - genuinely unfixable pairs still produce failure codes.
 */

function aaRow(partial: Record<string, unknown>) {
  return {
    model: "Test",
    provider: "Anthropic",
    openness: "closed",
    modality: ["text"],
    context_length: 200000,
    release_date: "2026-06-01",
    data_date: "2026-08-14",
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

// AA provider (as AA spells it) → fixture AA slug + OpenRouter id present in
// data/openrouter-snapshot.json (verified 2026-08-14). stepfun / xiaomi are
// the snapshot's actual org slugs (the planned "stepfun-ai" / "xiaomimi"
// do not exist there).
const ORG_FIXTURES = [
  { provider: "ByteDance Seed", slug: "seed-2-1-turbo", orId: "bytedance-seed/seed-2-1-turbo" },
  { provider: "Reka AI", slug: "reka-flash-3", orId: "rekaai/reka-flash-3" },
  { provider: "Amazon", slug: "nova-lite-v1", orId: "amazon/nova-lite-v1" },
  { provider: "Microsoft", slug: "phi-4", orId: "microsoft/phi-4" },
  { provider: "StepFun", slug: "step-3-5-flash", orId: "stepfun/step-3.5-flash" },
  { provider: "Tencent", slug: "hy3-preview", orId: "tencent/hy3-preview" },
  { provider: "InclusionAI", slug: "ling-3-0-flash", orId: "inclusionai/ling-3.0-flash" },
  { provider: "Xiaomi", slug: "mimo-v2-5-pro", orId: "xiaomi/mimo-v2.5-pro" },
  { provider: "AI21 Labs", slug: "jamba-large-1-7", orId: "ai21/jamba-large-1.7" },
  { provider: "Cohere", slug: "command-r-08-2024", orId: "cohere/command-r-08-2024" },
  { provider: "IBM", slug: "granite-4-0-h-micro", orId: "ibm-granite/granite-4.0-h-micro" },
  { provider: "Upstage", slug: "solar-pro-3", orId: "upstage/solar-pro-3" },
] as const;

describe("W6 PROVIDER_TO_ORG growth (ticket #192)", () => {
  it.each(ORG_FIXTURES)(
    "$provider slug $slug matches via org prefix $orId",
    ({ provider, slug, orId }) => {
      // Decoy org owns the SAME bare slug → bare-slug fallback cannot fire
      // (collision); only the correct org-prefix full id can match.
      const bare = orId.split("/").pop() as string;
      const orModels = [
        { id: orId, pricing: { prompt: "0.000001", completion: "0.000002" } },
        { id: `decoy-org/${bare}`, pricing: { prompt: "1", completion: "2" } },
      ];
      const index = buildOpenRouterIndex(orModels);
      const row = aaRow({
        provider,
        source_url: `https://artificialanalysis.ai/models/${slug}`,
      });
      const match = matchOpenRouterModel(row, index);
      expect(match).not.toBeNull();
      expect(match?.matchedId).toBe(orId);
      // The matched entry is the real one, not the decoy.
      expect(match?.model?.pricing?.prompt).toBe("0.000001");
    },
  );

  it("no fuzzy fallback: org that does not list the AA slug never matches", () => {
    const orModels = [
      { id: "amazon/nova-pro-v1", pricing: { prompt: "0.000001", completion: "0.000002" } },
    ];
    const index = buildOpenRouterIndex(orModels);
    const row = aaRow({
      provider: "Amazon",
      source_url: "https://artificialanalysis.ai/models/nova-lite", // not listed on OR
    });
    expect(matchOpenRouterModel(row, index)).toBeNull();
  });
});

describe("W6 Arena name-bridge (ticket #192)", () => {
  it("arena dot-style slug attaches to AA dash-style slug (gemini-3.1 ↔ gemini-3-1)", () => {
    const row = aaRow({
      model: "Gemini 3.1 Flash-Lite",
      provider: "Google",
      family_id: "Gemini 3.1 Flash-Lite",
      effort_tier: "none",
      source_url: "https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview",
    });
    const { rows, attaches, logs } = applyArenaElo([row], [
      {
        modelDisplayName: "gemini-3.1-flash-lite-preview",
        modelKey: "gemini-3.1-flash-lite-preview",
        modelOrganization: "Google",
        rating: 1432.07,
      },
    ]);
    expect(attaches).toBe(1);
    expect(rows[0].arena_elo).toBeCloseTo(1432.07);
    expect(rows[0].sources?.arena_elo).toEqual({ origin: "arena", kind: "measured" });
    expect(logs).toHaveLength(0);
  });

  it("arena dot-style coder slug attaches to AA dash-style slug (qwen2.5 ↔ qwen2-5)", () => {
    const row = aaRow({
      model: "Qwen2.5 Coder Instruct 32B",
      provider: "Alibaba",
      family_id: "Qwen2.5 Coder Instruct 32B",
      effort_tier: "none",
      source_url: "https://artificialanalysis.ai/models/qwen2-5-coder-32b-instruct",
    });
    const { rows, attaches } = applyArenaElo([row], [
      {
        modelDisplayName: "qwen2.5-coder-32b-instruct",
        modelKey: "qwen2.5-coder-32b-instruct",
        modelOrganization: "Alibaba",
        rating: 1270.49,
      },
    ]);
    expect(attaches).toBe(1);
    expect(rows[0].arena_elo).toBeCloseTo(1270.49);
  });

  it("tier-suffixed arena key bridges through base slug + numeric style (grok-4.5-high → grok-4-5)", () => {
    const high = aaRow({
      model: "Grok 4.5 (High)",
      provider: "SpaceXAI",
      family_id: "Grok 4.5",
      effort_tier: "high",
      source_url: "https://artificialanalysis.ai/models/grok-4-5",
    });
    const { rows, attaches } = applyArenaElo([high], [
      {
        modelDisplayName: "grok-4.5-high",
        modelKey: "grok-4.5-high",
        modelOrganization: "SpaceXAI",
        rating: 1488,
      },
    ]);
    expect(attaches).toBe(1);
    expect(rows[0].arena_elo).toBeCloseTo(1488);
  });

  it("exact-slug tie-break: label-colliding family attaches to the slug-identical row", () => {
    // Mirrors the production telemetry pair: AA publishes "Step 3.5 Flash"
    // (slug step-3-5-flash-0202) and "Step 3.5 Flash 2603" (slug
    // step-3-5-flash); arena key step-3.5-flash is the exact identity of the
    // latter — the familyNorm label only reaches the former.
    const dated = aaRow({
      model: "Step 3.5 Flash",
      provider: "StepFun",
      family_id: "Step 3.5 Flash",
      effort_tier: "none",
      source_url: "https://artificialanalysis.ai/models/step-3-5-flash-0202",
    });
    const exact = aaRow({
      model: "Step 3.5 Flash 2603",
      provider: "StepFun",
      family_id: "Step 3.5 Flash 2603",
      effort_tier: "none",
      source_url: "https://artificialanalysis.ai/models/step-3-5-flash",
    });
    const { rows, attaches } = applyArenaElo([dated, exact], [
      {
        modelDisplayName: "step-3.5-flash",
        modelKey: "step-3.5-flash",
        modelOrganization: "StepFun",
        rating: 1319,
      },
    ]);
    expect(attaches).toBe(1);
    const withElo = rows.filter((r) => r.arena_elo != null);
    expect(withElo).toHaveLength(1);
    expect(withElo[0].model).toBe("Step 3.5 Flash 2603");
    expect(withElo[0].arena_elo).toBeCloseTo(1319);
  });

  it("candidatesForArena gains the numeric-style pair but never version-crosses", () => {
    const aa = [
      aaRow({
        model: "Grok 4.3",
        provider: "SpaceXAI",
        family_id: "Grok 4.3",
        effort_tier: "none",
        source_url: "https://artificialanalysis.ai/models/grok-4-3",
      }),
      aaRow({
        model: "GPT-5.6 Sol",
        provider: "OpenAI",
        family_id: "GPT-5.6 Sol",
        effort_tier: "none",
        source_url: "https://artificialanalysis.ai/models/gpt-5-6-sol",
      }),
    ];
    const grok43 = parseArenaIdentity({
      modelDisplayName: "grok-4.3",
      modelKey: "grok-4.3",
      rating: 1441,
    });
    expect(candidatesForArena(aa, grok43)).toHaveLength(1);
    // Version numbers are NOT punctuation: 4.1 ≠ 4.3 stays unmatched.
    const grok41 = parseArenaIdentity({
      modelDisplayName: "grok-4.1",
      modelKey: "grok-4.1",
      rating: 1400,
    });
    expect(candidatesForArena(aa, grok41)).toHaveLength(0);
    // And the canon bridge never reintroduces prefix matching.
    const gpt5 = parseArenaIdentity({
      modelDisplayName: "gpt-5",
      modelKey: "gpt-5",
      rating: 1400,
    });
    expect(candidatesForArena(aa, gpt5)).toHaveLength(0);
  });

  it("genuinely ambiguous exact-slug pairs still log arena_ambiguous_family", () => {
    // Two scorable rows share the canon-equal slug (effort variants, no max
    // row): no mechanical identity proof → stays logged, no attach.
    const low = aaRow({
      model: "Acme Pro (Low)",
      provider: "Acme",
      family_id: "Acme Pro",
      effort_tier: "low",
      source_url: "https://artificialanalysis.ai/models/acme-pro",
    });
    const high = aaRow({
      model: "Acme Pro (High)",
      provider: "Acme",
      family_id: "Acme Pro",
      effort_tier: "high",
      source_url: "https://artificialanalysis.ai/models/acme-pro",
    });
    const { rows, attaches, logs } = applyArenaElo([low, high], [
      {
        modelDisplayName: "acme-pro",
        modelKey: "acme-pro",
        modelOrganization: "Acme",
        rating: 1350,
      },
    ]);
    expect(attaches).toBe(0);
    expect(rows.every((r) => r.arena_elo == null)).toBe(true);
    expect(logs).toEqual([{ code: "arena_ambiguous_family", key: "acme-pro" }]);
  });

  it("unlisted families still log arena_no_family (the AA-publish-limited ceiling)", () => {
    const aa = [
      aaRow({
        model: "Nova Lite",
        provider: "Amazon",
        family_id: "Nova Lite",
        effort_tier: "none",
        source_url: "https://artificialanalysis.ai/models/nova-lite",
      }),
    ];
    const { attaches, logs } = applyArenaElo(aa, [
      {
        // Arena runs an older/different generation AA never published.
        modelDisplayName: "alpaca-13b",
        modelKey: "alpaca-13b",
        modelOrganization: "Stanford",
        rating: 1050,
      },
      {
        modelDisplayName: "nova-2-lite",
        modelKey: "nova-2-lite",
        modelOrganization: "Amazon",
        rating: 1280,
      },
    ]);
    expect(attaches).toBe(0);
    expect(logs).toEqual([
      { code: "arena_no_family", key: "alpaca-13b", slug: "alpaca-13b" },
      { code: "arena_no_family", key: "nova-2-lite", slug: "nova-2-lite" },
    ]);
  });

  it("unfixable guard codes still produced (no rating / implausible rating)", () => {
    const row = aaRow({
      model: "Test Model",
      family_id: "Test Model",
      effort_tier: "max",
      source_url: "https://artificialanalysis.ai/models/test-model",
    });
    const { attaches, logs } = applyArenaElo([row], [
      {
        modelDisplayName: "test-model",
        modelKey: "test-model",
        modelOrganization: "Test",
        rating: null,
      },
      {
        modelDisplayName: "test-model",
        modelKey: "test-model",
        modelOrganization: "Test",
        rating: 9000, // D14 implausible
      },
    ]);
    expect(attaches).toBe(0);
    expect(logs.map((l) => l.code)).toEqual([
      "arena_no_rating",
      "arena_implausible_rating",
    ]);
  });
});
