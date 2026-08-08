/**
 * Visible-set filters for the model observatory.
 */

import type { Model } from "../data/models";
import { FORK_DEFAULTS } from "../config/fork-defaults";
import { familyIdOf, isNonReasoningEffortRow } from "./family";
import { fitsLocalVram, type LocalVramGb } from "./local-vram";

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
  /**
   * Open-weight gate for Local · N GB intents and filter shelf.
   * all = no openness filter; open/closed = keep only that class.
   */
  openness: "all" | "open" | "closed";
  /**
   * Local VRAM ceiling (GB): 8 | 12 | 24 (top-3 consumer tiers). null = no VRAM gate.
   * When set, keeps open-weight models whose name-parsed size fits Q4-class in this VRAM.
   */
  vramMaxGb: LocalVramGb | null;
  /**
   * When true (Simon product default), drop Non-reasoning / minimal effort rungs.
   * Low+ and bare Reasoning / unspecified models stay.
   */
  excludeNonReasoning: boolean;
}

/** Product defaults — forker overrides live in `src/config/fork-defaults.ts`. */
export const DEFAULT_FILTERS: ModelFilters = {
  ageEnabled: FORK_DEFAULTS.ageFilterDefault,
  ageMonths: FORK_DEFAULTS.ageMonthsDefault,
  multiEffortOnly: FORK_DEFAULTS.multiEffortOnlyDefault,
  providers: [],
  families: [],
  openness: "all",
  vramMaxGb: null,
  excludeNonReasoning: FORK_DEFAULTS.excludeNonReasoningDefault,
};

export function sameFilters(a: ModelFilters, b: ModelFilters): boolean {
  if (a.ageEnabled !== b.ageEnabled || a.ageMonths !== b.ageMonths) return false;
  if (Boolean(a.multiEffortOnly) !== Boolean(b.multiEffortOnly)) return false;
  if ((a.openness ?? "all") !== (b.openness ?? "all")) return false;
  if ((a.vramMaxGb ?? null) !== (b.vramMaxGb ?? null)) return false;
  if (Boolean(a.excludeNonReasoning) !== Boolean(b.excludeNonReasoning)) return false;
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
  const originalDay = d.getUTCDate();
  // setUTCDate(1) first so month subtraction never rolls over (e.g. Aug 31 − 6mo).
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  // Clamp the original day to the target month's last valid day.
  const daysInTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(originalDay, daysInTargetMonth));
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
  // Sentinel: explicit empty membership from filter shelf "None"
  if (filters.providers.includes("__none__")) return [];

  const providerSet =
    filters.providers.length === 0 ? null : new Set(filters.providers);
  const familySet = filters.families.length === 0 ? null : new Set(filters.families);
  const cutoff =
    filters.ageEnabled ? monthsBefore(referenceDate, filters.ageMonths) : null;
  const openness = filters.openness ?? "all";

  // Apply all non-multi-effort filters first, so that multi-effort family counts
  // reflect the post-exclusion candidate set (e.g. a family with one reasoning +
  // one non-reasoning row must NOT count as multi-effort after the non-reasoning
  // row is dropped).
  const candidateModels = models.filter((model) => {
    if (providerSet && !providerSet.has(model.provider)) return false;
    const fid = familyIdOf(model);
    if (familySet && !familySet.has(fid)) return false;
    if (openness === "open" && model.openness !== "open") return false;
    if (openness === "closed" && model.openness !== "closed") return false;
    if (filters.vramMaxGb != null) {
      if (model.openness !== "open") return false;
      if (!fitsLocalVram(model.model, filters.vramMaxGb)) return false;
    }
    if (filters.excludeNonReasoning && isNonReasoningEffortRow(model)) return false;
    if (cutoff) {
      const released = parseReleaseDate(model.release_date);
      if (!released || released < cutoff) return false;
    }
    return true;
  });

  // Precompute multi-effort family membership on the candidate set when the
  // filter is on. Explicit family picks win: if the analyst selected families
  // (e.g. Claude Fable 5, a singleton on AA), multi-effort-only must NOT zero
  // the stage. The gate only applies in browse mode (families empty ≡ all).
  //
  // Also keep *frontier singletons* (high Intelligence Index) so Fable / Grok 4.5 /
  // Muse Spark are not silently dropped just because AA only publishes one effort.
  const FRONTIER_SINGLETON_IQ = 48;
  if (!filters.multiEffortOnly || familySet) return candidateModels;

  const counts = new Map<string, number>();
  const maxIq = new Map<string, number>();
  for (const model of candidateModels) {
    const id = familyIdOf(model);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const iq = model.aa_intelligence_index;
    if (typeof iq === "number" && Number.isFinite(iq)) {
      maxIq.set(id, Math.max(maxIq.get(id) ?? -Infinity, iq));
    }
  }
  const multiEffortFamilies = new Set(
    [...counts.entries()]
      .filter(([id, n]) => n >= 2 || (maxIq.get(id) ?? -Infinity) >= FRONTIER_SINGLETON_IQ)
      .map(([id]) => id),
  );

  return candidateModels.filter((model) => multiEffortFamilies.has(familyIdOf(model)));
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
