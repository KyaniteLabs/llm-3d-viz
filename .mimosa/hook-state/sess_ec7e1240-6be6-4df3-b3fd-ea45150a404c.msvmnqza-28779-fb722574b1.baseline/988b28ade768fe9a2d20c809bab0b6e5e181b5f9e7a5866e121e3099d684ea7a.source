/**
 * Apply a validated AtlasProposal to the AppStore (full-app agent surface).
 */

import {
  applyEconomyBasis,
  normalizeAxisMapping,
  type AxisMapping,
} from "../axis-metrics";
import { clampBias, clampFloor } from "../decide";
import { DEFAULT_FILTERS, type ModelFilters } from "../filters";
import { presets, type PresetId, type ScoreWeights } from "../score";
import type { AppStore } from "../../state";
import type { AtlasProposal } from "./types";
import { dispatchUiActions } from "./ui-actions";

export type AppStorePatch = Parameters<AppStore["update"]>[0];

export interface ApplyResult {
  patch: AppStorePatch;
  appliedKeys: string[];
  /** View-local UI action ids the host successfully dispatched. */
  uiDispatched?: string[];
  /** UI action ids the agent requested but no handler registered (ignored). */
  uiUnknown?: string[];
}

/**
 * Build store patch from proposal. Pure — does not call store.update.
 */
export function proposalToStorePatch(
  p: AtlasProposal,
  currentFilters: ModelFilters,
  currentAxes?: AxisMapping,
): ApplyResult {
  const patch: AppStorePatch = {};
  const appliedKeys: string[] = [];

  if (p.decide_mode != null) {
    patch.decideMode = p.decide_mode;
    appliedKeys.push("decideMode");
  }
  if (p.floor != null) {
    patch.intelligenceFloor = clampFloor(p.floor);
    patch.floorUserSet = true;
    patch.floorSource = p.floor_anchor_model_id ? "anchor" : "user";
    patch.floorAnchorModelId = p.floor_anchor_model_id ?? null;
    appliedKeys.push("floor");
  }
  if (p.cost_speed_bias != null) {
    patch.costSpeedBias = clampBias(p.cost_speed_bias);
    appliedKeys.push("costSpeedBias");
  }
  if (p.filters_replace) {
    patch.filters = {
      ...DEFAULT_FILTERS,
      ...p.filters_replace,
      providers: [...(p.filters_replace.providers ?? [])],
      families: [...(p.filters_replace.families ?? [])],
    };
    appliedKeys.push("filters_replace");
  } else if (p.filters_patch && Object.keys(p.filters_patch).length > 0) {
    patch.filters = {
      ...currentFilters,
      ...p.filters_patch,
      providers: p.filters_patch.providers
        ? [...p.filters_patch.providers]
        : [...currentFilters.providers],
      families: p.filters_patch.families
        ? [...p.filters_patch.families]
        : [...currentFilters.families],
    } as ModelFilters;
    appliedKeys.push("filters_patch");
  }
  if (p.economy_basis === "rate" || p.economy_basis === "task") {
    const base = currentAxes ?? normalizeAxisMapping({ x: "blended_price", y: "intelligence", z: "tps" });
    patch.axisMapping = applyEconomyBasis(base, p.economy_basis);
    appliedKeys.push("economy_basis");
  } else if (p.axis_mapping) {
    patch.axisMapping = normalizeAxisMapping(p.axis_mapping);
    appliedKeys.push("axis_mapping");
  }
  if (p.weight_preset && p.weight_preset in presets) {
    patch.weights = { ...presets[p.weight_preset as PresetId] };
    appliedKeys.push("weight_preset");
  } else if (p.weights) {
    patch.weights = { ...p.weights } as ScoreWeights;
    appliedKeys.push("weights");
  }
  if (p.cinema_mode != null) {
    patch.cinemaMode = p.cinema_mode;
    appliedKeys.push("cinemaMode");
  }
  if (p.pinned_model_id !== undefined) {
    patch.pinnedModelId = p.pinned_model_id;
    appliedKeys.push("pinnedModelId");
  }
  if (p.hovered_model_id !== undefined) {
    patch.hoveredModelId = p.hovered_model_id;
    appliedKeys.push("hoveredModelId");
  }
  // Highlight falls back to pin/hover first shortlist id
  if (
    p.pinned_model_id === undefined &&
    p.highlight_model_ids?.[0]
  ) {
    patch.pinnedModelId = p.highlight_model_ids[0];
    patch.hoveredModelId = p.highlight_model_ids[0];
    appliedKeys.push("highlight");
  }

  return { patch, appliedKeys };
}

export function applyProposalToStore(store: AppStore, p: AtlasProposal): ApplyResult {
  const state = store.getState();
  const result = proposalToStorePatch(p, state.filters, state.axisMapping);
  if (result.appliedKeys.length > 0) {
    store.update(result.patch);
  }
  // View-local UI actions (allow-listed by the host) — dispatched after store apply.
  if (p.ui_actions?.length) {
    const { dispatched, unknown } = dispatchUiActions(p.ui_actions);
    result.uiDispatched = dispatched;
    result.uiUnknown = unknown;
  }
  return result;
}
