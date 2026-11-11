/**
 * Intelligence-floor decision mode (map #128 / SPEC #137 / B′).
 * Floor = intelligence score; pick pool needs cost (+ speed when measured);
 * cost×speed Pareto + bias shortlist, or the cost×intelligence front when no speed is measured.
 * `intelligence` is the ranking axis; the site's `aa_intelligence_index` field is read as a fallback.
 */
import type { Model } from "../data/models";
import { FORK_DEFAULTS } from "../config/fork-defaults";

/** Forker override: `src/config/fork-defaults.ts` → decideFloor. */
export const DEFAULT_INTELLIGENCE_FLOOR = FORK_DEFAULTS.decideFloor;
/** Forker override: `src/config/fork-defaults.ts` → decideBias. */
export const DEFAULT_COST_SPEED_BIAS = FORK_DEFAULTS.decideBias;
export const DEFAULT_SHORTLIST_N = 3;

/** −1 = prefer cheaper, +1 = prefer faster, 0 = balanced on Pareto. */
export type CostSpeedBias = number;

/** v1 floor provenance (no prior / ai_confirmed until train 2). */
export type FloorSource = "user" | "anchor" | "default";

export interface DecideRequestV1 {
  schema_version: "1.0";
  floor: {
    intelligence: number;
    anchor_model_id: string | null;
  };
  cost_speed_bias: number;
  task_tag: string | null;
  shortlist_n: number;
}

export interface DecideShortlistEntry {
  id: string;
  rank: number;
  reasons: string[];
}

export interface DecideResponseV1 {
  schema_version: "1.0";
  floor_applied: {
    intelligence: number;
    source: FloorSource;
  };
  /** "cost_speed" when every candidate has a measured speed, else "cost" (speed not measured yet). */
  mode: DecideMode;
  eligible_ids: string[];
  pareto_ids: string[];
  shortlist: DecideShortlistEntry[];
  catalog_snapshot_id: string;
  refusals: string[];
}

export type DecideMode = "cost_speed" | "cost";

const finiteNonNeg = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Intelligence score: `intelligence`, else the deprecated site field `aa_intelligence_index`. */
export function intelligenceOf(model: Model): number | null {
  const m = model as unknown as { intelligence?: number | null; aa_intelligence_index?: number | null };
  const v = m.intelligence ?? m.aa_intelligence_index;
  return v === undefined ? null : v;
}

export function hasSpeed(model: Model): boolean {
  return finiteNonNeg(model.tps);
}

/** Price + intelligence finite and >= 0; tps too unless needSpeed is false. */
export function isScorable(model: Model, needSpeed = true): boolean {
  return (
    finiteNonNeg(model.blended_price_per_M) &&
    finiteNonNeg(intelligenceOf(model)) &&
    (!needSpeed || finiteNonNeg(model.tps))
  );
}

export function clampFloor(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_INTELLIGENCE_FLOOR;
  return Math.min(100, Math.max(0, n));
}

export function clampBias(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(-1, n));
}

/** Has Index (may still lack cost/speed — atlas only). */
export function hasIntelligence(model: Model): boolean {
  const v = intelligenceOf(model);
  return v !== null && Number.isFinite(v);
}

/** Pick-surface eligible: Index ≥ floor and scorable cost+speed (isScorable). */
export function isPickEligible(model: Model, floor: number, needSpeed = true): boolean {
  if (!isScorable(model, needSpeed)) return false;
  return (intelligenceOf(model) as number) >= clampFloor(floor);
}

export function filterPickEligible(models: readonly Model[], floor: number, needSpeed = true): Model[] {
  return models.filter((m) => isPickEligible(m, floor, needSpeed));
}

/** 2D dominance on cost (min) × speed/tps (max) among pick-eligible models. */
export function dominatesCostSpeed(a: Model, b: Model): boolean {
  if (!isScorable(a) || !isScorable(b)) return false;
  // Full precision: rounding here let a model costing 4.9x more beat the cheapest.
  const aCost = a.blended_price_per_M!;
  const bCost = b.blended_price_per_M!;
  const aSpeed = a.tps!;
  const bSpeed = b.tps!;
  const atLeast = aCost <= bCost && aSpeed >= bSpeed;
  const strict = aCost < bCost || aSpeed > bSpeed;
  return atLeast && strict;
}

export function costSpeedPareto(models: readonly Model[]): Model[] {
  const valid = models.filter((m) => isScorable(m));
  return valid.filter((c) => !valid.some((o) => o !== c && dominatesCostSpeed(o, c)));
}

/** No-speed front: cost (min) × intelligence (max); nothing else beats a member on both. */
export function costIntelligencePareto(models: readonly Model[]): Model[] {
  const valid = models.filter((m) => isScorable(m, false));
  const dominates = (a: Model, b: Model) => {
    const ac = a.blended_price_per_M!, bc = b.blended_price_per_M!;
    const ai = intelligenceOf(a)!, bi = intelligenceOf(b)!;
    return ac <= bc && ai >= bi && (ac < bc || ai > bi);
  };
  return valid.filter((c) => !valid.some((o) => o !== c && dominates(o, c)));
}

/**
 * Rank Pareto members for shortlist.
 * bias −1 → cheaper first; +1 → faster first; 0 → balance (normalized cost+speed).
 */
export function rankParetoByBias(
  pareto: readonly Model[],
  bias: CostSpeedBias,
  axis: "tps" | "intelligence" = "tps",
): Model[] {
  const b = clampBias(bias);
  if (pareto.length === 0) return [];
  const other = (m: Model): number => (axis === "intelligence" ? intelligenceOf(m)! : m.tps!);
  const costs = pareto.map((m) => m.blended_price_per_M!);
  const speeds = pareto.map(other);
  const minC = Math.min(...costs);
  const maxC = Math.max(...costs);
  const minS = Math.min(...speeds);
  const maxS = Math.max(...speeds);
  const spanC = maxC - minC || 1;
  const spanS = maxS - minS || 1;

  const scored = pareto.map((m) => {
    const cheapScore = (maxC - m.blended_price_per_M!) / spanC;
    const fastScore = (other(m) - minS) / spanS;
    const wFast = (b + 1) / 2;
    const wCheap = 1 - wFast;
    const score = wCheap * cheapScore + wFast * fastScore;
    return { m, score };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.m.blended_price_per_M! - b.m.blended_price_per_M! ||
      other(b.m) - other(a.m) ||
      a.m.model.localeCompare(b.m.model),
  );
  return scored.map((s) => s.m);
}

export function shortlistFromDecide(
  models: readonly Model[],
  floor: number,
  bias: CostSpeedBias,
  n = DEFAULT_SHORTLIST_N,
): { eligible: Model[]; pareto: Model[]; shortlist: Model[]; mode: DecideMode } {
  const safeN = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SHORTLIST_N;
  const eligible = filterPickEligible(models, floor, false);
  const mode = decideMode(eligible);
  const pareto = mode === "cost_speed" ? costSpeedPareto(eligible) : costIntelligencePareto(eligible);
  const ranked = rankParetoByBias(pareto, bias, mode === "cost_speed" ? "tps" : "intelligence");
  const shortlist = ranked.slice(0, safeN);
  return { eligible, pareto, shortlist, mode };
}

/** "cost_speed" when every candidate has a measured speed, else "cost". */
export function decideMode(eligible: readonly Model[]): DecideMode {
  return eligible.length > 0 && eligible.every(hasSpeed) ? "cost_speed" : "cost";
}

export function floorFromAnchor(models: readonly Model[], anchorModelId: string): number | null {
  const row = models.find((m) => m.model === anchorModelId);
  if (!row) return null;
  const idx = intelligenceOf(row);
  // Fail-closed provenance: only a measured, physically valid Index [0,100]
  // may be labeled anchor-derived. Clamp only user-entered floors (clampFloor),
  // never source data — an out-of-range/NaN/Infinity anchor yields null so the
  // UI falls back to a default rather than falsifying the provenance label.
  if (idx === null || !Number.isFinite(idx) || idx < 0 || idx > 100) return null;
  return idx;
}

/** Canonical catalog payload for snapshot hashing (stable row order). */
export function catalogSnapshotPayload(productCatalog: readonly Model[]): string {
  return productCatalog
    .map(
      (m) =>
        [
          m.model,
          intelligenceOf(m) ?? "",
          m.tps ?? "",
          m.blended_price_per_M ?? "",
          m.data_date ?? "",
        ].join("|"),
    )
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
}

/** FNV-1a 32-bit stand-in when Web Crypto is unavailable (HTTP / non-secure contexts). */
function catalogSnapshotIdFnv(payload: string): string {
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cat_${(h >>> 0).toString(16).padStart(8, "0")}${(payload.length >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Stable content id for the **product catalog** (post catalog-scope, pre shelf filters).
 * SHA-256, first 16 hex chars, `cat_` prefix when `crypto.subtle` exists.
 * Falls back to deterministic FNV on HTTP / non-secure contexts (no throw — boot must not die).
 */
export async function catalogSnapshotId(productCatalog: readonly Model[]): Promise<string> {
  const payload = catalogSnapshotPayload(productCatalog);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return catalogSnapshotIdFnv(payload);
  }
  try {
    const data = new TextEncoder().encode(payload);
    const buf = await subtle.digest("SHA-256", data);
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `cat_${hex.slice(0, 16)}`;
  } catch {
    return catalogSnapshotIdFnv(payload);
  }
}

/** Sync fallback only for pure tests that inject a precomputed id — prefer catalogSnapshotId. */
export function catalogSnapshotIdSyncForTests(productCatalog: readonly Model[]): string {
  return catalogSnapshotIdFnv(catalogSnapshotPayload(productCatalog));
}

export function buildDecideResponse(
  /** Visible set (shelf-filtered) for eligibility / shortlist. */
  visibleModels: readonly Model[],
  opts: {
    floor: number;
    bias: CostSpeedBias;
    anchorModelId?: string | null;
    floorSource: FloorSource;
    shortlistN?: number;
    /** Required on export path — product catalog snapshot, not visibleSet. */
    catalogSnapshotId: string;
  },
): DecideResponseV1 {
  const floor = clampFloor(opts.floor);
  // Clamp bias ONCE and reuse it for ranking, request output, AND reason
  // labeling so the exported reasons can never disagree with the numeric
  // authority (e.g. raw bias=Infinity clamps to 0 → "bias_balanced", not "bias_fast").
  const bias = clampBias(opts.bias);
  const { eligible, pareto, shortlist, mode } = shortlistFromDecide(
    visibleModels,
    floor,
    bias,
    opts.shortlistN ?? DEFAULT_SHORTLIST_N,
  );
  const refusals: string[] = [];
  if (eligible.length === 0) {
    refusals.push("no_pick_eligible_models");
  }
  const snap = opts.catalogSnapshotId?.trim() || "";
  if (!snap || snap === "local") {
    throw new Error("buildDecideResponse requires non-local catalogSnapshotId");
  }
  return {
    schema_version: "1.0",
    floor_applied: {
      intelligence: floor,
      source: opts.floorSource,
    },
    mode,
    eligible_ids: eligible.map((m) => m.model),
    pareto_ids: pareto.map((m) => m.model),
    shortlist: shortlist.map((m, i) => ({
      id: m.model,
      rank: i + 1,
      reasons: [
        mode === "cost_speed" ? "on_pareto" : "on_cost_front",
        bias < -0.25 ? "bias_cheap" : bias > 0.25 ? "bias_fast" : "bias_balanced",
      ],
    })),
    catalog_snapshot_id: snap,
    refusals,
  };
}

export function decideRequestFromState(opts: {
  floor: number;
  bias: CostSpeedBias;
  anchorModelId?: string | null;
  shortlistN?: number;
}): DecideRequestV1 {
  return {
    schema_version: "1.0",
    floor: {
      intelligence: clampFloor(opts.floor),
      anchor_model_id: opts.anchorModelId ?? null,
    },
    cost_speed_bias: clampBias(opts.bias),
    task_tag: null,
    shortlist_n: opts.shortlistN ?? DEFAULT_SHORTLIST_N,
  };
}
