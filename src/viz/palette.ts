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

/** Mix two palette colours without introducing a categorical provider hue. */
export function mixColors(from: string, to: string, ratio: number): string {
  const fromChannels = parseChannels(from);
  const toChannels = parseChannels(to);
  if (!fromChannels || !toChannels) return to;
  const amount = Math.max(0, Math.min(1, ratio));
  return toHex(fromChannels.map((channel, index) => channel + (toChannels[index] - channel) * amount) as RGBChannels);
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
