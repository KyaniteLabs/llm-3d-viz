/**
 * Shareable URL state for filters, axes, value-score weights, and Decide mode.
 *
 * Session-only (not encoded): hover, pin, cinema mode, transient cursor.
 *
 * Param schema (all optional; defaults match product landing):
 * - age=0|1          age filter off / on (default on, 6 months)
 * - agem=<n>         age window in months (default 6; omitted when 6)
 * - providers=a,b    multi-select; empty ≡ all
 * - families=a,b     multi-select; empty ≡ all (comma-separated family_ids)
 * - fam=a,b          alias for families=
 * - ax=x,y,z         AxisMetricId triple for scene X/Y/Z
 * - w=s,c,i          raw weight triple speed,cost,intelligence
 * - decide=1         Decide mode on
 * - floor=<0..100>   intelligence floor (written when user-set or anchor, not default)
 * - bias=<-1..1>     cost/speed bias (omit when 0)
 * - anchor=<modelId> floor anchor (when set, floor number is resolved Index)
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
import {
  clampBias,
  clampFloor,
  DEFAULT_COST_SPEED_BIAS,
  DEFAULT_INTELLIGENCE_FLOOR,
  type FloorSource,
} from "./decide";
import { DEFAULT_FILTERS, type ModelFilters } from "./filters";
import { presets, type ScoreWeights } from "./score";

export interface ShareableDecideState {
  decideMode: boolean;
  intelligenceFloor: number;
  costSpeedBias: number;
  floorAnchorModelId: string | null;
  floorSource: FloorSource;
  floorUserSet: boolean;
}

export interface ShareableState {
  filters: ModelFilters;
  axisMapping: AxisMapping;
  weights: ScoreWeights;
  decide: ShareableDecideState;
}

export const DEFAULT_DECIDE_SHARE: ShareableDecideState = {
  decideMode: false,
  intelligenceFloor: DEFAULT_INTELLIGENCE_FLOOR,
  costSpeedBias: DEFAULT_COST_SPEED_BIAS,
  floorAnchorModelId: null,
  floorSource: "default",
  floorUserSet: false,
};

const listSep = ",";

function splitList(raw: string | null): string[] {
  if (!raw || !raw.trim()) return [];
  // joinList() percent-encodes each token (so the list comma survives), then
  // URLSearchParams re-encodes on serialize. URLSearchParams.get() decodes once,
  // so a second guarded decodeURIComponent restores the original token. The guard
  // preserves raw (e.g. a hand-typed "50%off") when "%" is not a valid escape.
  return raw
    .split(listSep)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      try {
        return decodeURIComponent(token);
      } catch {
        return token;
      }
    });
}

function joinList(values: readonly string[]): string {
  return [...values]
    .map((v) => encodeURIComponent(v))
    .sort((a, b) => a.localeCompare(b))
    .join(listSep);
}

/**
 * Resolve decide fields from URL using B2 rules when a catalog is provided for anchors.
 * Without catalog, anchor is kept as id and floor number is taken from query if present.
 */
export function parseDecideFromParams(
  params: URLSearchParams,
  opts?: {
    /** Product or visible catalog for anchor resolution. */
    catalog?: readonly { model: string; aa_intelligence_index: number | null }[];
  },
): ShareableDecideState {
  const decideMode = params.get("decide") === "1" || params.get("decide") === "true";
  let intelligenceFloor = DEFAULT_INTELLIGENCE_FLOOR;
  let costSpeedBias = DEFAULT_COST_SPEED_BIAS;
  let floorAnchorModelId: string | null = null;
  let floorSource: FloorSource = "default";
  let floorUserSet = false;

  if (params.has("bias")) {
    costSpeedBias = clampBias(Number(params.get("bias")));
  }

  const anchorRaw = params.get("anchor");
  const floorRaw = params.has("floor") ? Number(params.get("floor")) : null;
  const catalog = opts?.catalog;

  if (anchorRaw && anchorRaw.trim()) {
    const id = anchorRaw.trim();
    const row = catalog?.find((m) => m.model === id);
    if (row && row.aa_intelligence_index != null) {
      floorAnchorModelId = id;
      intelligenceFloor = clampFloor(row.aa_intelligence_index);
      floorSource = "anchor";
      floorUserSet = true;
    } else if (!catalog) {
      // Catalog not available at parse time — keep id; floor from query if any.
      floorAnchorModelId = id;
      if (floorRaw != null && Number.isFinite(floorRaw)) {
        intelligenceFloor = clampFloor(floorRaw);
      }
      floorSource = "anchor";
      floorUserSet = true;
    } else if (floorRaw != null && Number.isFinite(floorRaw)) {
      // Unknown anchor → ignore anchor, use floor as user.
      floorAnchorModelId = null;
      intelligenceFloor = clampFloor(floorRaw);
      floorSource = "user";
      floorUserSet = true;
    }
  } else if (floorRaw != null && Number.isFinite(floorRaw)) {
    intelligenceFloor = clampFloor(floorRaw);
    floorSource = "user";
    floorUserSet = true;
  } else if (decideMode) {
    intelligenceFloor = DEFAULT_INTELLIGENCE_FLOOR;
    floorSource = "default";
    floorUserSet = false;
  }

  return {
    decideMode,
    intelligenceFloor,
    costSpeedBias,
    floorAnchorModelId,
    floorSource,
    floorUserSet,
  };
}

/** Parse shareable fields from a URLSearchParams / location.search. */
export function parseShareableState(
  search: string | URLSearchParams,
  base: Partial<ShareableState> = {},
  opts?: { catalog?: readonly { model: string; aa_intelligence_index: number | null }[] },
): ShareableState {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search : `?${search}`)
      : search;

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
  const ageMonthsRaw = params.get("agem");
  if (ageMonthsRaw) {
    const am = Number(ageMonthsRaw);
    if (Number.isFinite(am) && am > 0 && am <= 60) {
      filters.ageMonths = am;
    }
  }
  if (params.has("providers")) {
    filters.providers = splitList(params.get("providers"));
  }
  if (params.has("families") || params.has("fam")) {
    filters.families = splitList(params.get("families") ?? params.get("fam"));
  }
  if (params.has("me")) {
    const me = params.get("me");
    filters.multiEffortOnly = me !== "0" && me !== "false";
  }
  if (params.has("open") || params.has("openness")) {
    const o = (params.get("open") ?? params.get("openness") ?? "all").toLowerCase();
    filters.openness = o === "open" || o === "1" || o === "true" ? "open" : o === "closed" ? "closed" : "all";
  }
  if (params.has("vram")) {
    const v = Number(params.get("vram"));
    filters.vramMaxGb = v === 8 || v === 12 || v === 24 ? v : null;
    if (filters.vramMaxGb != null) filters.openness = "open";
  }
  // nr=1 → include Non-reasoning rungs; default product excludes them.
  if (params.has("nr")) {
    const nr = (params.get("nr") ?? "").toLowerCase();
    filters.excludeNonReasoning = nr === "0" || nr === "false" || nr === "off";
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
      // Cap each weight at 100 to prevent Infinity totals from extreme values (e.g. 1e308).
      weights = {
        speed: Math.min(100, parts[0]),
        cost: Math.min(100, parts[1]),
        intelligence: Math.min(100, parts[2]),
      };
    }
  }

  const decide = parseDecideFromParams(params, { catalog: opts?.catalog });

  return { filters, axisMapping, weights, decide };
}

/** Serialize shareable state into query params (omit product defaults). */
export function serializeShareableState(
  state: ShareableState,
  existing?: URLSearchParams,
): URLSearchParams {
  const params = existing ? new URLSearchParams(existing) : new URLSearchParams();

  const keep = ["stage", "heat", "debug", "enc", "catalog"];
  const preserved: Record<string, string> = {};
  for (const key of keep) {
    const v = params.get(key);
    if (v !== null) preserved[key] = v;
  }

  for (const key of [
    "age",
    "agem",
    "providers",
    "families",
    "ax",
    "w",
    "me",
    "decide",
    "floor",
    "bias",
    "anchor",
    "open",
    "openness",
    "vram",
    "nr",
    "fam",
  ]) {
    params.delete(key);
  }
  for (const [key, value] of Object.entries(preserved)) {
    params.set(key, value);
  }

  if (!state.filters.ageEnabled) {
    params.set("age", "0");
  }
  if (state.filters.ageMonths != null && state.filters.ageMonths !== 6) {
    params.set("agem", String(state.filters.ageMonths));
  }
  if (!state.filters.multiEffortOnly) {
    params.set("me", "0");
  }
  if (state.filters.providers.length) {
    params.set("providers", joinList(state.filters.providers));
  }
  if (state.filters.families.length) {
    params.set("families", joinList(state.filters.families));
  }
  if (state.filters.openness === "open") {
    params.set("open", "1");
  } else if (state.filters.openness === "closed") {
    params.set("open", "closed");
  }
  if (state.filters.vramMaxGb === 8 || state.filters.vramMaxGb === 12 || state.filters.vramMaxGb === 24) {
    params.set("vram", String(state.filters.vramMaxGb));
  }
  if (state.filters.excludeNonReasoning === false) {
    params.set("nr", "1");
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

  const d = state.decide ?? DEFAULT_DECIDE_SHARE;
  if (d.decideMode) {
    params.set("decide", "1");
  }
  // Serialize user-set floor/bias/anchor independently of decideMode so turning
  // Decide off for Explore does not silently drop the configured setup on share.
  if (d.floorUserSet || d.floorAnchorModelId) {
    params.set("floor", String(clampFloor(d.intelligenceFloor)));
  }
  if (d.floorAnchorModelId) {
    params.set("anchor", d.floorAnchorModelId);
  }
  if (d.costSpeedBias !== DEFAULT_COST_SPEED_BIAS) {
    params.set("bias", String(clampBias(d.costSpeedBias)));
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
