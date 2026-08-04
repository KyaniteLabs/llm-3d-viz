/**
 * Visible-set filters for the model observatory.
 */

import type { Model } from "../data/models";
import { familyIdOf } from "./family";

export interface ModelFilters {
  /** When true, drop models older than ageMonths before referenceDate. */
  ageEnabled: boolean;
  ageMonths: number;
  /** Empty ≡ all providers. */
  providers: string[];
  /** Empty ≡ all families. */
  families: string[];
}

export const DEFAULT_FILTERS: ModelFilters = {
  ageEnabled: true,
  ageMonths: 6,
  providers: [],
  families: [],
};

export function sameFilters(a: ModelFilters, b: ModelFilters): boolean {
  if (a.ageEnabled !== b.ageEnabled || a.ageMonths !== b.ageMonths) return false;
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

  return models.filter((model) => {
    if (providerSet && !providerSet.has(model.provider)) return false;
    if (familySet && !familySet.has(familyIdOf(model))) return false;
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
