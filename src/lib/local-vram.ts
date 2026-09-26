/**
 * Local-inference VRAM tiers for open-weight models.
 *
 * Catalog has no measured VRAM — we parse parameter scale from model names and
 * map to popular consumer GPU buckets (Q4_K-class rule of thumb).
 *
 * Top-3 community tiers (local LLM, 2025–26):
 *   8 GB  — laptop / entry (≤ ~9B)
 *  12 GB  — mid desktop (≤ ~14B)
 *  24 GB  — 3090/4090 class (≤ ~34B dense, or MoE active ≤ ~34B)
 */

/** Popular consumer VRAM ceilings (GB). */
export type LocalVramGb = 8 | 12 | 24;

export const LOCAL_VRAM_TIERS: readonly {
  vramMaxGb: LocalVramGb;
  /** Max dense (or MoE-active) params that fit Q4-class local run. */
  maxParamsB: number;
  label: string;
  blurb: string;
}[] = [
  {
    vramMaxGb: 8,
    maxParamsB: 9,
    label: "Local · 8 GB",
    blurb: "Laptop / entry GPU — open models up to ~9B (Q4).",
  },
  {
    vramMaxGb: 12,
    maxParamsB: 14,
    label: "Local · 12 GB",
    blurb: "Mid desktop (e.g. 3060 12GB) — open models up to ~14B (Q4).",
  },
  {
    vramMaxGb: 24,
    maxParamsB: 34,
    label: "Local · 24 GB",
    blurb: "4090-class — open models up to ~34B dense / MoE active (Q4).",
  },
] as const;

/**
 * Parse parameter scale in billions from a model name.
 * Prefers MoE active size (`A22B`) over total (`235B`) when both appear.
 */
export function parseParamsBillions(modelName: string): number | null {
  const name = modelName;
  // MoE active experts: "235B A22B", "A10B"
  const active = name.match(/\bA(\d+(?:\.\d+)?)\s*B\b/i);
  if (active) {
    const n = Number(active[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Dense: "70B", "7B", "3.5B", "Seed-OSS-36B"
  const dense = name.match(/(?:^|[\s\-_/])(\d+(?:\.\d+)?)\s*B(?:\b|[\s\-_,]|$)/i);
  if (dense) {
    const n = Number(dense[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Llama 4 Scout / Maverick — known MoE active ~17B / ~17B-class (use conservative 17)
  if (/\bLlama\s*4\s+Scout\b/i.test(name)) return 17;
  if (/\bLlama\s*4\s+Maverick\b/i.test(name)) return 17;
  // Mistral Small family — ~22–24B dense (fits 24GB Q4, not 12)
  if (/\bMistral\s+Small\b/i.test(name)) return 24;
  // Mistral Medium / Large — ~100B+ class; not consumer 24GB Q4
  if (/\bMistral\s+Medium\b/i.test(name)) return 123;
  if (/\bMistral\s+Large\b/i.test(name)) return 123;
  // gpt-oss short tags without space before B (also caught by dense regex; keep explicit)
  const gptOss = name.match(/\bgpt-oss-(\d+)\s*b\b/i);
  if (gptOss) {
    const n = Number(gptOss[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Whether a model fits in `vramMaxGb` under Q4-class heuristics. */
export function fitsLocalVram(
  modelName: string,
  vramMaxGb: LocalVramGb,
): boolean {
  const tier = LOCAL_VRAM_TIERS.find((t) => t.vramMaxGb === vramMaxGb);
  if (!tier) return false;
  const paramsB = parseParamsBillions(modelName);
  if (paramsB == null) return false; // unknown size — exclude (fail-closed for local gate)
  return paramsB <= tier.maxParamsB + 1e-9;
}
