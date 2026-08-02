import { describe, expect, it } from "vitest";
import {
  dominatedFill,
  semanticPointFill,
  lighten,
  contrastRatio,
  relativeLuminance,
  parseChannels,
  SLATE_CYAN_FALLBACK,
} from "../src/viz/palette";
import { models } from "../src/data/models";
import { frontier } from "../src/lib/pareto";
import { normalizedScores, weightedOptimum, type ScoreWeights } from "../src/lib/score";

// The stage / projection / ink-field anchors (DESIGN-SYSTEM token block).
const INK_FIELD = "#070C0B";
const FILAMENT_DIM = "#C9D4C4"; // frontier-point luminance
const FILAMENT = "#E8F1E4"; // optimum hot core

const WEIGHT_SETS: ScoreWeights[] = [
  { speed: 1, cost: 1, intelligence: 1 },
  { speed: 0.25, cost: 0.15, intelligence: 0.6 },
  { speed: 0.35, cost: 0.3, intelligence: 0.35 },
  { speed: 0.15, cost: 0.25, intelligence: 0.6 },
  { speed: 0.2, cost: 0.55, intelligence: 0.25 },
  { speed: 0.9, cost: 0.05, intelligence: 0.05 },
  { speed: 0.05, cost: 0.9, intelligence: 0.05 },
  { speed: 0.05, cost: 0.05, intelligence: 0.9 },
];

describe("dominated fill — gate: dominated-point visibility (FIX-C #28)", () => {
  it("is the slate-cyan token lightened toward white (same hue, raised luminance)", () => {
    expect(dominatedFill(SLATE_CYAN_FALLBACK)).toBe("#687a83");
    expect(relativeLuminance(dominatedFill(SLATE_CYAN_FALLBACK))).toBeGreaterThan(
      relativeLuminance(SLATE_CYAN_FALLBACK),
    );
  });

  it("meets the ≥3:1 visibility floor against the ink-field", () => {
    // Alpha alone could not reach this: pure slate-cyan caps at ~2.5:1, and the
    // old 50% fill was ~1.5:1 (near-invisible). Lightening is what clears 3:1.
    expect(contrastRatio(dominatedFill(SLATE_CYAN_FALLBACK), INK_FIELD)).toBeGreaterThanOrEqual(3);
  });

  it("stays clearly dimmer than the filament frontier — secondary, not competing", () => {
    const dominated = contrastRatio(dominatedFill(SLATE_CYAN_FALLBACK), INK_FIELD);
    const frontier = contrastRatio(FILAMENT_DIM, INK_FIELD);
    const optimum = contrastRatio(FILAMENT, INK_FIELD);
    expect(dominated).toBeLessThan(frontier);
    expect(frontier).toBeLessThan(optimum); // hierarchy: dominated < frontier < optimum
  });

  it("does not shift hue — the cool channel order (B ≥ G ≥ R) is preserved", () => {
    const slate = parseChannels(SLATE_CYAN_FALLBACK)!;
    const dom = parseChannels(dominatedFill(SLATE_CYAN_FALLBACK))!;
    expect(slate[2]).toBeGreaterThanOrEqual(slate[1]); // slate: B ≥ G
    expect(dom[2]).toBeGreaterThanOrEqual(dom[1]); // dominated: B ≥ G (still cool slate)
  });
});

describe("lighten / contrast helpers", () => {
  it("lighten leaves the source untouched at 0 and reaches white at 1", () => {
    expect(lighten("#3d5560", 0)).toBe("#3d5560");
    expect(lighten("#3d5560", 1)).toBe("#ffffff");
  });

  it("contrastRatio is 1 for identical colours and 21 for pure black/white", () => {
    expect(contrastRatio("#000000", "#000000")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});

describe("class-bounded heat ramp — review #27 P1a", () => {
  it("keeps dominated < frontier < optimum across multiple weight sets", () => {
    const frontierIds = new Set(frontier(models).map((model) => model.model));
    let dominatedOutscoresFrontier = false;

    for (const weights of WEIGHT_SETS) {
      const scores = normalizedScores(models, weights, models);
      const optimumId = weightedOptimum(scores)!.model.model;
      const dominated = scores.filter(({ model }) => !frontierIds.has(model.model));
      const frontierPoints = scores.filter(
        ({ model }) => frontierIds.has(model.model) && model.model !== optimumId,
      );
      const optimum = scores.find(({ model }) => model.model === optimumId)!;
      const dominatedLuminance = dominated.map(({ score }) =>
        relativeLuminance(semanticPointFill("dominated", score, true)),
      );
      const frontierLuminance = frontierPoints.map(({ score }) =>
        relativeLuminance(semanticPointFill("frontier", score, true)),
      );

      expect(Math.max(...dominatedLuminance)).toBeLessThan(Math.min(...frontierLuminance));
      expect(Math.max(...frontierLuminance)).toBeLessThan(
        relativeLuminance(semanticPointFill("optimum", optimum.score, true)),
      );
      dominatedOutscoresFrontier ||= dominated.some(({ score: dominatedScore }) =>
        frontierPoints.some(({ score: frontierScore }) => dominatedScore > frontierScore),
      );
    }

    expect(dominatedOutscoresFrontier).toBe(true);
  });

  it("keeps high-score dominated points in the slate family", () => {
    const highScore = semanticPointFill("dominated", 1, true);
    expect(relativeLuminance(highScore)).toBeLessThan(relativeLuminance(FILAMENT_DIM));
    expect(parseChannels(highScore)![2]).toBeGreaterThanOrEqual(parseChannels(highScore)![1]);
  });
});
