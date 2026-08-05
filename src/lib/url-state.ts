/**
 * Shareable URL state for filters, axes, and value-score weights.
 *
 * Session-only (not encoded): hover, pin, cinema mode, transient cursor.
 *
 * Param schema (all optional; defaults match product landing):
 * - age=0|1          age filter off / on (default on, 6 months)
 * - providers=a,b    multi-select; empty ≡ all
 * - families=a,b     multi-select; empty ≡ all (comma-separated family_ids)
 * - ax=x,y,z         AxisMetricId triple for scene X/Y/Z
 * - w=s,c,i          raw weight triple speed,cost,intelligence
 * - heat=1 / stage= / enc=  already consumed at boot for renderer flags (left alone)
 * - enc=openness     legacy openness-primary fill (product default is curve-focus)
 * - catalog=all      full draft labs (default = cloud focus)
 * - me=0             show single-effort models (product default multi-effort only)
 */

import {
  DEFAULT_AXIS_MAPPING,
  isAxisMetricId,
  normalizeAxisMapping,
  type AxisMapping,
} from "./axis-metrics";
import { DEFAULT_FILTERS, type ModelFilters } from "./filters";
import { presets, type ScoreWeights } from "./score";

export interface ShareableState {
  filters: ModelFilters;
  axisMapping: AxisMapping;
  weights: ScoreWeights;
}

const listSep = ",";

function splitList(raw: string | null): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(listSep)
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);
}

function joinList(values: readonly string[]): string {
  return [...values]
    .map((v) => encodeURIComponent(v))
    .sort((a, b) => a.localeCompare(b))
    .join(listSep);
}

/** Parse shareable fields from a URLSearchParams / location.search. */
export function parseShareableState(
  search: string | URLSearchParams,
  base: Partial<ShareableState> = {},
): ShareableState {
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search : `?${search}`) : search;

  const filters: ModelFilters = {
    ...DEFAULT_FILTERS,
    ...(base.filters ?? {}),
    providers: [...(base.filters?.providers ?? DEFAULT_FILTERS.providers)],
    families: [...(base.filters?.families ?? DEFAULT_FILTERS.families)],
  };

  if (params.has("age")) {
    const age = params.get("age");
    filters.ageEnabled = age !== "0" && age !== "false";
  }
  if (params.has("providers")) {
    filters.providers = splitList(params.get("providers"));
  }
  if (params.has("families")) {
    filters.families = splitList(params.get("families"));
  }
  if (params.has("me")) {
    const me = params.get("me");
    filters.multiEffortOnly = me !== "0" && me !== "false";
  }

  let axisMapping = normalizeAxisMapping(base.axisMapping ?? DEFAULT_AXIS_MAPPING);
  const ax = params.get("ax");
  if (ax) {
    const parts = ax.split(listSep).map((s) => s.trim());
    if (parts.length === 3 && parts.every(isAxisMetricId)) {
      axisMapping = normalizeAxisMapping({
        x: parts[0],
        y: parts[1],
        z: parts[2],
      });
    }
  }

  let weights: ScoreWeights = { ...(base.weights ?? presets.chat) };
  const w = params.get("w");
  if (w) {
    const parts = w.split(listSep).map((s) => Number(s.trim()));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
      weights = { speed: parts[0], cost: parts[1], intelligence: parts[2] };
    }
  }

  return { filters, axisMapping, weights };
}

/** Serialize shareable state into query params (omit product defaults). */
export function serializeShareableState(
  state: ShareableState,
  existing?: URLSearchParams,
): URLSearchParams {
  const params = existing ? new URLSearchParams(existing) : new URLSearchParams();

  // Preserve renderer flags managed outside this module.
  const keep = ["stage", "heat", "debug", "enc", "catalog"];
  const preserved: Record<string, string> = {};
  for (const key of keep) {
    const v = params.get(key);
    if (v !== null) preserved[key] = v;
  }

  // Clear shareable keys then re-apply non-defaults.
  for (const key of ["age", "providers", "families", "ax", "w", "me"]) {
    params.delete(key);
  }
  for (const [key, value] of Object.entries(preserved)) {
    params.set(key, value);
  }

  if (!state.filters.ageEnabled) {
    params.set("age", "0");
  }
  // Product default multiEffortOnly=true; only serialize opt-out.
  if (!state.filters.multiEffortOnly) {
    params.set("me", "0");
  }
  if (state.filters.providers.length) {
    params.set("providers", joinList(state.filters.providers));
  }
  if (state.filters.families.length) {
    params.set("families", joinList(state.filters.families));
  }

  const defAxes = DEFAULT_AXIS_MAPPING;
  if (
    state.axisMapping.x !== defAxes.x ||
    state.axisMapping.y !== defAxes.y ||
    state.axisMapping.z !== defAxes.z
  ) {
    params.set(
      "ax",
      [state.axisMapping.x, state.axisMapping.y, state.axisMapping.z].join(listSep),
    );
  }

  const defW = presets.chat;
  if (
    state.weights.speed !== defW.speed ||
    state.weights.cost !== defW.cost ||
    state.weights.intelligence !== defW.intelligence
  ) {
    params.set(
      "w",
      [state.weights.speed, state.weights.cost, state.weights.intelligence]
        .map((n) => String(n))
        .join(listSep),
    );
  }

  return params;
}

/** Apply shareable state to the browser location without adding history entries. */
export function writeShareableUrl(state: ShareableState): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const params = serializeShareableState(state, new URLSearchParams(window.location.search));
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState(null, "", next);
  }
}
