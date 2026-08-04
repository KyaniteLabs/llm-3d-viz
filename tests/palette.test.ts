import { describe, expect, it } from "vitest";
import {
  dominatedFill,
  semanticPointFill,
  aaPointFill,
  OPENNESS_FILL,
  lighten,
  contrastRatio,
  relativeLuminance,
  parseChannels,
  SLATE_CYAN_FALLBACK,
  pointEncoding,
  isSingleton,
  familySeriesColor,
  SINGLETON_OPACITY,
  SINGLETON_SIZE_SCALE,
  legendEntries,
} from "../src/viz/palette";
import { familyIdOf } from "../src/lib/family";
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

describe("AA openness fill (heat off default)", () => {
  it("uses distinct open vs closed fills for dominated points", () => {
    const open = aaPointFill("open", "dominated", 0.5, false);
    const closed = aaPointFill("closed", "dominated", 0.5, false);
    expect(open).toBe(OPENNESS_FILL.open);
    expect(closed).toBe(OPENNESS_FILL.closed);
    expect(open).not.toBe(closed);
  });
});


describe("curve-focus pointEncoding (product default)", () => {
  const visible = [
    { model: "A (low)", family_id: "A", openness: "open" as const },
    { model: "A (high)", family_id: "A", openness: "open" as const },
    { model: "B solo", family_id: "B", openness: "closed" as const },
  ];

  it("colors multi-effort dominated points with family series fill, not openness blue", () => {
    const enc = pointEncoding({
      openness: "open",
      semanticClass: "dominated",
      score: 0.4,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "A",
      singleton: false,
      provider: "OpenAI",
    });
    expect(enc.fill).not.toBe(OPENNESS_FILL.open);
    expect(enc.fill).toBe(familySeriesColor("A", "OpenAI"));
    expect(enc.opacity).toBe(1);
    expect(enc.trailColor).toBe(enc.seriesColor);
  });

  it("dims singletons visually without changing openness mode semantics", () => {
    const enc = pointEncoding({
      openness: "closed",
      semanticClass: "dominated",
      score: 0.2,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "B",
      singleton: true,
    });
    expect(enc.opacity).toBe(SINGLETON_OPACITY);
    expect(enc.sizeScale).toBe(SINGLETON_SIZE_SCALE);
  });

  it("isSingleton uses post-filter visible set family counts", () => {
    expect(isSingleton(visible[0], visible, (m) => m.family_id!)).toBe(false);
    expect(isSingleton(visible[2], visible, (m) => m.family_id!)).toBe(true);
  });

  it("openness mode restores aaPointFill for dominated", () => {
    const enc = pointEncoding({
      openness: "open",
      semanticClass: "dominated",
      score: 0.5,
      heatEncoding: false,
      presentationMode: "openness",
      familyId: "A",
      singleton: false,
    });
    expect(enc.fill).toBe(OPENNESS_FILL.open);
  });

  it("legend entries 1:1 for curve vs openness", () => {
    const curve = legendEntries("curve", false).map((e) => e.id);
    expect(curve).toContain("family-trail");
    expect(curve).toContain("singleton-dim");
    expect(curve).not.toContain("open-point");
    const open = legendEntries("openness", false).map((e) => e.id);
    expect(open).toContain("open-point");
    expect(open).toContain("closed-point");
  });
});
