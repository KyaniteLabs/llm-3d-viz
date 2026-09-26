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
  labSecondary,
  labBrand,
  LAB_BRANDS,
  resolveLabKey,
  scoreSizeScale,
  SINGLETON_OPACITY,
  SINGLETON_SIZE_SCALE,
  SINGLETON_FILL,
  legendEntries,
  brandLayerFlags,
  TRAIL_IDLE_OPACITY,
  TRAIL_SOLO_OPACITY,
  MID_EFFORT_SIZE_SCALE,
  DOMINATED_CHROMA_PULL,
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

  it("colors multi-effort dominated points with lab hue (not openness blue), not pure slate mud", () => {
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
    const series = familySeriesColor("A", "OpenAI");
    expect(enc.fill).not.toBe(OPENNESS_FILL.open);
    // Beauty P0: dominated may desat slightly but still lab-tinted (not openness blue).
    expect(enc.fill).not.toBe(OPENNESS_FILL.closed);
    expect(enc.seriesColor).toBe(series);
    expect(enc.opacity).toBeLessThanOrEqual(1);
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
    expect(curve).toContain("size-score");
    expect(curve).toContain("glyph-closed");
    expect(curve).toContain("glyph-open");
    expect(curve).toContain("singleton-dim");
    expect(curve).not.toContain("glyph-standard");
    expect(curve).not.toContain("glyph-reasoning");
    expect(curve).not.toContain("open-point");
    const open = legendEntries("openness", false).map((e) => e.id);
    expect(open).toContain("open-point");
    expect(open).toContain("closed-point");
    expect(open).toContain("glyph-closed");
    expect(open).toContain("size-score");
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

  it("uses ≥3 researched brand colors per lab", () => {
    expect(labColor("OpenAI").toLowerCase()).toBe("#10a37f");
    expect(labSecondary("OpenAI").toLowerCase()).toBe("#202123");
    expect(labBrand("OpenAI").colors[2].toLowerCase()).toBe("#fafafa");
    expect(labColor("Anthropic").toLowerCase()).toBe("#d97757");
    expect(labSecondary("Anthropic").toLowerCase()).toBe("#6a9bcc");
    expect(labBrand("Anthropic").colors[2].toLowerCase()).toBe("#788c5d");
    expect(labColor("Google").toLowerCase()).toBe("#4285f4");
    expect(labSecondary("Google").toLowerCase()).toBe("#ea4335");
    expect(labBrand("Google").colors[2].toLowerCase()).toBe("#fbbc05");
    expect(labBrand("Google").colors[3].toLowerCase()).toBe("#34a853");
    expect(labColor("DeepSeek").toLowerCase()).toBe("#6b4dff");
    // Orange family deliberately separated (Amazon / Alibaba / Mistral / Xiaomi).
    expect(labColor("Alibaba").toLowerCase()).toBe("#ff6a00");
    expect(labColor("Mistral").toLowerCase()).toBe("#e11d48");
    expect(labSecondary("Mistral").toLowerCase()).toBe("#9f1239");
    expect(labColor("Amazon").toLowerCase()).toBe("#b45309");
    expect(labColor("Xiaomi").toLowerCase()).toBe("#ff6900");
    expect(labColor("NVIDIA").toLowerCase()).toBe("#84cc16");
    expect(labColor("Microsoft").toLowerCase()).toBe("#6366f1");
    expect(labBrand("Microsoft").colors).toHaveLength(4);
    expect(labColor("Kimi").toLowerCase()).toBe("#00c2e0");
    // Every kit has ≥3 distinct hexes.
    for (const [name, brand] of Object.entries(LAB_BRANDS)) {
      expect(brand.colors.length).toBeGreaterThanOrEqual(3);
      const lower = brand.colors.map((c) => c.toLowerCase());
      expect(new Set(lower).size).toBe(lower.length);
      for (const c of brand.colors) {
        expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      expect(labBrand(name).colors[0]).toBe(brand.colors[0]);
    }
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


describe("S+ brand layers + glanceable trails", () => {
  it("Beauty P0: ring/core focus-gated (not always-on confetti)", () => {
    expect(brandLayerFlags({}).showRing).toBe(false);
    expect(brandLayerFlags({}).showCore).toBe(false);
    expect(brandLayerFlags({ solo: false, selected: false, brandFull: false }).showRing).toBe(false);
    expect(brandLayerFlags({ solo: true }).showRing).toBe(true);
    expect(brandLayerFlags({ selected: true }).showCore).toBe(true);
    expect(brandLayerFlags({ brandFull: true }).showRing).toBe(true);
    expect(brandLayerFlags({ cinemaFocus: true }).showCore).toBe(true);
  });

  it("maps Qwen models under Alibaba provider to Qwen sky — not Alibaba orange", () => {
    expect(resolveLabKey("Alibaba", "Qwen3.5 122B A10B (Reasoning)")).toBe("Qwen");
    expect(labColor("Alibaba", "#89939E", "Qwen3 Coder Next").toLowerCase()).toBe("#38bdf8");
    expect(labColor("Alibaba").toLowerCase()).toBe("#ff6a00"); // bare Alibaba still corporate orange
    const enc = pointEncoding({
      openness: "open",
      semanticClass: "dominated",
      score: 0.5,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "Qwen3.5",
      singleton: false,
      provider: "Alibaba",
      modelId: "Qwen3.5 122B A10B (Reasoning)",
    });
    expect(enc.fill.toLowerCase()).not.toBe("#ff6a00");
    expect(enc.brandColors[0].toLowerCase()).toBe("#38bdf8");
    expect(enc.showRing).toBe(false); // Beauty P0: idle rings off
    expect(enc.accent.toLowerCase()).toBe("#0c4a6e");
    expect(enc.core.toLowerCase()).toBe("#e0f2fe");
  });

  it("pointEncoding: dominated keeps lab hue, quiet trail, no idle rings", () => {
    const enc = pointEncoding({
      openness: "closed",
      semanticClass: "dominated",
      score: 0.5,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "gpt-5.6-luna",
      singleton: false,
      provider: "OpenAI",
    });
    expect(enc.fill).toBeTruthy();
    expect(enc.showRing).toBe(false);
    expect(enc.showCore).toBe(false);
    expect(enc.trailOpacity).toBe(TRAIL_IDLE_OPACITY);
    expect(enc.trailOpacity).toBeLessThan(0.25);
    expect(enc.opacity).toBeLessThanOrEqual(0.9);
  });

  it("frontier keeps full-chroma series fill; optimum forces ring", () => {
    const frontier = pointEncoding({
      openness: "closed",
      semanticClass: "frontier",
      score: 0.8,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "gpt-5.6-sol",
      singleton: false,
      provider: "OpenAI",
    });
    const series = familySeriesColor("gpt-5.6-sol", "OpenAI");
    expect(frontier.fill).toBe(series);
    expect(frontier.showRing).toBe(false);
    const opt = pointEncoding({
      openness: "closed",
      semanticClass: "optimum",
      score: 1,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "gpt-5.6-sol",
      singleton: false,
      provider: "OpenAI",
    });
    expect(opt.showRing).toBe(true);
    expect(opt.showCore).toBe(true);
  });

  it("mid effort shrinks size only", () => {
    const base = pointEncoding({
      openness: "closed",
      semanticClass: "dominated",
      score: 0.5,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "f",
      singleton: false,
      provider: "OpenAI",
      effortRole: "endpoint",
    });
    const mid = pointEncoding({
      openness: "closed",
      semanticClass: "dominated",
      score: 0.5,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "f",
      singleton: false,
      provider: "OpenAI",
      effortRole: "mid",
    });
    expect(mid.sizeScale).toBeCloseTo(base.sizeScale * 0.7);
    expect(mid.fill).toBe(base.fill);
  });
});

describe("S+ W1 freeze goldens (no algorithm thrash)", () => {
  it("locks trail / mid / chroma constants to paint authority", () => {
    expect(TRAIL_IDLE_OPACITY).toBe(0.18);
    expect(TRAIL_SOLO_OPACITY).toBe(0.88);
    expect(MID_EFFORT_SIZE_SCALE).toBe(0.7);
    expect(DOMINATED_CHROMA_PULL).toBe(0.22);
    expect(TRAIL_IDLE_OPACITY).toBeLessThan(0.45);
  });

  it("brandLayerFlags matrix: off default; on for solo|selected|brandFull|cinemaFocus", () => {
    const off = brandLayerFlags({});
    expect(off).toEqual({ showRing: false, showCore: false });
    expect(brandLayerFlags({ solo: true })).toEqual({ showRing: true, showCore: true });
    expect(brandLayerFlags({ selected: true })).toEqual({ showRing: true, showCore: true });
    expect(brandLayerFlags({ brandFull: true })).toEqual({ showRing: true, showCore: true });
    expect(brandLayerFlags({ cinemaFocus: true })).toEqual({ showRing: true, showCore: true });
    expect(brandLayerFlags({ solo: false, selected: false, brandFull: false, cinemaFocus: false })).toEqual({
      showRing: false,
      showCore: false,
    });
  });

  it("mid-effort size multiplier is exactly MID_EFFORT_SIZE_SCALE", () => {
    const base = pointEncoding({
      openness: "closed",
      semanticClass: "dominated",
      score: 0.5,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "f",
      singleton: false,
      provider: "OpenAI",
      effortRole: "endpoint",
    });
    const mid = pointEncoding({
      openness: "closed",
      semanticClass: "dominated",
      score: 0.5,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "f",
      singleton: false,
      provider: "OpenAI",
      effortRole: "mid",
    });
    expect(mid.sizeScale).toBeCloseTo(base.sizeScale * MID_EFFORT_SIZE_SCALE, 5);
    expect(mid.fill).toBe(base.fill);
  });

  it("singleton policy A: size/opacity hierarchy keeps non-slate identity (lab-ish fill)", () => {
    // Policy A (W1 locked): keep SINGLETON_OPACITY/SIZE; fill must not collapse to pure SINGLETON_FILL slate.
    // If glance fails later, fail-set unlocks Policy B (opacity 1 + size-only, no slate mix).
    const series = familySeriesColor("gpt-5.6-luna", "OpenAI");
    const enc = pointEncoding({
      openness: "closed",
      semanticClass: "dominated",
      score: 0.5,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "LonelyFamily",
      singleton: true,
      provider: "OpenAI",
    });
    expect(SINGLETON_OPACITY).toBe(0.42);
    expect(SINGLETON_SIZE_SCALE).toBe(0.55);
    expect(enc.opacity).toBe(SINGLETON_OPACITY);
    expect(enc.fill.toLowerCase()).not.toBe(SINGLETON_FILL.toLowerCase());
    // Mixed toward series — must differ from pure slate mud
    expect(enc.fill.toLowerCase()).not.toBe("#3d5560");
    // Size reduced vs non-singleton same score
    const multi = pointEncoding({
      openness: "closed",
      semanticClass: "dominated",
      score: 0.5,
      heatEncoding: false,
      presentationMode: "curve",
      familyId: "gpt-5.6-luna",
      singleton: false,
      provider: "OpenAI",
    });
    expect(enc.sizeScale).toBeLessThan(multi.sizeScale);
    expect(series).toBeTruthy();
  });

  it("no emoji pictographs in legend channel titles", () => {
    const entries = legendEntries("curve", false);
    for (const e of entries) {
      expect(e.title).not.toMatch(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B50\u26A1]/u);
      expect(e.detail ?? "").not.toMatch(/[⚡★☆✦]/u);
    }
  });
});

// --- D10 (redefined 2026-08-07): identity must be reachable WITHOUT color ---
// Direct labeling carries identity (focus-set labels in stage3d-three.ts); color is
// a secondary cue. The palette bar is "no identical primaries + no catastrophic
// deuteranopia merge among high-signal labs" — NOT ≥35 dE for all 33×32/2 pairs,
// which is provably impossible in sRGB (deutan-saturated; candidates bottom out
// ~8–10 dE worst-pair).
const DEUTAN_M = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];
const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
function deutanLab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  // sRGB 0–255 → linear 0–1; deutan matrix applies in LINEAR light.
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => s2l(c / 255));
  const o = [0, 1, 2].map((i) =>
    clamp01(DEUTAN_M[i][0] * lin[0] + DEUTAN_M[i][1] * lin[1] + DEUTAN_M[i][2] * lin[2]),
  );
  // XYZ(D65) expects LINEAR values — do NOT gamma-encode before this matrix.
  const [R, G, B] = o;
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE76 = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("D10 CVD — identity-without-color palette floor", () => {
  const primaries = Object.entries(LAB_BRANDS).map(([k, v]) => ({
    k,
    hex: v.colors[0].toLowerCase(),
    dLab: deutanLab(v.colors[0]),
  }));

  it("has no two identical lab primaries", () => {
    const seen = new Map<string, string>();
    const dups: string[] = [];
    for (const p of primaries) {
      if (seen.has(p.hex)) dups.push(`${p.k} ≡ ${seen.get(p.hex)} (${p.hex})`);
      else seen.set(p.hex, p.k);
    }
    expect(dups, dups.join("; ")).toEqual([]);
  });

  it("high-signal lab deutan separation is label-mitigated (diagnostic)", () => {
    // Per redefined D10 (owner-approved 2026-08-07): identity is reachable WITHOUT
    // color via focus-set direct labels, so major brand colors are PRESERVED even
    // where deutan separation is weak (Anthropic↔Mistral, Google↔Microsoft,
    // NVIDIA↔Alibaba all merge ~8–10 dE). This logs the worst major pairs but only
    // hard-gates a true near-identical degenerate merge (<5 dE), which would mean
    // two brands are indistinguishable even with effort. Includes Arcee + Upstage
    // (the primaries this campaign recolored) so a recolor can't sneak in a merge.
    const majors = [
      "OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Qwen",
      "Microsoft", "NVIDIA", "Kimi", "SpaceXAI", "Mistral", "Alibaba", "Amazon",
      "Arcee AI", "Upstage",
    ];
    const HARD = 5;
    const pairD = (a: string, b: string) => {
      const pa = primaries.find((p) => p.k === a);
      const pb = primaries.find((p) => p.k === b);
      return pa && pb ? dE76(pa.dLab, pb.dLab) : Infinity;
    };
    const pairs: Array<{ d: number; label: string }> = [];
    for (let i = 0; i < majors.length; i++) {
      for (let j = i + 1; j < majors.length; j++) {
        pairs.push({ d: pairD(majors[i], majors[j]), label: `${majors[i]} ⟷ ${majors[j]}` });
      }
    }
    pairs.sort((x, y) => x.d - y.d);
    // Full-list diagnostic: surface EVERY <5 dE pair (incl. brand-preserved ones like
    // Alibaba↔Xiaomi orange) so degenerate merges are visible in CI even where the
    // owner declined a remap. Not a gate — label-mitigated per the redefined D10.
    const allDegenerate: Array<{ d: number; label: string }> = [];
    for (let i = 0; i < primaries.length; i++) {
      for (let j = i + 1; j < primaries.length; j++) {
        const d = dE76(primaries[i].dLab, primaries[j].dLab);
        if (d < HARD) allDegenerate.push({ d, label: `${primaries[i].k} ⟷ ${primaries[j].k}` });
      }
    }
    allDegenerate.sort((x, y) => x.d - y.d);
    // biome-ignore lint/suspicious/noConsole: D10 label-mitigated collision record
    console.log(
      `[D10] worst major deutan pairs (label-mitigated; brand colors preserved):\n${pairs
        .slice(0, 5)
        .map((p) => `  ${p.d.toFixed(1)}  ${p.label}`)
        .join("\n")}` +
        (allDegenerate.length
          ? `\n[D10] full-list <${HARD} dE pairs (known/brand-preserved, not gated):\n${allDegenerate
              .map((p) => `  ${p.d.toFixed(1)}  ${p.label}`)
              .join("\n")}`
          : ""),
    );
    const degenerate = pairs.filter((p) => p.d < HARD);
    expect(
      degenerate,
      `near-identical deutan merge (<${HARD} dE) among majors/recolored — would need a remap:\n${degenerate
        .map((p) => `  ${p.d.toFixed(1)}  ${p.label}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("documents the deutan separability report (diagnostic, not a gate)", () => {
    const report: string[] = [];
    for (let i = 0; i < primaries.length; i++) {
      for (let j = i + 1; j < primaries.length; j++) {
        const d = dE76(primaries[i].dLab, primaries[j].dLab);
        if (d < 35) report.push(`${d.toFixed(1)}  ${primaries[i].k} ⟷ ${primaries[j].k}`);
      }
    }
    report.sort((a, b) => parseFloat(a) - parseFloat(b));
    // biome-ignore lint/suspicious/noConsole: D10 saturated-palette record for CI
    console.log(
      `[D10] ${report.length} deutan pairs < 35 dE (sRGB-saturated; identity via labels, not color):\n${report.slice(0, 20).join("\n")}`,
    );
    expect(report.length).toBeGreaterThan(0);
  });
});
