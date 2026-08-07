/**
 * S+ W5 cinema density: focus-set so export is not full-catalog confetti.
 * Mandatory: frontier ∪ optimum ∪ selected ∪ decide shortlist ∪ solo-family members.
 * Then fill with top value-score until size reaches max(K, mandatoryCount).
 * Non-focus marks are dimmed by the stage (not removed from axes).
 */
import type { Model } from "../data/models";
import { frontier } from "./pareto";
import { normalizedScores, weightedOptimum, type ScoreWeights } from "./score";

export const CINEMA_FOCUS_K = 12;

export function computeCinemaFocusIds(
  models: readonly Model[],
  weights: ScoreWeights,
  opts?: {
    selectedId?: string | null;
    decideShortlistIds?: readonly string[] | null;
    k?: number;
  },
): Set<string> {
  const k = opts?.k ?? CINEMA_FOCUS_K;
  const ids = new Set<string>();
  for (const m of frontier(models)) ids.add(m.model);
  // Compute scores once — this runs every render for the D10 label focus-set.
  const scores = normalizedScores(models, weights, models);
  const opt = weightedOptimum(scores)?.model;
  if (opt) ids.add(opt.model);
  if (opts?.selectedId) ids.add(opts.selectedId);
  if (opts?.decideShortlistIds) {
    for (const id of opts.decideShortlistIds) ids.add(id);
  }
  const target = Math.max(k, ids.size);
  if (ids.size >= target) return ids;
  const ranked = scores
    .slice()
    .sort((a, b) => b.score - a.score || a.model.model.localeCompare(b.model.model));
  for (const row of ranked) {
    if (ids.size >= target) break;
    ids.add(row.model.model);
  }
  return ids;
}

export function addFamilyMembers(
  focus: Set<string>,
  models: readonly Model[],
  familyId: string,
  familyOf: (m: Model) => string,
): void {
  for (const m of models) {
    if (familyOf(m) === familyId) focus.add(m.model);
  }
}
