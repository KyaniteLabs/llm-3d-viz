/**
 * Visible-set filters for the model observatory.
 */

import type { Model } from "../data/models";
import { FORK_DEFAULTS } from "../config/fork-defaults";
import { familyIdOf } from "./family";

export interface ModelFilters {
  /** When true, drop models older than ageMonths before referenceDate. */
  ageEnabled: boolean;
  ageMonths: number;
  /**
   * When true (product default), only families with 2+ effort steps remain in the
   * visible set. Simon tastecheck fork 2026-08-04: multi-effort instrument first paint.
   */
  multiEffortOnly: boolean;
  /** Empty ≡ all providers. */
  providers: string[];
  /** Empty ≡ all families. */
  families: string[];
}

/** Product defaults — forker overrides live in `src/config/fork-defaults.ts`. */
export const DEFAULT_FILTERS: ModelFilters = {
  ageEnabled: FORK_DEFAULTS.ageFilterDefault,
  ageMonths: 6,
  multiEffortOnly: FORK_DEFAULTS.multiEffortOnlyDefault,
  providers: [],
  families: [],
};

export function sameFilters(a: ModelFilters, b: ModelFilters): boolean {
  if (a.ageEnabled !== b.ageEnabled || a.ageMonths !== b.ageMonths) return false;
  if (Boolean(a.multiEffortOnly) !== Boolean(b.multiEffortOnly)) return false;
  if (a.providers.length !== b.providers.length || a.families.length !== b.families.length) {
    return false;
  }
  const providersA = [...a.providers].sort();
  const providersB = [...b.providers].sort();
  const familiesA = [...a.families].sort();
  const familiesB = [...b.families].sort();
  return (
    providersA.every((v, i) => v === providersB[i]) && familiesA.every((v, i) => v === familiesB[i])
  );
}

function monthsBefore(reference: Date, months: number): Date {
  const d = new Date(reference.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

function parseReleaseDate(iso: string): Date | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * Pure filter over the catalog.
 * @param referenceDate injectable clock (tests use fixed ISO; product uses session wall date)
 */
export function applyFilters(
  models: readonly Model[],
  filters: ModelFilters,
  referenceDate: Date,
): Model[] {
  const providerSet =
    filters.providers.length === 0 ? null : new Set(filters.providers);
  const familySet = filters.families.length === 0 ? null : new Set(filters.families);
  const cutoff =
    filters.ageEnabled ? monthsBefore(referenceDate, filters.ageMonths) : null;

  // Precompute multi-effort family membership when the filter is on.
  // Explicit family picks win: if the analyst selected families (e.g. Claude Fable 5,
  // a singleton on AA), multi-effort-only must NOT zero the stage. The gate only
  // applies in browse mode (families empty ≡ all).
  let multiEffortFamilies: Set<string> | null = null;
  if (filters.multiEffortOnly && !familySet) {
    const counts = new Map<string, number>();
    for (const model of models) {
      const id = familyIdOf(model);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    multiEffortFamilies = new Set(
      [...counts.entries()].filter(([, n]) => n >= 2).map(([id]) => id),
    );
  }

  // Sentinel: explicit empty membership from filter shelf "None"
  if (filters.providers.includes("__none__")) return [];

  return models.filter((model) => {
    if (providerSet && !providerSet.has(model.provider)) return false;
    const fid = familyIdOf(model);
    if (familySet && !familySet.has(fid)) return false;
    if (multiEffortFamilies && !multiEffortFamilies.has(fid)) return false;
    if (cutoff) {
      const released = parseReleaseDate(model.release_date);
      if (!released || released < cutoff) return false;
    }
    return true;
  });
}

/** Distinct providers in catalog (sorted). */
export function listProviders(models: readonly Model[]): string[] {
  return [...new Set(models.map((m) => m.provider))].sort((a, b) => a.localeCompare(b));
}

/** Distinct family ids in catalog (sorted). */
export function listFamilies(models: readonly Model[]): string[] {
  return [...new Set(models.map((m) => familyIdOf(m)))].sort((a, b) => a.localeCompare(b));
}

/** Families that have 2+ rows (multi-effort curves), largest first then name. */
export function listMultiEffortFamilies(models: readonly Model[]): Array<{ family: string; count: number }> {
  const counts = new Map<string, number>();
  for (const model of models) {
    const id = familyIdOf(model);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}
