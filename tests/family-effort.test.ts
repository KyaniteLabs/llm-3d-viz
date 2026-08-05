import { describe, expect, it } from "vitest";
import {
  deriveFamilyId,
  deriveEffortTierFromName,
  normalizeProvider,
  normalizeFamily,
  lastSlugSegment,
  parseArenaIdentity,
  aaSlugFromSourceUrl,
} from "../src/lib/family-effort.shared";

describe("family-effort.shared", () => {
  it("deriveFamilyId strips effort parentheticals and fallback", () => {
    expect(
      deriveFamilyId(
        "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
      ),
    ).toMatch(/Claude Fable 5/i);
    expect(deriveFamilyId("Claude Opus 5 (Adaptive Reasoning, Medium Effort)")).toBe(
      "Claude Opus 5",
    );
  });

  it("normalizeFamily equates human family and Arena slug form", () => {
    expect(normalizeFamily("Claude Fable 5")).toBe("claude-fable-5");
    expect(normalizeFamily("claude-fable-5")).toBe("claude-fable-5");
    expect(normalizeFamily("Claude Opus 5 (High)")).toBe("claude-opus-5");
  });

  it("normalizeProvider aliases", () => {
    expect(normalizeProvider("Anthropic")).toBe("anthropic");
    expect(normalizeProvider("OpenAI Inc.")).toBe("openai");
    expect(normalizeProvider("Z AI")).toBe("zai");
    expect(normalizeProvider("Moonshot")).toBe("kimi");
  });

  it("deriveEffortTierFromName reads parenthetical and bare tiers", () => {
    expect(deriveEffortTierFromName("Claude Opus 5 (Medium Effort)")).toBe("medium");
    expect(deriveEffortTierFromName("gpt-5.6-sol-xhigh")).toBe("xhigh");
    expect(deriveEffortTierFromName("Some Model", true)).toBe("default");
  });

  it("lastSlugSegment strips Arena channel suffixes", () => {
    expect(lastSlugSegment("claude-fable-5-text")).toBe("claude-fable-5");
    expect(lastSlugSegment("claude-opus-5-high-vertex")).toBe("claude-opus-5-high");
    expect(aaSlugFromSourceUrl("https://artificialanalysis.ai/models/claude-fable-5")).toBe(
      "claude-fable-5",
    );
  });

  it("parseArenaIdentity marks bare Fable as unspecified effort", () => {
    const id = parseArenaIdentity({
      modelDisplayName: "claude-fable-5",
      modelKey: "claude-fable-5-text",
      modelOrganization: "Anthropic",
      rating: 1508.5,
    });
    expect(id.slug).toBe("claude-fable-5");
    expect(id.familyNorm).toBe("claude-fable-5");
    expect(id.effort_tier).toBe("unspecified");
    expect(id.rating).toBeCloseTo(1508.5);
  });

  it("parseArenaIdentity reads high from display/key", () => {
    const id = parseArenaIdentity({
      modelDisplayName: "claude-opus-5-high",
      modelKey: "claude-opus-5-high",
      modelOrganization: "Anthropic",
      rating: 1491,
    });
    expect(id.effort_tier).toBe("high");
  });
});
