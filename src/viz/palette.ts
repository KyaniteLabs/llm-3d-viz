/**
 * Shared marker-palette helpers for the SPEED × COST × INTELLIGENCE instrument.
 *
 * The stage (`stage3d.ts`), the linked 2D projections (`projections.ts`), and
 * the threshold-sweep (`sweep.ts`) all encode the dominated / off-frontier
 * fill. They MUST agree: the sweep re-asserts marker colour on every weight
 * change and on every cinema re-render, so a drift here would visibly
 * overwrite the stage's dim points with a different colour mid-animation.
 * Centralising the dominated fill keeps the three in lockstep.
 */

export type RGBChannels = [number, number, number];

export type SemanticPointClass = "dominated" | "frontier" | "optimum";

export interface SemanticPalette {
  slateCyan: string;
  filamentDim: string;
  filament: string;
  /** Low-score frontier heat (DESIGN-SYSTEM copper — chrome accent, reused for visible score heat). */
  copper: string;
  /** Optimum hot core (DESIGN-SYSTEM mineral-gold alt — maximum legibility). */
  gold: string;
}

export const DEFAULT_SEMANTIC_PALETTE: SemanticPalette = {
  slateCyan: "#3D5560",
  filamentDim: "#C9D4C4",
  filament: "#E8F1E4",
  copper: "#C47A3A",
  gold: "#F4D58A",
};

// Frontier heat is a *visible* copper→filament ramp (not near-white-on-near-white).
// Dominated stays cool slate, capped below the copper floor so class stays readable.
const FRONTIER_HEAT_FLOOR = 0.08;
const FRONTIER_HEAT_CEILING = 0.95;
const DOMINATED_HEAT_FLOOR = 0.15;
const DOMINATED_LUMINANCE_CEILING = 0.35;

const HEX6 = /^#([\da-f]{6})$/i;
const HEX3 = /^#([\da-f]{3})$/i;
const RGB = /^rgba?\(([^)]+)\)$/i;

/** Parse `#hex` (3 or 6) / `rgb()` / `rgba()` into [r, g, b]; null if unrecognised. */
export function parseChannels(color: string | undefined | null): RGBChannels | null {
  const value = (color ?? "").trim();
  const h6 = value.match(HEX6);
  if (h6) {
    return [0, 2, 4].map((offset) => Number.parseInt(h6[1].slice(offset, offset + 2), 16)) as RGBChannels;
  }
  const h3 = value.match(HEX3);
  if (h3) {
    return [0, 1, 2].map((i) => Number.parseInt(h3[1][i] + h3[1][i], 16)) as RGBChannels;
  }
  const rgb = value.match(RGB);
  if (rgb) {
    const channels = rgb[1].split(",").slice(0, 3).map((part) => Number.parseFloat(part.trim()));
    if (channels.every((n) => Number.isFinite(n))) return channels as RGBChannels;
  }
  return null;
}

/** Clamp + round channels to a `#rrggbb` string. */
export function toHex(channels: RGBChannels): string {
  return `#${channels
    .map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Mix a colour toward white by `ratio` (0 = unchanged, 1 = white). Same hue,
 * raised luminance — no new colour introduced, so it stays inside the
 * subtraction language (no glow, no added hue).
 */
export function lighten(color: string, ratio: number): string {
  const channels = parseChannels(color);
  if (!channels) return color;
  return toHex(channels.map((c) => c + (255 - c) * ratio) as RGBChannels);
}

/** Mix a colour toward black by `ratio` (0 = unchanged, 1 = black). */
export function darken(color: string, ratio: number): string {
  const channels = parseChannels(color);
  if (!channels) return color;
  const amount = Math.max(0, Math.min(1, ratio));
  return toHex(channels.map((c) => c * (1 - amount)) as RGBChannels);
}

/** Mix two palette colours without introducing a categorical provider hue. */
export function mixColors(from: string, to: string, ratio: number): string {
  const fromChannels = parseChannels(from);
  const toChannels = parseChannels(to);
  if (!fromChannels || !toChannels) return to;
  const amount = Math.max(0, Math.min(1, ratio));
  return toHex(fromChannels.map((channel, index) => channel + (toChannels[index] - channel) * amount) as RGBChannels);
}

/** Stable 0..1 hash for a string (FNV-1a fraction). */
export function stableUnitHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) % 10_000) / 10_000;
}

/**
 * Frontier value-score encoding: copper (low score) → filament (high score).
 * Readable on ink; still not a provider rainbow (one sequential heat channel).
 */
export function scoreLuminanceFill(
  score: number,
  filamentDim = "#C9D4C4",
  _filament = "#E8F1E4",
  copper = DEFAULT_SEMANTIC_PALETTE.copper,
): string {
  const amount =
    FRONTIER_HEAT_FLOOR +
    Math.max(0, Math.min(1, score)) * (FRONTIER_HEAT_CEILING - FRONTIER_HEAT_FLOOR);
  // Ramp copper → filament-dim so optimum (filament/gold) stays the brightest mark.
  return mixColors(copper, filamentDim, amount);
}

function channelLinear(c8bit: number): number {
  const c = c8bit / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of an sRGB colour (0 = black, 1 = white). */
export function relativeLuminance(color: string): number {
  const channels = parseChannels(color);
  if (!channels) return 0;
  const [r, g, b] = channels.map(channelLinear) as RGBChannels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1.0–21.0). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const SLATE_CYAN_FALLBACK = "#3D5560";

/** Resolve the `--slate-cyan` custom property (fallback `#3D5560`). */
export function resolveSlateCyan(): string {
  if (typeof document === "undefined") return SLATE_CYAN_FALLBACK;
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--slate-cyan").trim() ||
    SLATE_CYAN_FALLBACK
  );
}

/**
 * The dominated / off-frontier fill.
 *
 * DESIGN-SYSTEM prescribes slate-cyan at 40–60% opacity (subtraction, never
 * glow). But on the near-black ink-field (`--ink-field` `#070C0B`) even *pure*
 * slate-cyan tops out ≈ 2.5:1 contrast — below the 3:1 visibility floor the
 * gate requires — and at the prescribed 50% opacity it is ≈ 1.7:1, which
 * renders the ~20 dominated models near-invisible. Raising alpha cannot reach
 * the floor (the ceiling is pure slate-cyan at 2.5:1), so we raise the
 * *luminance floor* instead: lighten the SAME slate-cyan hue toward white
 * (`lighten`, no added colour, no glow — still subtraction). The result lands
 * ≈ 4.4:1 against ink-field: plainly visible, yet far below the frontier's
 * filament-dim (≈ 13:1) so the frontier/optimum remain unmistakable.
 */
export function dominatedFill(slateCyan: string = resolveSlateCyan()): string {
  return lighten(slateCyan, 0.22);
}

/**
 * Find the brightest slate-family colour that remains below the frontier
 * floor. Keeping this boundary derived from the actual tokens makes the
 * exclusivity invariant survive token changes instead of relying on a lucky
 * hard-coded RGB value.
 */
function boundedSlateCeiling(slateCyan: string, filamentDim: string): string {
  const floor = dominatedFill(slateCyan);
  const floorLuminance = relativeLuminance(floor);
  const frontierLuminance = relativeLuminance(filamentDim);
  if (!(frontierLuminance > floorLuminance)) return floor;

  const target = frontierLuminance * DOMINATED_LUMINANCE_CEILING;
  let low = 0.22;
  let high = 1;
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (relativeLuminance(lighten(slateCyan, midpoint)) < target) low = midpoint;
    else high = midpoint;
  }
  return lighten(slateCyan, low);
}

/** Dominated-only heat ramp: score changes brightness inside the slate class. */
export function dominatedScoreLuminanceFill(
  score: number,
  slateCyan = SLATE_CYAN_FALLBACK,
  filamentDim = "#C9D4C4",
): string {
  const floor = dominatedFill(slateCyan);
  const ceiling = boundedSlateCeiling(slateCyan, filamentDim);
  const amount = DOMINATED_HEAT_FLOOR + Math.max(0, Math.min(1, score)) * (1 - DOMINATED_HEAT_FLOOR);
  return mixColors(floor, ceiling, amount);
}

/** Unlit appearance for each semantic class during threshold-sweep staging. */
export function semanticFloorFill(
  semanticClass: SemanticPointClass,
  palette: SemanticPalette = DEFAULT_SEMANTIC_PALETTE,
): string {
  return semanticClass === "dominated" ? dominatedFill(palette.slateCyan) : palette.filamentDim;
}

/** Heat-scaled appearance for each semantic class at the settled weight set. */
export function semanticHeatFill(
  semanticClass: SemanticPointClass,
  score: number,
  palette: SemanticPalette = DEFAULT_SEMANTIC_PALETTE,
): string {
  if (semanticClass === "optimum") return palette.filament;
  if (semanticClass === "frontier") {
    return scoreLuminanceFill(
      score,
      palette.filamentDim,
      palette.filament,
      palette.copper ?? DEFAULT_SEMANTIC_PALETTE.copper,
    );
  }
  return dominatedScoreLuminanceFill(score, palette.slateCyan, palette.filamentDim);
}

/** Shared point-color policy for the stage, projections, and sweep target. */
export function semanticPointFill(
  semanticClass: SemanticPointClass,
  score: number,
  heatEncoding: boolean,
  palette: SemanticPalette = DEFAULT_SEMANTIC_PALETTE,
): string {
  if (heatEncoding) return semanticHeatFill(semanticClass, score, palette);
  if (semanticClass === "optimum") return palette.filament;
  return semanticFloorFill(semanticClass, palette);
}

/** AA-style openness fills — used only when presentationMode is "openness" or ?enc=openness. */
export const OPENNESS_FILL = {
  open: "#5B9BD5",
  // Lifted near-black so closed marks stay ≥~3:1 on ink-field (FIX-C visibility).
  closed: "#6A7580",
} as const;

/** Stable lab identity colors for outlines / trails / legend (not fill primary). */
export const LAB_COLORS: Readonly<Record<string, string>> = {
  OpenAI: "#10A37F",
  Anthropic: "#D4A27F",
  Google: "#4285F4",
  Meta: "#0668E1",
  DeepSeek: "#4D6BFE",
  Alibaba: "#FF6A00",
  Mistral: "#F54E42",
  Cohere: "#39594D",
  Amazon: "#FF9900",
  Kimi: "#1A73E8",
  Microsoft: "#00A4EF",
  MiniMax: "#7C5CFF",
  NVIDIA: "#76B900",
  SpaceXAI: "#E8F1E4",
  "Thinking Machines": "#C47A3A",
  Xiaomi: "#FF6900",
  "Z AI": "#6366F1",
};

export function labColor(provider: string, fallback = "#89939E"): string {
  return LAB_COLORS[provider] ?? fallback;
}

/**
 * Legacy openness-primary fill (heat off): openness for dominated; frontier/optimum keep
 * filament hierarchy. Used when presentationMode is "openness" / ?enc=openness only.
 */
export function aaPointFill(
  openness: "open" | "closed",
  semanticClass: SemanticPointClass,
  score: number,
  heatEncoding: boolean,
  palette: SemanticPalette = DEFAULT_SEMANTIC_PALETTE,
): string {
  if (heatEncoding) return semanticPointFill(semanticClass, score, true, palette);
  if (semanticClass === "optimum") return palette.gold ?? palette.filament;
  if (semanticClass === "frontier") return palette.filamentDim;
  return openness === "open" ? OPENNESS_FILL.open : OPENNESS_FILL.closed;
}


// ---------------------------------------------------------------------------
// Curve-focus product default (RALPLAN A2 / PRD #86)
// ---------------------------------------------------------------------------

export type PresentationMode = "curve" | "openness";

/** Singleton dim recipe (visual only — still in score/frontier). */
export const SINGLETON_OPACITY = 0.42;
export const SINGLETON_SIZE_SCALE = 0.55;

/** Slate fill for post-filter single-effort points under curve-focus. */
export const SINGLETON_FILL = "#5A6E78"; // raised for ≥~3:1 on ink (tastecheck CL-03)

/**
 * Product rule (glanceability): **lab = hue**, **family within lab = shade**.
 * OpenAI greens stay green; Anthropic stays warm; Google blue; Alibaba orange.
 * Different families in the same lab are light/dark variants of that lab color —
 * never a random hue that could be mistaken for another lab.
 */
export function familySeriesColor(familyId: string, provider?: string): string {
  const lab = labColor(provider ?? "", "");
  const knownLab = Boolean(provider && LAB_COLORS[provider]);
  if (knownLab && lab) {
    // Shade span: darkened lab ↔ lightened lab. Spread families across the band.
    const t = stableUnitHash(`${provider}::${familyId}`);
    // Bias away from pure black/white so marks stay readable on ink.
    const lo = darken(lab, 0.38);
    const hi = lighten(lab, 0.42);
    return mixColors(lo, hi, 0.12 + t * 0.76);
  }
  // Unknown lab: still stable per family, mid-range so it does not steal focus.
  const t = stableUnitHash(familyId);
  const r = 70 + Math.floor(t * 140);
  const g = 80 + Math.floor(stableUnitHash(familyId + ":g") * 120);
  const b = 90 + Math.floor(stableUnitHash(familyId + ":b") * 110);
  return toHex([r, g, b]);
}

/** @deprecated kept for tests/docs that import the old curated map name */
export const FAMILY_SERIES_COLORS: Readonly<Record<string, string>> = {};

export function isSingleton(
  model: { family_id?: string; model: string },
  visibleModels: readonly { family_id?: string; model: string }[],
  familyOf: (m: any) => string,
): boolean {
  const fid = familyOf(model);
  let count = 0;
  for (const m of visibleModels) {
    if (familyOf(m) === fid) {
      count += 1;
      if (count >= 2) return false;
    }
  }
  return true;
}

export interface PointEncodingInput {
  openness: "open" | "closed";
  semanticClass: SemanticPointClass;
  score: number;
  heatEncoding: boolean;
  presentationMode: PresentationMode;
  familyId: string;
  singleton: boolean;
  provider?: string;
  palette?: SemanticPalette;
}

export interface PointEncoding {
  fill: string;
  opacity: number;
  sizeScale: number;
  trailColor: string;
  seriesColor: string;
}

/**
 * Single product encoding contract for stage, projections, sweep, and legend.
 * Curve-focus (default): family series fill+trail; openness never primary fill.
 * Openness mode: legacy aaPointFill for regression / AA screenshots.
 */
export function pointEncoding(input: PointEncodingInput): PointEncoding {
  const palette = input.palette ?? DEFAULT_SEMANTIC_PALETTE;
  // Lab hue + family shade — primary glance channel for curve-focus.
  const series = familySeriesColor(input.familyId, input.provider);
  const lab = labColor(input.provider ?? "", series);
  const trailColor = series;

  if (input.presentationMode === "openness") {
    return {
      fill: aaPointFill(
        input.openness,
        input.semanticClass,
        input.score,
        input.heatEncoding,
        palette,
      ),
      opacity: 1,
      sizeScale: 1,
      trailColor: lab,
      seriesColor: series,
    };
  }

  // Diagnostic heat (?heat=1): score heat on fill, but trail keeps lab/family identity.
  if (input.heatEncoding) {
    return {
      fill: semanticPointFill(input.semanticClass, input.score, true, palette),
      opacity: input.singleton && input.semanticClass !== "optimum" ? SINGLETON_OPACITY : 1,
      sizeScale: input.singleton && input.semanticClass !== "optimum" ? SINGLETON_SIZE_SCALE : 1,
      trailColor,
      seriesColor: series,
    };
  }

  if (input.semanticClass === "optimum") {
    return {
      fill: palette.gold ?? palette.filament,
      opacity: 1,
      sizeScale: 1,
      trailColor,
      seriesColor: series,
    };
  }

  // Singleton: keep a lab-tinted fill so lab identity is still readable at a glance.
  if (input.singleton) {
    return {
      fill: mixColors(SINGLETON_FILL, series, 0.45),
      opacity: SINGLETON_OPACITY,
      sizeScale: SINGLETON_SIZE_SCALE,
      trailColor,
      seriesColor: series,
    };
  }

  // Multi-effort dominated + frontier: lab/family series fill (size handles hierarchy).
  return {
    fill: series,
    opacity: 1,
    sizeScale: 1,
    trailColor,
    seriesColor: series,
  };
}

/** Legend entries for the active presentation mode (1:1 with marks). */
export function legendEntries(
  mode: PresentationMode,
  heatEncoding: boolean,
): Array<{ id: string; title: string; detail: string }> {
  if (mode === "openness") {
    return [
      { id: "frontier-ridge", title: "Pareto frontier", detail: "white ridge / efficient boundary" },
      { id: "optimum-marker", title: "Optimum marker", detail: "bright gold / largest" },
      { id: "open-point", title: "Open weights", detail: "blue fill (dominated)" },
      { id: "closed-point", title: "Closed / proprietary", detail: "slate fill (dominated)" },
      { id: "reasoning-mark", title: "Reasoning", detail: "open / wireframe glyph" },
      { id: "frontier-point", title: "Frontier point", detail: "filament-dim size" },
    ];
  }
  const heatNote = heatEncoding
    ? "HEAT ON · copper→filament by value score (diagnostic)"
    : "lab hue · family shade · trail = effort path";
  return [
    { id: "lab-color", title: "Lab color", detail: "OpenAI green · Anthropic warm · Google blue · …" },
    { id: "family-trail", title: "Family trail", detail: "same lab hue · shade of this family · low→xhigh effort" },
    { id: "effort-path", title: "Effort path", detail: "real measured points only · ordered intensity" },
    { id: "singleton-dim", title: "Singleton", detail: "dim lab tint · single-effort in visible set" },
    { id: "frontier-ridge", title: "Pareto frontier", detail: "white ridge · nothing beats these on all axes" },
    { id: "optimum-marker", title: "Optimum marker", detail: "bright gold / largest · best for your weights" },
    { id: "open-closed-glyph", title: "Open / closed", detail: "glyph only · not primary fill" },
    { id: "reasoning-mark", title: "Reasoning", detail: "open / wireframe glyph" },
    { id: "frontier-point", title: "Frontier point", detail: "larger size · keeps lab/family fill" },
    { id: "heat-note", title: heatEncoding ? "Heat" : "Lab-focus", detail: heatNote },
  ];
}

/** Ordered lab swatches for STAGE KEY (product cloud labs first). */
export function labLegendEntries(
  providers: readonly string[],
): Array<{ provider: string; color: string }> {
  const seen = new Set<string>();
  const out: Array<{ provider: string; color: string }> = [];
  for (const p of providers) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({ provider: p, color: labColor(p) });
  }
  return out.sort((a, b) => a.provider.localeCompare(b.provider));
}
