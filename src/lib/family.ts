/**
 * Family identity + effort-tier helpers for multi-effort trails.
 */

import type { Model } from "../data/models";

/** Ordered ranks for effort intensity (low → high). Unknowns sort last. */
export const EFFORT_RANK: Readonly<Record<string, number>> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  max: 4,
  xhigh: 5,
  default: 3,
};

/**
 * Derive a stable family_id from a curated model name by stripping common
 * effort / reasoning suffixes (parenthetical tiers, "reasoning", etc.).
 */
export function deriveFamilyId(modelName: string): string {
  let name = modelName.trim();
  // Strip trailing parenthetical effort markers: (max), (high), (xhigh), (Reasoning), …
  name = name.replace(
    /\s*\((?:xhigh|max|high|medium|low|default|reasoning|non-reasoning|thinking|adaptive reasoning)[^)]*\)\s*$/i,
    "",
  );
  // Strip trailing bare effort words after hyphen/space
  name = name.replace(/\s*[-–]?\s*(xhigh|max effort|max|high|medium|low)\s*$/i, "");
  name = name.replace(/\s+/g, " ").trim();
  return name.length > 0 ? name : modelName.trim();
}

/** Parse effort tier from structured field or name heuristics. */
export function deriveEffortTier(model: Pick<Model, "model" | "effort_tier" | "reasoning">): string {
  if (model.effort_tier && model.effort_tier.trim()) return model.effort_tier.trim().toLowerCase();
  const lower = model.model.toLowerCase();
  if (/\(xhigh\)|\bxhigh\b/.test(lower)) return "xhigh";
  if (/\(max\)|\bmax effort\b|\bmax\b/.test(lower)) return "max";
  if (/\(high\)|\bhigh\b/.test(lower)) return "high";
  if (/\(medium\)|\bmedium\b|\bmid\b/.test(lower)) return "medium";
  if (/\(low\)|\blow\b/.test(lower)) return "low";
  if (model.reasoning) return "default";
  return "none";
}

export function effortRank(tier: string): number {
  const key = tier.toLowerCase();
  return EFFORT_RANK[key] ?? 50;
}

export function familyIdOf(model: Model): string {
  return (model.family_id && model.family_id.trim()) || deriveFamilyId(model.model);
}

/** Group models by family; each group sorted by effort rank then name. */
export function groupByFamily(models: readonly Model[]): Map<string, Model[]> {
  const map = new Map<string, Model[]>();
  for (const model of models) {
    const id = familyIdOf(model);
    const list = map.get(id) ?? [];
    list.push(model);
    map.set(id, list);
  }
  for (const [, list] of map) {
    list.sort(
      (a, b) =>
        effortRank(deriveEffortTier(a)) - effortRank(deriveEffortTier(b)) ||
        a.model.localeCompare(b.model),
    );
  }
  return map;
}
