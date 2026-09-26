/**
 * L3 — Living stage: catalog-arrival diff.
 *
 * On each load the current catalog id set is compared to a localStorage snapshot
 * from the previous visit. New ids become the "ignition" set: those marks pulse
 * once on first paint, then calm — so a returning analyst sees what changed
 * without ambient motion (spec law: spectacle only on data change, never idle).
 *
 * First visit (no baseline) = no pulse. The diff is a pure function; localStorage
 * I/O is a thin guarded wrapper so the core is unit-testable without a DOM.
 */

export interface CatalogSnapshot {
  ids: string[];
  /** ISO yyyy-mm-dd of the visit that wrote this snapshot. */
  date: string;
}

export interface CatalogDiff {
  /** ids present now but absent last visit. */
  newIds: string[];
  /** ids absent now but present last visit. */
  removedIds: string[];
  /** true when there is no prior baseline (first visit) — suppress pulse. */
  isFirstVisit: boolean;
}

export const CATALOG_SNAPSHOT_KEY = "llm3d:lastCatalog";

/**
 * Pure diff of the current catalog id set against the last-seen snapshot.
 * Order-preserving for newIds (stable ignition order).
 */
export function diffCatalog(
  currentIds: readonly string[],
  lastSeen: CatalogSnapshot | null,
): CatalogDiff {
  if (!lastSeen || lastSeen.ids.length === 0) {
    return { newIds: [], removedIds: [], isFirstVisit: true };
  }
  const last = new Set(lastSeen.ids);
  const cur = new Set(currentIds);
  const newIds = currentIds.filter((id) => !last.has(id));
  const removedIds = lastSeen.ids.filter((id) => !cur.has(id));
  return { newIds, removedIds, isFirstVisit: false };
}

/** Today's date as ISO yyyy-mm-dd (local), for snapshot stamping. */
export function todayISO(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Read the last-seen snapshot; null if absent / corrupt / localStorage unavailable. */
export function loadCatalogSnapshot(): CatalogSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CATALOG_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CatalogSnapshot>;
    if (!Array.isArray(parsed.ids) || typeof parsed.date !== "string") return null;
    return { ids: parsed.ids.filter((x): x is string => typeof x === "string"), date: parsed.date };
  } catch {
    return null;
  }
}

/** Persist the current catalog id set + today's date as the new baseline. */
export function saveCatalogSnapshot(currentIds: readonly string[], date: string = todayISO()): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CATALOG_SNAPSHOT_KEY, JSON.stringify({ ids: [...currentIds], date }));
  } catch {
    /* quota / private mode — non-fatal; next visit is treated as first-visit. */
  }
}
