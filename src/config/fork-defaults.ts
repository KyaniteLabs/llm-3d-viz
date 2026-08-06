/**
 * Forker-facing product defaults (filters, Decide, density escapes).
 * Catalog data still lives under `data/`; brand colors under `src/viz/palette.ts` LAB_BRANDS.
 */
export interface ForkDefaults {
  /** Default intelligence floor in Decide mode (AA Index). */
  decideFloor: number;
  /** Default cost↔speed bias in Decide (−1 cheaper … +1 faster). */
  decideBias: number;
  /** Prefer multi-effort families in the default visible set. */
  multiEffortOnlyDefault: boolean;
  /** Age filter on by default. */
  ageFilterDefault: boolean;
  /** Age window in months when age filter is on. */
  ageMonthsDefault: number;
  /**
   * When true, brand ring/core on every mark (`?brand=full` also works).
   * Default false (Beauty P0): full lab *fill* always; rings/core focus-only.
   */
  brandLayersFullDefault: boolean;
}

export const FORK_DEFAULTS: ForkDefaults = {
  decideFloor: 50,
  decideBias: 0,
  multiEffortOnlyDefault: true,
  ageFilterDefault: true,
  ageMonthsDefault: 6,
  brandLayersFullDefault: false,
};
