/**
 * Atlas agent structured proposal + tool trace.
 * Host validates before applying to the viz store — full-app surface.
 */

import type { AxisMapping } from "../axis-metrics";
import type { ModelFilters } from "../filters";
import type { ScoreWeights } from "../score";

export type AtlasToolName =
  | "get_catalog_meta"
  | "get_app_state"
  | "search_models"
  | "get_model"
  | "list_eligible"
  | "rank_eligible"
  | "propose_floor"
  | "compare_models"
  | "list_providers"
  | "list_families"
  | "set_filters"
  | "set_decide"
  | "set_view"
  | "set_axes"
  | "set_weights"
  | "focus_model"
  | "reset_scope"
  | "finish_turn";

export interface AtlasToolTrace {
  name: AtlasToolName | string;
  ok: boolean;
  detail?: string;
}

export type RankObjective = "min_cost" | "max_speed" | "balanced";

/**
 * Structured UI write. Atlas navigates the whole app through this proposal —
 * not chat-only.
 */
export interface AtlasProposal {
  schema_version: "1.0";
  /** Spoken + shown summary (plain English). */
  summary: string;
  floor?: number | null;
  floor_anchor_model_id?: string | null;
  decide_mode?: boolean;
  cost_speed_bias?: number;
  highlight_model_ids?: string[];
  shortlist_ids?: string[];
  pinned_model_id?: string | null;
  hovered_model_id?: string | null;
  cinema_mode?: boolean;
  filters_patch?: Partial<ModelFilters>;
  /** Replace filters entirely when set (after merge with DEFAULT). */
  filters_replace?: ModelFilters;
  axis_mapping?: AxisMapping;
  economy_basis?: "rate" | "task";
  weights?: ScoreWeights;
  weight_preset?: string;
  refuse_reason?: string | null;
  tool_trace: AtlasToolTrace[];
  catalog_snapshot_id: string;
  /**
   * When true, UI should prefer explicit Apply for high-impact writes.
   * Low-impact navigation may still auto-apply.
   */
  needs_confirm: boolean;
  /**
   * When true (default for navigation), host applies immediately after a valid turn.
   * Floor/filter wipes may set false + needs_confirm true.
   */
  auto_apply?: boolean;
}

export interface AtlasAgentContext {
  catalog: readonly import("../../data/models").Model[];
  /** Currently visible models (after filters). */
  visible: readonly import("../../data/models").Model[];
  floor: number;
  costSpeedBias: number;
  catalogSnapshotId: string;
  filters: ModelFilters;
  /** Full app state snapshot for agentic control. */
  decideMode?: boolean;
  cinemaMode?: boolean;
  pinnedModelId?: string | null;
  hoveredModelId?: string | null;
  axisMapping?: AxisMapping;
  weights?: ScoreWeights;
  floorAnchorModelId?: string | null;
  floorSource?: string;
}

export function emptyProposal(
  snapshotId: string,
  summary: string,
  extras: Partial<AtlasProposal> = {},
): AtlasProposal {
  return {
    schema_version: "1.0",
    summary,
    tool_trace: [],
    catalog_snapshot_id: snapshotId,
    needs_confirm: true,
    refuse_reason: null,
    ...extras,
  };
}

/** Fail-closed validation before store apply. */
export function validateProposal(p: unknown): p is AtlasProposal {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  if (o.schema_version !== "1.0") return false;
  if (typeof o.summary !== "string" || !o.summary.trim()) return false;
  if (typeof o.catalog_snapshot_id !== "string" || !o.catalog_snapshot_id) return false;
  if (!Array.isArray(o.tool_trace)) return false;
  if (typeof o.needs_confirm !== "boolean") return false;
  if (o.floor != null && (typeof o.floor !== "number" || !Number.isFinite(o.floor))) return false;
  if (o.cost_speed_bias != null && typeof o.cost_speed_bias !== "number") return false;
  return true;
}

/** True when proposal only navigates (pin/hover/cinema/decide flag) without floor/filter wipe. */
export function isLowImpactProposal(p: AtlasProposal): boolean {
  if (p.floor != null) return false;
  if (p.filters_patch && Object.keys(p.filters_patch).length > 0) return false;
  if (p.filters_replace) return false;
  if (p.axis_mapping) return false;
  if (p.weights || p.weight_preset) return false;
  if (p.economy_basis) return false;
  // Decide mode + shortlist is still a product state change that should confirm when with floor;
  // bare shortlist/highlight without floor is low-impact (pin only).
  return true;
}

/**
 * Host-owned auto-apply decision. Never trusts model-supplied auto_apply for high-impact writes.
 */
export function shouldAutoApplyProposal(p: AtlasProposal): boolean {
  if (!isLowImpactProposal(p)) return false;
  // Low-impact navigation always applies; model cannot force-confirm-block cinema/pin.
  // Explicit needs_confirm:true still shows Apply (e.g. rare soft confirm).
  if (p.needs_confirm === true) return false;
  return true;
}

/** Whether the proposal has any store-affecting fields. */
export function proposalHasApplyableChanges(p: AtlasProposal): boolean {
  return (
    p.floor != null ||
    p.decide_mode != null ||
    p.cost_speed_bias != null ||
    Boolean(p.filters_patch && Object.keys(p.filters_patch).length) ||
    Boolean(p.filters_replace) ||
    Boolean(p.axis_mapping) ||
    Boolean(p.economy_basis) ||
    Boolean(p.weights) ||
    Boolean(p.weight_preset) ||
    p.cinema_mode != null ||
    p.pinned_model_id !== undefined ||
    p.hovered_model_id !== undefined ||
    Boolean(p.highlight_model_ids?.length) ||
    Boolean(p.shortlist_ids?.length)
  );
}
