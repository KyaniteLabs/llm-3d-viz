/**
 * Family identity + effort-tier helpers for multi-effort trails.
 * Pure derivation lives in family-effort.shared.mjs (shared with expand scripts).
 */

import type { Model } from "../data/models";
import {
  deriveFamilyId as deriveFamilyIdShared,
  deriveEffortTierFromName,
  normalizeFamily,
  normalizeProvider,
  lastSlugSegment,
} from "./family-effort.shared";

export { normalizeFamily, normalizeProvider, lastSlugSegment };

/** Ordered ranks for effort intensity (low → high). Unknowns sort last. */
export const EFFORT_RANK: Readonly<Record<string, number>> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  max: 4,
  xhigh: 5,
  minimal: 1,
  default: 3,
};

/**
 * Derive a stable family_id from a curated model name by stripping common
 * effort / reasoning suffixes (parenthetical tiers, "reasoning", etc.).
 */
export function deriveFamilyId(modelName: string): string {
  return deriveFamilyIdShared(modelName);
}

/** Parse effort tier from structured field or name heuristics. */
export function deriveEffortTier(
  model: Pick<Model, "model" | "effort_tier" | "reasoning">,
): string {
  if (model.effort_tier && model.effort_tier.trim()) return model.effort_tier.trim().toLowerCase();
  return deriveEffortTierFromName(model.model, Boolean(model.reasoning));
}

export function effortRank(tier: string): number {
  const key = tier.toLowerCase();
  return EFFORT_RANK[key] ?? 50;
}

/**
 * True for Non-reasoning / no-thinking effort rungs Simon does not use.
 * Keeps:
 *  - explicit low / medium / high / max / xhigh
 *  - bare "(Reasoning)" rows (catalog often tags effort_tier none wrongly)
 *  - unspecified single-shot models with no effort ladder in the name
 * Drops:
 *  - any name with Non-reasoning (including "Non-reasoning, High Effort")
 *  - effort_tier minimal (below Low)
 */
export function isNonReasoningEffortRow(
  model: Pick<Model, "model" | "effort_tier" | "reasoning">,
): boolean {
  const name = model.model ?? "";
  if (/\bnon[\s-]?reasoning\b/i.test(name)) return true;
  const tier = deriveEffortTier(model);
  if (tier === "minimal") return true;
  return false;
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
