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

/**
 * Official brand kit: ≥3 real brand colors per lab.
 *
 * colors[0] = primary fill · colors[1] = outer outline · colors[2] = core/inner ring
 * Extra colors (3+) reserved for legend / future pattern fills.
 *
 * Sources revalidated 2026-08-06 against lab brand pages, product CSS, and
 * published brand kits (Anthropic skill kit, Google Material G, Microsoft logo,
 * NVIDIA trademark PDF, IBM Carbon, Mistral brand, Amazon Smile, etc.).
 * When a brand is monochrome, include black / white / charcoal from their system —
 * do not invent fake rainbows.
 */
export interface LabBrand {
  /** Ordered brand palette — length ≥ 3. */
  colors: readonly string[];
  /** Provenance for maintainers (not shown in UI). */
  note?: string;
}

function brand(colors: readonly string[], note?: string): LabBrand {
  if (colors.length < 3) {
    throw new Error(`LabBrand requires ≥3 colors, got ${colors.length}: ${note ?? "?"}`);
  }
  return { colors, note };
}

export const LAB_BRANDS: Readonly<Record<string, LabBrand>> = {
  // ChatGPT green + OpenAI charcoal + off-white (product / brand archive)
  OpenAI: brand(["#10A37F", "#202123", "#FAFAFA"], "ChatGPT green · charcoal · off-white"),
  // Anthropic official accent kit (orange · blue · green) + dark ground
  Anthropic: brand(["#D97757", "#6A9BCC", "#788C5D", "#141413", "#FAF9F5"], "Anthropic accents + dark/light"),
  // Google logo / Material medium set
  Google: brand(["#4285F4", "#EA4335", "#FBBC05", "#34A853"], "Google Blue Red Yellow Green"),
  // Meta / Facebook product blues + white
  Meta: brand(["#0866FF", "#0081FB", "#FFFFFF", "#F0F2F5"], "Meta blue · light blue · white · ash"),
  // DeepSeek whale blue system (product mark blue + navy + cyan highlight)
  DeepSeek: brand(["#4D6BFE", "#1E3A8A", "#7DD3FC", "#0A0F2C"], "DeepSeek blue · navy · ice · ink"),
  /**
   * Qwen product identity (violet) — NOT Alibaba Smile orange.
   * Catalog often labels Qwen rows as provider "Alibaba"; resolveLabKey remaps by model name.
   */
  Qwen: brand(["#615CED", "#1A1033", "#C4B5FD", "#0D0A1A"], "Qwen violet · deep purple · lilac · ink"),
  // Alibaba corporate (non-Qwen only after resolveLabKey)
  Alibaba: brand(["#FF6A00", "#000000", "#FFFFFF", "#FFB400"], "Alibaba orange · black · white · gold"),
  // Mistral sunset kit (mistral.ai): orange-red · sunshine · cream · ink
  Mistral: brand(["#FA520F", "#FFD900", "#FFF0C2", "#1F1F1F", "#B9DAFF"], "Mistral orange · yellow · cream · ink"),
  // Cohere: coniferous green · synthetic quartz · volcanic black (Pentagram rebrand)
  Cohere: brand(["#39594D", "#D18EE2", "#212121", "#FF7759", "#FAFAFA"], "Cohere green · quartz · black · coral"),
  // Amazon Smile: orange · navy · white (+ classic denim blue)
  Amazon: brand(["#FF9900", "#232F3E", "#FFFFFF", "#146EB4"], "Amazon orange · navy · white · denim"),
  // Moonshot / Kimi platform (product blue system)
  Kimi: brand(["#1783FF", "#0B1B33", "#93C5FD", "#FFFFFF"], "Kimi blue · navy · sky · white"),
  // Microsoft logo square colors
  Microsoft: brand(["#00A4EF", "#7FBA00", "#F25022", "#FFB900"], "Microsoft Blue Green Red Yellow"),
  // MiniMax product magenta system
  MiniMax: brand(["#E91E8C", "#6B21A8", "#FBCFE8", "#1A0B1F"], "MiniMax magenta · violet · blush · ink"),
  // NVIDIA trademark: green · dark gray · white (PDF guidelines)
  NVIDIA: brand(["#76B900", "#1E1E1E", "#FFFFFF", "#000000"], "NVIDIA green · dark · white · black"),
  // xAI / Grok (AA: SpaceXAI): black · white · cool gray (brand guidelines monochrome)
  SpaceXAI: brand(["#E7E9EA", "#000000", "#71767B", "#FFFFFF"], "xAI light · black · gray · white"),
  // Thinking Machines Lab — no public kit; bronze triad marked unofficial
  "Thinking Machines": brand(["#C4A574", "#3D3428", "#F5E6C8", "#1A1612"], "unofficial bronze triad"),
  // Xiaomi orange · black · white · light orange
  Xiaomi: brand(["#FF6900", "#000000", "#FFFFFF", "#FF9850"], "Xiaomi orange · black · white"),
  // Zhipu / GLM (AA: "Z AI") product indigo system
  "Z AI": brand(["#1A56DB", "#7C3AED", "#93C5FD", "#0F172A"], "Zhipu indigo · violet · sky · ink"),
  // IBM Carbon blue 60 + black + white + blue 40
  IBM: brand(["#0F62FE", "#000000", "#FFFFFF", "#78A9FF"], "IBM Blue 60 · black · white · Blue 40"),
  // Tencent brand blue system
  Tencent: brand(["#12B7F5", "#0052D9", "#FFFFFF", "#001F4D"], "Tencent cyan · deep blue · white"),
  // AI21 product teal system
  "AI21 Labs": brand(["#0D9488", "#134E4A", "#5EEAD4", "#042F2E"], "AI21 teal triad"),
  // Long-tail labs (product chrome where public; else distinct high-contrast triad)
  "Nous Research": brand(["#A78BFA", "#1E1B4B", "#EDE9FE", "#4C1D95"], "Nous violet triad"),
  "Liquid AI": brand(["#22D3EE", "#0E7490", "#CFFAFE", "#083344"], "Liquid cyan triad"),
  InclusionAI: brand(["#F43F5E", "#881337", "#FECDD3", "#4C0519"], "Inclusion rose triad"),
  Inception: brand(["#FBBF24", "#78350F", "#FEF3C7", "#451A03"], "Inception amber triad"),
  "Arcee AI": brand(["#38BDF8", "#0C4A6E", "#E0F2FE", "#082F49"], "Arcee sky triad"),
  Upstage: brand(["#6366F1", "#312E81", "#E0E7FF", "#1E1B4B"], "Upstage indigo triad"),
  StepFun: brand(["#34D399", "#064E3B", "#D1FAE5", "#022C22"], "StepFun emerald triad"),
  LongCat: brand(["#F472B6", "#831843", "#FCE7F3", "#500724"], "LongCat pink triad"),
  KwaiKAT: brand(["#FF4906", "#1A1A1A", "#FFFFFF", "#FFB4A0"], "Kwai orange triad"),
  Celeris: brand(["#94A3B8", "#334155", "#F1F5F9", "#0F172A"], "Celeris slate triad"),
  "Multiverse Computing": brand(["#818CF8", "#312E81", "#E0E7FF", "#1E1B4B"], "Multiverse indigo triad"),
  "Nex AGI": brand(["#2DD4BF", "#115E59", "#CCFBF1", "#042F2E"], "Nex teal triad"),
  "Sapiens AI": brand(["#F59E0B", "#78350F", "#FEF3C7", "#451A03"], "Sapiens amber triad"),
};

const FALLBACK_BRAND: LabBrand = brand(["#89939E", "#3D5560", "#E7E2D8"], "unknown lab fallback");

/**
 * Map catalog provider (+ optional model id) → LAB_BRANDS key.
 * Product identity wins over coarse org labels (Qwen ≠ Alibaba Smile orange).
 */
export function resolveLabKey(provider: string, modelId?: string): string {
  const mid = (modelId ?? "").trim();
  // Qwen* models are catalogued under Alibaba / Alibaba Cloud — brand as Qwen.
  // Match Qwen3.5… etc. (digit after n is not a word boundary).
  if (mid && /qwen/i.test(mid)) {
    return "Qwen";
  }
  const p = (provider ?? "").trim();
  if (p in LAB_BRANDS) return p;
  const aliases: Record<string, string> = {
    xAI: "SpaceXAI",
    XAI: "SpaceXAI",
    Grok: "SpaceXAI",
    "Alibaba Cloud": "Alibaba",
    "Zhipu AI": "Z AI",
    Zhipu: "Z AI",
  };
  return aliases[p] ?? p;
}

/** @deprecated use labBrand(provider).colors[0] */
export const LAB_COLORS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LAB_BRANDS).map(([k, v]) => [k, v.colors[0]]),
) as Record<string, string>;

export function labBrand(provider: string, modelId?: string): LabBrand {
  return LAB_BRANDS[resolveLabKey(provider, modelId)] ?? FALLBACK_BRAND;
}

/** Brand palette (≥3). Always returns a fresh copy-safe readonly view. */
export function labColors(provider: string, modelId?: string): readonly string[] {
  return labBrand(provider, modelId).colors;
}

export function labColor(provider: string, fallback = "#89939E", modelId?: string): string {
  const key = resolveLabKey(provider, modelId);
  return LAB_BRANDS[key]?.colors[0] ?? fallback;
}

export function labSecondary(provider: string, fallback = "#3D5560", modelId?: string): string {
  const key = resolveLabKey(provider, modelId);
  return LAB_BRANDS[key]?.colors[1] ?? fallback;
}

export function labTertiary(provider: string, fallback = "#E7E2D8", modelId?: string): string {
  const key = resolveLabKey(provider, modelId);
  return LAB_BRANDS[key]?.colors[2] ?? fallback;
}

/** sRGB 0–255 → HSL (h 0–360, s/l 0–1). */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGBChannels {
  const hh = ((h % 360) + 360) % 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = hh / 360;
  const t = (n: number) => {
    let x = n;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [t(hk + 1 / 3), t(hk), t(hk - 1 / 3)].map((c) => Math.round(c * 255)) as RGBChannels;
}

/**
 * Shade a brand hex while locking hue (+ saturation). Used so families in a lab
 * stay unmistakably that brand, just lighter/darker.
 */
export function brandShade(hex: string, lightnessDelta: number): string {
  const ch = parseChannels(hex);
  if (!ch) return hex;
  const [h, s, l] = rgbToHsl(ch[0], ch[1], ch[2]);
  // Keep saturation high so brand reads true; clamp lightness for ink contrast.
  const sat = Math.min(1, Math.max(0.45, s * 1.05));
  const lit = Math.min(0.78, Math.max(0.28, l + lightnessDelta));
  return toHex(hslToRgb(h, sat, lit));
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
 * Continuous size channel for value-score (the 4th mark variable).
 * Axes already carry cost × intelligence × speed; size answers
 * "how good for my current weights?" without needing ?heat=1 color.
 * Sqrt map keeps mid scores readable; range ~0.48–1.42.
 */
export function scoreSizeScale(score: number): number {
  const s = Math.min(1, Math.max(0, Number.isFinite(score) ? score : 0));
  return 0.48 + Math.sqrt(s) * 0.94;
}

/**
 * Product rule: **lab = brand primary**, **family within lab = shade of primary**.
 * Secondary/tertiary brand colors are outer ring + inner core (always on).
 */
export function familySeriesColor(familyId: string, provider?: string, modelId?: string): string {
  const key = provider ? resolveLabKey(provider, modelId) : "";
  const brand = key ? LAB_BRANDS[key] : undefined;
  if (brand) {
    const t = stableUnitHash(`${key}::${familyId}`);
    // -0.16 … +0.16 around brand L — enough to tell families apart, not wash brand.
    const delta = -0.16 + t * 0.32;
    return brandShade(brand.colors[0], delta);
  }
  // Unknown lab: stable mid-range hash (not claimed as a brand color).
  const t = stableUnitHash(familyId);
  const r = 70 + Math.floor(t * 140);
  const g = 80 + Math.floor(stableUnitHash(familyId + ":g") * 120);
  const b = 90 + Math.floor(stableUnitHash(familyId + ":b") * 110);
  return toHex([r, g, b]);
}

/** Outer outline = brand colors[1] (fixed, not family-shaded). */
export function familyAccentColor(provider?: string, modelId?: string): string {
  return provider ? labSecondary(provider, "#3D5560", modelId) : "#3D5560";
}

/** Inner core = brand colors[2] (fixed). */
export function familyCoreColor(provider?: string, modelId?: string): string {
  return provider ? labTertiary(provider, "#E7E2D8", modelId) : "#E7E2D8";
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
  /** Model id for lab aliasing (e.g. Qwen* under Alibaba). */
  modelId?: string;
  palette?: SemanticPalette;
  /** Solo family filter active for this family. */
  solo?: boolean;
  /** Currently selected / hovered. */
  selected?: boolean;
  /** ?brand=full or density-expand. */
  brandFull?: boolean;
  /** Member of cinema focus set. */
  cinemaFocus?: boolean;
  /**
   * Effort role within multi-effort family: endpoints keep full size;
   * mid steps shrink (size only — brand fill stays full chroma).
   */
  effortRole?: "endpoint" | "mid" | "single";
}

export interface PointEncoding {
  fill: string;
  /** Brand colors[1] — outer outline ring. */
  accent: string;
  /** Brand colors[2] — inner core. */
  core: string;
  /** Full brand palette (≥3) for legend / advanced marks. */
  brandColors: readonly string[];
  opacity: number;
  sizeScale: number;
  trailColor: string;
  seriesColor: string;
  /** Outer brand ring mesh — false at full catalog density by default. */
  showRing: boolean;
  /** Inner brand core mesh. */
  showCore: boolean;
  /** Suggested idle trail opacity (stages may raise on solo). */
  trailOpacity: number;
}

/**
 * Brand ring/core layers — Beauty P0: focus-gated multi-color, not always-on confetti.
 * Body fill keeps lab brand always; ring (colors[1]) + core (colors[2]) on solo /
 * selected / cinema / ?brand=full only.
 */
export function brandLayerFlags(input?: Pick<
  PointEncodingInput,
  "solo" | "selected" | "brandFull" | "cinemaFocus"
>): { showRing: boolean; showCore: boolean } {
  const on = Boolean(
    input?.solo || input?.selected || input?.brandFull || input?.cinemaFocus,
  );
  return { showRing: on, showCore: on };
}

/** Idle multi-effort trail opacity — quiet so ridge + fills own hierarchy. */
export const TRAIL_IDLE_OPACITY = 0.18;
export const TRAIL_SOLO_OPACITY = 0.88;
/** Mid-effort size multiplier within a multi-effort family. */
export const MID_EFFORT_SIZE_SCALE = 0.7;
/** Dominated marks: slight desat toward ink (keep hue) so frontier wins. */
export const DOMINATED_CHROMA_PULL = 0.22;

/**
 * Single product encoding contract for stage, projections, sweep, and legend.
 * Curve-focus (default): lab brand fill always; ring/core focus-gated (Beauty P0).
 * Hierarchy: filament ridge > frontier size > full-chroma lab fill > quiet trails.
 * Dominated: keep lab hue, pull chroma slightly toward ink (not slate mud).
 * Openness mode: legacy aaPointFill for regression / AA screenshots.
 */
export function pointEncoding(input: PointEncodingInput): PointEncoding {
  const palette = input.palette ?? DEFAULT_SEMANTIC_PALETTE;
  // Lab primary (family-shaded) + fixed brand secondary/tertiary rings.
  const series = familySeriesColor(input.familyId, input.provider, input.modelId);
  const accent = familyAccentColor(input.provider, input.modelId);
  const core = familyCoreColor(input.provider, input.modelId);
  const brandColors = labColors(input.provider ?? "", input.modelId);
  const lab = labColor(input.provider ?? "", series, input.modelId);
  const trailColor = series;
  const layers = brandLayerFlags(input);
  const trailOpacity =
    input.solo || input.selected ? TRAIL_SOLO_OPACITY : TRAIL_IDLE_OPACITY;
  // Size = value-score × singleton × mid-effort. Stages add frontier/optimum floors.
  const scoreSize = scoreSizeScale(input.score);
  const singletonMul =
    input.singleton && input.semanticClass !== "optimum" ? SINGLETON_SIZE_SCALE : 1;
  const midMul = input.effortRole === "mid" ? MID_EFFORT_SIZE_SCALE : 1;
  /** Idle dominated: keep brand hue, soft desat for hierarchy. */
  const dominatedFillBrand = mixColors(series, palette.slateCyan, DOMINATED_CHROMA_PULL);

  if (input.presentationMode === "openness") {
    return {
      fill: aaPointFill(
        input.openness,
        input.semanticClass,
        input.score,
        input.heatEncoding,
        palette,
      ),
      accent,
      core,
      brandColors,
      opacity: 1,
      sizeScale: scoreSize * midMul,
      trailColor: lab,
      seriesColor: series,
      showRing: layers.showRing,
      showCore: layers.showCore,
      trailOpacity,
    };
  }

  // Diagnostic heat (?heat=1): score heat on fill, but trail keeps lab/family identity.
  if (input.heatEncoding) {
    return {
      fill: semanticPointFill(input.semanticClass, input.score, true, palette),
      accent,
      core,
      brandColors,
      opacity: input.singleton && input.semanticClass !== "optimum" ? SINGLETON_OPACITY : 1,
      sizeScale: scoreSize * singletonMul * midMul,
      trailColor,
      seriesColor: series,
      showRing: layers.showRing,
      showCore: layers.showCore,
      trailOpacity,
    };
  }

  if (input.semanticClass === "optimum") {
    return {
      fill: palette.gold ?? palette.filament,
      accent: series,
      core,
      brandColors,
      opacity: 1,
      sizeScale: Math.max(1.15, scoreSize),
      trailColor,
      seriesColor: series,
      showRing: true,
      showCore: true,
      trailOpacity,
    };
  }

  // Singleton (incl. singleton-frontier): lab-tinted fill + dim before multi-effort paths.
  if (input.singleton) {
    return {
      fill: mixColors(SINGLETON_FILL, series, 0.45),
      accent,
      core,
      brandColors,
      opacity: SINGLETON_OPACITY,
      sizeScale: scoreSize * SINGLETON_SIZE_SCALE * midMul,
      trailColor,
      seriesColor: series,
      showRing: layers.showRing,
      showCore: layers.showCore,
      trailOpacity,
    };
  }

  // Multi-effort frontier: full lab chroma; ring only on focus.
  if (input.semanticClass === "frontier") {
    return {
      fill: series,
      accent,
      core,
      brandColors,
      opacity: 1,
      sizeScale: scoreSize * midMul,
      trailColor,
      seriesColor: series,
      showRing: layers.showRing,
      showCore: layers.showCore,
      trailOpacity,
    };
  }

  // Dominated multi-effort: lab hue retained, chroma pulled for hierarchy.
  return {
    fill: dominatedFillBrand,
    accent,
    core,
    brandColors,
    opacity: 0.88,
    sizeScale: scoreSize * midMul,
    trailColor,
    seriesColor: series,
    showRing: layers.showRing,
    showCore: layers.showCore,
    trailOpacity,
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
      { id: "size-score", title: "Point size", detail: "value-score for your weights · bigger = better fit" },
      { id: "glyph-closed", title: "Wire sphere", detail: "closed weights" },
      { id: "glyph-open", title: "Wire octa", detail: "open weights" },
      { id: "frontier-point", title: "Frontier point", detail: "size floor" },
    ];
  }
  const heatNote = heatEncoding
    ? "HEAT ON · copper→filament by value score (diagnostic)"
    : "lab = color · shape = open/closed (all wire) · size = value score";
  return [
    { id: "lab-color", title: "Lab color", detail: "brand fill always · ring/core on focus · family shades primary" },
    { id: "family-trail", title: "Family trail", detail: "effort path · quiet until solo · real points only" },
    { id: "size-score", title: "Point size", detail: "value-score for your weights · bigger = better fit" },
    { id: "glyph-closed", title: "Wire sphere", detail: "closed weights" },
    { id: "glyph-open", title: "Wire octa", detail: "open weights · all marks wireframe" },
    { id: "frontier-ridge", title: "Pareto ridge", detail: "filament ridge · loudest structural line" },
    { id: "optimum-marker", title: "Optimum", detail: "gold + largest · best for your weights" },
    { id: "frontier-point", title: "Frontier point", detail: "size floor · keeps lab/family fill" },
    { id: "singleton-dim", title: "Singleton", detail: "dim lab tint · single-effort in visible set" },
    { id: "heat-note", title: heatEncoding ? "Heat" : "Encoding", detail: heatNote },
  ];
}

/** Ordered lab swatches for STAGE KEY (≥3 brand colors). Accepts models for Qwen/etc aliasing. */
export function labLegendEntries(
  providers: readonly string[],
  models?: readonly { provider: string; model: string }[],
): Array<{ provider: string; color: string; secondary: string; tertiary: string; colors: readonly string[] }> {
  const seen = new Set<string>();
  const out: Array<{
    provider: string;
    color: string;
    secondary: string;
    tertiary: string;
    colors: readonly string[];
  }> = [];
  if (models?.length) {
    for (const m of models) {
      const key = resolveLabKey(m.provider, m.model);
      if (seen.has(key)) continue;
      seen.add(key);
      const colors = labColors(m.provider, m.model);
      out.push({
        provider: key,
        color: colors[0],
        secondary: colors[1],
        tertiary: colors[2],
        colors,
      });
    }
  } else {
    for (const p of providers) {
      const key = resolveLabKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      const colors = labColors(p);
      out.push({
        provider: key,
        color: colors[0],
        secondary: colors[1],
        tertiary: colors[2],
        colors,
      });
    }
  }
  return out.sort((a, b) => a.provider.localeCompare(b.provider));
}
