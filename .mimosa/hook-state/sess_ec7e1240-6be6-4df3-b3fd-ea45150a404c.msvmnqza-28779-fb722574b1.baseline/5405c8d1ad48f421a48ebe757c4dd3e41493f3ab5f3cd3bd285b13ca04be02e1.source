import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const ladders = JSON.parse(
  readFileSync(path.join(root, "../data/expected-effort-ladders.json"), "utf8"),
);
const draft = JSON.parse(
  readFileSync(path.join(root, "../data/models.v0.draft.json"), "utf8"),
) as Array<{ family_id?: string; provider: string; effort_tier?: string }>;

/** The ten pre-refresh entries (WS6 regression lock — must stay byte-intact). */
const PRE_EXISTING: Record<string, string[]> = {
  "Claude Fable 5": ["low", "medium", "high", "xhigh", "max"],
  "Claude Opus 5": ["low", "medium", "high", "xhigh", "max"],
  "Claude Sonnet 5": ["low", "medium", "high", "xhigh", "max", "none"],
  "GPT-5.6 Sol": ["low", "medium", "high", "xhigh"],
  "GPT-5.6 Luna": ["low", "medium", "high", "xhigh"],
  "GPT-5.6 Terra": ["low", "medium", "high", "xhigh"],
  "Gemini 3.5 Flash": ["minimal", "medium", "high"],
  "DeepSeek V4 Pro": ["none", "high", "max"],
  "Kimi K3": ["low", "max"],
  "GLM-5.3": ["low", "high", "max"],
};

function observedTiersByFamily(): Map<string, { provider: string; tiers: Set<string> }> {
  const byFamily = new Map<string, { provider: string; tiers: Set<string> }>();
  for (const row of draft) {
    const family = row.family_id || "";
    if (!family) continue;
    if (!byFamily.has(family)) byFamily.set(family, { provider: row.provider, tiers: new Set() });
    byFamily.get(family)!.tiers.add(String(row.effort_tier || "none"));
  }
  return byFamily;
}

describe("expected-effort-ladders refresh (WS6)", () => {
  const observed = observedTiersByFamily();

  it("keeps the pre-existing entries intact (tiers unchanged)", () => {
    for (const [family, tiers] of Object.entries(PRE_EXISTING)) {
      expect(ladders.ladders[family], `ladder entry "${family}" must exist`).toBeTruthy();
      expect(ladders.ladders[family].expected_tiers).toEqual(tiers);
    }
  });

  it("adds only families the draft actually shows as multi-effort (>= 2 distinct tiers)", () => {
    const newEntries = Object.keys(ladders.ladders).filter((f) => !(f in PRE_EXISTING));
    expect(newEntries.length).toBeGreaterThan(0);
    for (const family of newEntries) {
      const obs = observed.get(family);
      expect(obs, `new ladder family "${family}" must exist in the draft`).toBeTruthy();
      expect(obs!.tiers.size).toBeGreaterThanOrEqual(2);
    }
  });

  it("invents no tiers: every new entry's expected_tiers equals the draft-observed set", () => {
    const newEntries = Object.keys(ladders.ladders).filter((f) => !(f in PRE_EXISTING));
    for (const family of newEntries) {
      const expected: string[] = ladders.ladders[family].expected_tiers;
      const observedTiers = observed.get(family)!.tiers;
      // Observed-only: every expected tier is published by the draft, and no
      // published tier was silently dropped (would hide a real gap).
      for (const t of expected) expect(observedTiers.has(t), `${family}: tier "${t}" not in draft`).toBe(true);
      for (const t of observedTiers) expect(expected, `${family}: draft tier "${t}" missing from ladder`).toContain(t);
      expect(ladders.ladders[family].notes).toMatch(/observed from draft 2026-08-14, curated/);
      expect(ladders.ladders[family].provider).toBe(observed.get(family)!.provider);
    }
  });

  it("covers every multi-effort draft family (no untracked ladders remain)", () => {
    const untracked = [...observed.entries()].filter(
      ([family, meta]) => meta.tiers.size >= 2 && !(family in ladders.ladders),
    );
    expect(untracked.map(([f]) => f)).toEqual([]);
  });
});
