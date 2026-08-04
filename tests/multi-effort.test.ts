import { describe, expect, it } from "vitest";
import { models, isScorable } from "../src/data/models";
import { deriveEffortTier, familyIdOf, groupByFamily } from "../src/lib/family";

describe("multi-effort catalog (AA expansion)", () => {
  it("has many scorable rows and multi-effort families for curves", () => {
    const scorable = models.filter(isScorable);
    expect(scorable.length).toBeGreaterThan(100);
    const byFamily = groupByFamily(scorable);
    const multi = [...byFamily.entries()].filter(([, rows]) => rows.length >= 2);
    expect(multi.length).toBeGreaterThanOrEqual(20);
  });

  it("includes full GPT-5.6 Sol and Claude Opus 5 intensity ladders", () => {
    const sol = models.filter((m) => familyIdOf(m) === "GPT-5.6 Sol" && isScorable(m));
    const opus = models.filter((m) => familyIdOf(m) === "Claude Opus 5" && isScorable(m));
    const solTiers = new Set(sol.map((m) => deriveEffortTier(m)));
    const opusTiers = new Set(opus.map((m) => deriveEffortTier(m)));
    expect(sol.length).toBeGreaterThanOrEqual(5);
    expect(opus.length).toBeGreaterThanOrEqual(4);
    expect(solTiers.has("max")).toBe(true);
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
