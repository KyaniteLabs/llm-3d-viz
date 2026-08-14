/**
 * Draft diff engine (plan WS1 / audit H5) — row-level previous→next diff by
 * spine key, with rename pairing so AA-side renames and manual→AA supersedes
 * don't read as removals. Pure; persisted by expand as
 * data/catalog-diff.generated.json (inside the atomic write batch).
 */
import { spineKey } from "./catalog-join.mjs";
import { normalizeFamily } from "../../src/lib/family-effort.shared.ts";

export const PRICE_DELTA_THRESHOLD = 0.1;

function brief(row) {
  return {
    model: row?.model,
    provider: row?.provider,
    family_id: row?.family_id ?? null,
    release_date: row?.release_date ?? null,
  };
}

/**
 * @param {object[]|null|undefined} prevRows — previous draft (null when absent/unreadable)
 * @param {object[]} nextRows — new admitted draft
 */
export function diffDrafts(prevRows, nextRows) {
  if (!Array.isArray(prevRows) || !Array.isArray(nextRows)) {
    return { available: false, added: [], removed: [], renamed: [], price_deltas: [], counts: null };
  }
  const prev = new Map(prevRows.map((r) => [spineKey(r), r]));
  const next = new Map(nextRows.map((r) => [spineKey(r), r]));

  const addedKeys = [...next.keys()].filter((k) => !prev.has(k));
  const removedKeys = [...prev.keys()].filter((k) => !next.has(k));

  // Rename pairing: removed × added with same provider + same normalized family
  // AND same effort tier. Tier-equality matters: a cloud lab dropping "X (max)"
  // while adding "X (high)" is a tier retirement, not a rename — it must surface
  // as a removal + add (cloud_removal alert), never be absorbed as a rename.
  // Covers AA renames like "Ling-3.0-flash"→"Ling 3.0 Flash" (tier "none" both)
  // and manual→AA supersede (z.ai glm-5.3 max → artificialanalysis glm-5-3 max).
  const renamed = [];
  const pairedAdded = new Set();
  const pairedRemoved = new Set();
  for (const rk of removedKeys) {
    const rem = prev.get(rk);
    const remFam = normalizeFamily(rem.family_id || rem.model || "");
    if (!remFam) continue;
    const remTier = String(rem.effort_tier || "none").toLowerCase();
    for (const ak of addedKeys) {
      if (pairedAdded.has(ak)) continue;
      const add = next.get(ak);
      if (add.provider !== rem.provider) continue;
      if (String(add.effort_tier || "none").toLowerCase() !== remTier) continue;
      if (normalizeFamily(add.family_id || add.model || "") !== remFam) continue;
      renamed.push({ from: rem.model, to: add.model, provider: rem.provider });
      pairedAdded.add(ak);
      pairedRemoved.add(rk);
      break;
    }
  }

  const price_deltas = [];
  for (const [k, n] of next) {
    const p = prev.get(k);
    if (!p) continue;
    for (const field of ["price_in_per_M", "price_out_per_M", "blended_price_per_M"]) {
      const a = p[field];
      const b = n[field];
      if (typeof a !== "number" || a <= 0 || typeof b !== "number" || b < 0) continue;
      const delta = Math.abs(b - a) / a;
      if (delta > PRICE_DELTA_THRESHOLD) {
        price_deltas.push({
          model: n.model,
          provider: n.provider,
          field,
          from: a,
          to: b,
          pct: Math.round(delta * 100),
        });
      }
    }
  }

  const added = addedKeys.filter((k) => !pairedAdded.has(k)).map((k) => brief(next.get(k)));
  const removed = removedKeys.filter((k) => !pairedRemoved.has(k)).map((k) => brief(prev.get(k)));
  return {
    available: true,
    added,
    removed,
    renamed,
    price_deltas,
    counts: {
      added: added.length,
      removed: removed.length,
      renamed: renamed.length,
      price_deltas: price_deltas.length,
    },
  };
}
