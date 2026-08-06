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
  labColor,
  scoreSizeScale,
  SINGLETON_OPACITY,
  SINGLETON_SIZE_SCALE,
  SINGLETON_FILL,
  legendEntries,
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
      provider: "OpenAI",
    });
    expect(enc.opacity).toBe(SINGLETON_OPACITY);
    // Singleton size = value-score scale × singleton dim factor.
    expect(enc.sizeScale).toBeCloseTo(scoreSizeScale(0.2) * SINGLETON_SIZE_SCALE, 5);
    // Lab-tinted singleton fill (not pure slate) so lab is still glanceable.
    expect(enc.fill.toLowerCase()).not.toBe(SINGLETON_FILL.toLowerCase());
  });

  it("maps value-score into continuous size (bigger = better for weights)", () => {
    expect(scoreSizeScale(0)).toBeCloseTo(0.48, 2);
    expect(scoreSizeScale(1)).toBeCloseTo(1.42, 2);
    expect(scoreSizeScale(0.25)).toBeLessThan(scoreSizeScale(0.81));
    const low = pointEncoding({
      openness: "open",
      semanticClass: "dominated",
      score: 0.1,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "A",
      singleton: false,
      provider: "OpenAI",
    });
    const high = pointEncoding({
      openness: "open",
      semanticClass: "dominated",
      score: 0.9,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "A",
      singleton: false,
      provider: "OpenAI",
    });
    expect(high.sizeScale).toBeGreaterThan(low.sizeScale);
    expect(legendEntries("curve", false).map((e) => e.id)).toContain("size-score");
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

describe("curve-focus family continuity", () => {
  it("uses family series fill for multi-effort frontier (not filament override)", () => {
    const series = familySeriesColor("GPT-5.6 Sol", "OpenAI");
    const enc = pointEncoding({
      openness: "closed",
      semanticClass: "frontier",
      score: 0.8,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "GPT-5.6 Sol",
      singleton: false,
      provider: "OpenAI",
    });
    expect(enc.fill).toBe(series);
    expect(enc.fill).not.toBe("#C9D4C4");
  });

  it("gives distinct series colors to different OpenAI multi-effort families", () => {
    const a = familySeriesColor("GPT-5.6 Sol", "OpenAI");
    const b = familySeriesColor("o3", "OpenAI");
    const c = familySeriesColor("Unknown OpenAI Family XYZ", "OpenAI");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });

  it("uses official brand primaries for labs", () => {
    expect(labColor("OpenAI").toLowerCase()).toBe("#10a37f");
    expect(labColor("Anthropic").toLowerCase()).toBe("#d97757");
    expect(labColor("Google").toLowerCase()).toBe("#4285f4");
    expect(labColor("DeepSeek").toLowerCase()).toBe("#4d6bfe");
    expect(labColor("Alibaba").toLowerCase()).toBe("#fa6400");
    expect(labColor("Mistral").toLowerCase()).toBe("#fa500f");
    expect(labColor("NVIDIA").toLowerCase()).toBe("#76b900");
    expect(labColor("Kimi").toLowerCase()).toBe("#1a88ff");
  });

  it("keeps OpenAI families in green lab hue and Anthropic in warm lab hue", () => {
    const openai = familySeriesColor("GPT-5.6 Sol", "OpenAI");
    const anthropic = familySeriesColor("Claude Opus 5", "Anthropic");
    const oLab = parseChannels(labColor("OpenAI"))!;
    const aLab = parseChannels(labColor("Anthropic"))!;
    const o = parseChannels(openai)!;
    const a = parseChannels(anthropic)!;
    // OpenAI brand is green-dominant (G high); Anthropic clay (R high relative).
    expect(oLab[1]).toBeGreaterThan(oLab[0]);
    expect(aLab[0]).toBeGreaterThan(aLab[2] * 0.9);
    // Family shades stay near lab (not swapped).
    expect(Math.abs(o[1] - oLab[1])).toBeLessThan(90);
    expect(Math.abs(a[0] - aLab[0])).toBeLessThan(90);
    expect(openai).not.toBe(anthropic);
  });

  it("dims singleton frontier marks without dropping optimum gold", () => {
    const solo = pointEncoding({
      openness: "closed",
      semanticClass: "frontier",
      score: 0.7,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "Lonely",
      singleton: true,
    });
    expect(solo.opacity).toBe(SINGLETON_OPACITY);
    const opt = pointEncoding({
      openness: "closed",
      semanticClass: "optimum",
      score: 1,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "Lonely",
      singleton: true,
    });
    expect(opt.fill.toLowerCase()).toMatch(/#f4d58a|#e8f1e4/);
    expect(opt.opacity).toBe(1);
  });
});
