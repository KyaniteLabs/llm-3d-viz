/**
 * OpenRouter overlay telemetry (plan WS6, audit M3) — report-only.
 *
 * Reuses the production matcher (buildOpenRouterIndex / matchOpenRouterModel
 * from catalog-join.mjs, unmodified) over the same merged rows the overlays
 * ran on, so the match-rate histogram reflects real matching behavior without
 * changing it. Overlay attach counts (price/modality/context) are surfaced by
 * the caller from the overlay results themselves.
 *
 * Pure functions — no network, no input mutation.
 */
import { buildOpenRouterIndex, matchOpenRouterModel } from "./catalog-join.mjs";

/**
 * Match-rate histogram for the OpenRouter overlays: how many merged rows the
 * matcher resolves, and — for the rows it does not — a provider histogram that
 * tells us whether context/modality null-coverage is fixable by org-map growth.
 *
 * @param {object[]} mergedRows — post-overlay in-memory rows (identity is
 *   unchanged by the overlays, so post- == pre- match results)
 * @param {object[]} orModels — OpenRouter /api/v1/models entries
 */
export function buildOrOverlayTelemetry(mergedRows, orModels) {
  const index = buildOpenRouterIndex(orModels);
  let matched = 0;
  let unmatched = 0;
  const unmatchedByProvider = new Map();
  for (const row of mergedRows ?? []) {
    if (matchOpenRouterModel(row, index)) {
      matched += 1;
      continue;
    }
    unmatched += 1;
    const provider = String(row?.provider || "Unknown");
    unmatchedByProvider.set(provider, (unmatchedByProvider.get(provider) || 0) + 1);
  }
  return {
    rows_total: matched + unmatched,
    rows_matched: matched,
    rows_unmatched: unmatched,
    unmatched_by_provider: [...unmatchedByProvider.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([provider, count]) => ({ provider, count })),
  };
}
