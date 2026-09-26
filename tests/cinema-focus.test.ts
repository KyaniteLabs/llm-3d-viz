import { describe, expect, it } from "vitest";
import { CINEMA_FOCUS_K, computeCinemaFocusIds } from "../src/lib/cinema-focus";
import { models } from "../src/data/models";
import { frontier } from "../src/lib/pareto";

describe("computeCinemaFocusIds", () => {
  it("includes all frontier (may exceed K) and does not expand past max(K, mandatory)", () => {
    const weights = { speed: 1, cost: 1, intelligence: 1 };
    const set = computeCinemaFocusIds(models, weights, { k: CINEMA_FOCUS_K });
    const fCount = frontier(models).length;
    expect(set.size).toBeGreaterThan(0);
    expect(set.size).toBeLessThanOrEqual(Math.max(CINEMA_FOCUS_K, fCount + 1));
    for (const m of frontier(models)) {
      expect(set.has(m.model)).toBe(true);
    }
  });

  it("always includes selected id", () => {
    const weights = { speed: 1, cost: 1, intelligence: 1 };
    const first = models.find(
      (m) => m.tps != null && m.blended_price_per_M != null && m.aa_intelligence_index != null,
    );
    if (!first) return;
    const set = computeCinemaFocusIds(models, weights, { selectedId: first.model, k: 5 });
    expect(set.has(first.model)).toBe(true);
  });
});
