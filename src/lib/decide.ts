/**
 * Intelligence-floor decision mode (map #128 / SPEC #137 / B′).
 * Floor = AA Index; pick pool needs cost+speed; cost×speed Pareto + bias shortlist.
 */
import { isScorable, type Model } from "../data/models";
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
    aa_intelligence_index: number;
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
    aa_intelligence_index: number;
    source: FloorSource;
  };
  eligible_ids: string[];
  pareto_ids: string[];
  shortlist: DecideShortlistEntry[];
  catalog_snapshot_id: string;
  refusals: string[];
}

export function clampFloor(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_INTELLIGENCE_FLOOR;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function clampBias(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(-1, n));
}

/** Has Index (may still lack cost/speed — atlas only). */
export function hasIntelligence(model: Model): boolean {
  return model.aa_intelligence_index !== null && Number.isFinite(model.aa_intelligence_index);
}

/** Pick-surface eligible: Index ≥ floor and scorable cost+speed (isScorable). */
export function isPickEligible(model: Model, floor: number): boolean {
  if (!isScorable(model)) return false;
  return (model.aa_intelligence_index as number) >= clampFloor(floor);
}

export function filterPickEligible(models: readonly Model[], floor: number): Model[] {
  return models.filter((m) => isPickEligible(m, floor));
}

/** 2D dominance on cost (min) × speed/tps (max) among pick-eligible models. */
export function dominatesCostSpeed(a: Model, b: Model): boolean {
  if (!isScorable(a) || !isScorable(b)) return false;
  const aCost = Math.round(a.blended_price_per_M! * 100) / 100;
  const bCost = Math.round(b.blended_price_per_M! * 100) / 100;
  const aSpeed = Math.round(a.tps! * 10) / 10;
  const bSpeed = Math.round(b.tps! * 10) / 10;
  const atLeast = aCost <= bCost && aSpeed >= bSpeed;
  const strict = aCost < bCost || aSpeed > bSpeed;
  return atLeast && strict;
}

export function costSpeedPareto(models: readonly Model[]): Model[] {
  const valid = models.filter(isScorable);
  return valid.filter((c) => !valid.some((o) => o !== c && dominatesCostSpeed(o, c)));
}

/**
 * Rank Pareto members for shortlist.
 * bias −1 → cheaper first; +1 → faster first; 0 → balance (normalized cost+speed).
 */
export function rankParetoByBias(pareto: readonly Model[], bias: CostSpeedBias): Model[] {
  const b = clampBias(bias);
  if (pareto.length === 0) return [];
  const costs = pareto.map((m) => m.blended_price_per_M!);
  const speeds = pareto.map((m) => m.tps!);
  const minC = Math.min(...costs);
  const maxC = Math.max(...costs);
  const minS = Math.min(...speeds);
  const maxS = Math.max(...speeds);
  const spanC = maxC - minC || 1;
  const spanS = maxS - minS || 1;

  const scored = pareto.map((m) => {
    const cheapScore = (maxC - m.blended_price_per_M!) / spanC;
    const fastScore = (m.tps! - minS) / spanS;
    const wFast = (b + 1) / 2;
    const wCheap = 1 - wFast;
    const score = wCheap * cheapScore + wFast * fastScore;
    return { m, score };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.m.blended_price_per_M! - b.m.blended_price_per_M! ||
      b.m.tps! - a.m.tps! ||
      a.m.model.localeCompare(b.m.model),
  );
  return scored.map((s) => s.m);
}

export function shortlistFromDecide(
  models: readonly Model[],
  floor: number,
  bias: CostSpeedBias,
  n = DEFAULT_SHORTLIST_N,
): { eligible: Model[]; pareto: Model[]; shortlist: Model[] } {
  const eligible = filterPickEligible(models, floor);
  const pareto = costSpeedPareto(eligible);
  const ranked = rankParetoByBias(pareto, bias);
  const shortlist = ranked.slice(0, Math.max(0, n));
  return { eligible, pareto, shortlist };
}

export function floorFromAnchor(models: readonly Model[], anchorModelId: string): number | null {
  const row = models.find((m) => m.model === anchorModelId);
  if (!row || row.aa_intelligence_index === null) return null;
  return clampFloor(row.aa_intelligence_index);
}

/** Canonical catalog payload for snapshot hashing (stable row order). */
export function catalogSnapshotPayload(productCatalog: readonly Model[]): string {
  return productCatalog
    .map(
      (m) =>
        [
          m.model,
          m.aa_intelligence_index ?? "",
          m.tps ?? "",
          m.blended_price_per_M ?? "",
          m.data_date ?? "",
        ].join("|"),
    )
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
}

/**
 * Stable content id for the **product catalog** (post catalog-scope, pre shelf filters).
 * SHA-256, first 16 hex chars, `cat_` prefix. Never returns bare "local".
 * Async (Web Crypto / Node crypto.subtle).
 */
export async function catalogSnapshotId(productCatalog: readonly Model[]): Promise<string> {
  const payload = catalogSnapshotPayload(productCatalog);
  const data = new TextEncoder().encode(payload);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("catalogSnapshotId requires crypto.subtle");
  }
  const buf = await subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `cat_${hex.slice(0, 16)}`;
}

/** Sync fallback only for pure tests that inject a precomputed id — prefer catalogSnapshotId. */
export function catalogSnapshotIdSyncForTests(productCatalog: readonly Model[]): string {
  // Deterministic non-crypto stand-in when subtle unavailable in odd runners.
  // Production always uses catalogSnapshotId (SHA-256).
  const payload = catalogSnapshotPayload(productCatalog);
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cat_${(h >>> 0).toString(16).padStart(8, "0")}${(payload.length >>> 0).toString(16).padStart(8, "0")}`;
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
  const { eligible, pareto, shortlist } = shortlistFromDecide(
    visibleModels,
    floor,
    opts.bias,
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
      aa_intelligence_index: floor,
      source: opts.floorSource,
    },
    eligible_ids: eligible.map((m) => m.model),
    pareto_ids: pareto.map((m) => m.model),
    shortlist: shortlist.map((m, i) => ({
      id: m.model,
      rank: i + 1,
      reasons: [
        "on_pareto",
        opts.bias < -0.25 ? "bias_cheap" : opts.bias > 0.25 ? "bias_fast" : "bias_balanced",
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
      aa_intelligence_index: clampFloor(opts.floor),
      anchor_model_id: opts.anchorModelId ?? null,
    },
    cost_speed_bias: clampBias(opts.bias),
    task_tag: null,
    shortlist_n: opts.shortlistN ?? DEFAULT_SHORTLIST_N,
  };
}
