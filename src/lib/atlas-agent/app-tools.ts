/**
 * Full-app Atlas tools — filters, view, axes, weights, focus, inventory.
 */

import {
  applyEconomyBasis,
  detectEconomyBasis,
  isAxisMetricId,
  type AxisMapping,
  type AxisMetricId,
  type EconomyBasis,
} from "../axis-metrics";
import { clampBias, clampFloor } from "../decide";
import { DEFAULT_FILTERS, type ModelFilters } from "../filters";
import { deriveFamilyId } from "../family";
import { presets, type PresetId, type ScoreWeights } from "../score";
import type { AtlasAgentContext, AtlasProposal, AtlasToolTrace } from "./types";
import { emptyProposal } from "./types";
import { findModel } from "./tools";

function trace(name: string, ok: boolean, detail?: string): AtlasToolTrace {
  return { name, ok, detail };
}

export function toolGetAppState(ctx: AtlasAgentContext): {
  result: Record<string, unknown>;
  trace: AtlasToolTrace;
} {
  const axes = ctx.axisMapping;
  return {
    result: {
      floor: ctx.floor,
      cost_speed_bias: ctx.costSpeedBias,
      decide_mode: Boolean(ctx.decideMode),
      cinema_mode: Boolean(ctx.cinemaMode),
      pinned_model_id: ctx.pinnedModelId ?? null,
      hovered_model_id: ctx.hoveredModelId ?? null,
      filters: ctx.filters,
      axis_mapping: axes ?? null,
      economy_basis: axes ? detectEconomyBasis(axes) : null,
      weights: ctx.weights ?? null,
      floor_anchor_model_id: ctx.floorAnchorModelId ?? null,
      floor_source: ctx.floorSource ?? null,
      visible_count: ctx.visible.length,
      catalog_count: ctx.catalog.length,
      snapshot: ctx.catalogSnapshotId,
    },
    trace: trace("get_app_state", true, `floor ${ctx.floor} · ${ctx.visible.length} visible`),
  };
}

export function toolListProviders(ctx: AtlasAgentContext): {
  result: { providers: string[]; counts: Record<string, number> };
  trace: AtlasToolTrace;
} {
  const counts: Record<string, number> = {};
  for (const m of ctx.catalog) {
    counts[m.provider] = (counts[m.provider] ?? 0) + 1;
  }
  const providers = Object.keys(counts).sort((a, b) => a.localeCompare(b));
  return {
    result: { providers, counts },
    trace: trace("list_providers", true, `${providers.length} providers`),
  };
}

export function toolListFamilies(ctx: AtlasAgentContext): {
  result: { families: string[]; counts: Record<string, number> };
  trace: AtlasToolTrace;
} {
  const counts: Record<string, number> = {};
  for (const m of ctx.catalog) {
    const id = (m.family_id && m.family_id.trim()) || deriveFamilyId(m.model);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  const families = Object.keys(counts).sort((a, b) => a.localeCompare(b));
  return {
    result: { families, counts },
    trace: trace("list_families", true, `${families.length} families`),
  };
}

export function toolSetFilters(
  ctx: AtlasAgentContext,
  patch: Partial<ModelFilters>,
): { result: Partial<ModelFilters>; proposal: AtlasProposal; trace: AtlasToolTrace } {
  const cleaned: Partial<ModelFilters> = { ...patch };
  if (cleaned.vramMaxGb != null && ![8, 12, 24].includes(cleaned.vramMaxGb as number)) {
    delete cleaned.vramMaxGb;
  }
  const proposal = emptyProposal(
    ctx.catalogSnapshotId,
    `Update filters: ${JSON.stringify(cleaned)}. Apply to visible set?`,
    {
      filters_patch: cleaned,
      needs_confirm: true,
      auto_apply: false,
      tool_trace: [],
    },
  );
  return {
    result: cleaned,
    proposal,
    trace: trace("set_filters", true, Object.keys(cleaned).join(",") || "empty"),
  };
}

export function toolSetDecide(
  ctx: AtlasAgentContext,
  opts: {
    decide_mode?: boolean;
    floor?: number;
    bias?: number;
    anchor?: string;
  },
): { proposal: AtlasProposal; trace: AtlasToolTrace } {
  let floor = opts.floor != null ? clampFloor(opts.floor) : undefined;
  let anchorId: string | null | undefined;
  if (opts.anchor) {
    const m = findModel(ctx.catalog, opts.anchor);
    if (m?.aa_intelligence_index != null) {
      floor = clampFloor(m.aa_intelligence_index);
      anchorId = m.model;
    }
  }
  const bits: string[] = [];
  if (opts.decide_mode != null) bits.push(opts.decide_mode ? "Decide on" : "Decide off");
  if (floor != null) bits.push(`floor ${floor}`);
  if (opts.bias != null) bits.push(`bias ${opts.bias}`);
  const proposal = emptyProposal(
    ctx.catalogSnapshotId,
    `${bits.join(" · ") || "Decide update"}. Apply?`,
    {
      decide_mode: opts.decide_mode,
      floor,
      floor_anchor_model_id: anchorId,
      cost_speed_bias: opts.bias != null ? clampBias(opts.bias) : undefined,
      needs_confirm: floor != null,
      auto_apply: floor == null,
      tool_trace: [],
    },
  );
  return {
    proposal,
    trace: trace("set_decide", true, bits.join(" · ") || "noop"),
  };
}

export function toolSetView(
  ctx: AtlasAgentContext,
  opts: { cinema?: boolean; decide_mode?: boolean },
): { proposal: AtlasProposal; trace: AtlasToolTrace } {
  const bits: string[] = [];
  if (opts.cinema != null) bits.push(opts.cinema ? "Cinema on" : "Cinema off");
  if (opts.decide_mode != null) bits.push(opts.decide_mode ? "Decide on" : "Decide off");
  return {
    proposal: emptyProposal(ctx.catalogSnapshotId, `${bits.join(" · ")}.`, {
      cinema_mode: opts.cinema,
      decide_mode: opts.decide_mode,
      needs_confirm: false,
      auto_apply: true,
      tool_trace: [],
    }),
    trace: trace("set_view", true, bits.join(" · ")),
  };
}

export function toolSetAxes(
  ctx: AtlasAgentContext,
  opts: {
    economy_basis?: EconomyBasis;
    x?: string;
    y?: string;
    z?: string;
  },
): { proposal: AtlasProposal; trace: AtlasToolTrace } {
  if (opts.economy_basis === "rate" || opts.economy_basis === "task") {
    return {
      proposal: emptyProposal(
        ctx.catalogSnapshotId,
        `Switch economy to ${opts.economy_basis} ($/M·tok/s vs $/task·s/task).`,
        {
          economy_basis: opts.economy_basis,
          needs_confirm: false,
          auto_apply: true,
          tool_trace: [],
        },
      ),
      trace: trace("set_axes", true, `basis ${opts.economy_basis}`),
    };
  }
  const cur = ctx.axisMapping ?? { x: "blended_price" as AxisMetricId, y: "intelligence" as AxisMetricId, z: "tps" as AxisMetricId };
  const next: AxisMapping = {
    x: opts.x && isAxisMetricId(opts.x) ? opts.x : cur.x,
    y: opts.y && isAxisMetricId(opts.y) ? opts.y : cur.y,
    z: opts.z && isAxisMetricId(opts.z) ? opts.z : cur.z,
  };
  // validate
  void applyEconomyBasis;
  return {
    proposal: emptyProposal(
      ctx.catalogSnapshotId,
      `Axes X=${next.x} Y=${next.y} Z=${next.z}.`,
      {
        axis_mapping: next,
        needs_confirm: false,
        auto_apply: true,
        tool_trace: [],
      },
    ),
    trace: trace("set_axes", true, `${next.x},${next.y},${next.z}`),
  };
}

export function toolSetWeights(
  ctx: AtlasAgentContext,
  opts: { preset?: string; weights?: ScoreWeights },
): { proposal: AtlasProposal; trace: AtlasToolTrace } {
  if (opts.preset && opts.preset in presets) {
    const id = opts.preset as PresetId;
    return {
      proposal: emptyProposal(
        ctx.catalogSnapshotId,
        `Value-score preset “${id}”.`,
        {
          weight_preset: id,
          weights: { ...presets[id] },
          needs_confirm: false,
          auto_apply: true,
          tool_trace: [],
        },
      ),
      trace: trace("set_weights", true, `preset ${id}`),
    };
  }
  if (opts.weights) {
    return {
      proposal: emptyProposal(ctx.catalogSnapshotId, "Custom value-score weights.", {
        weights: opts.weights,
        needs_confirm: false,
        auto_apply: true,
        tool_trace: [],
      }),
      trace: trace("set_weights", true, "custom"),
    };
  }
  return {
    proposal: emptyProposal(ctx.catalogSnapshotId, "Need a weight preset name or weights object.", {
      needs_confirm: false,
      auto_apply: false,
      refuse_reason: "missing weights",
      tool_trace: [],
    }),
    trace: trace("set_weights", false, "missing"),
  };
}

export function toolFocusModel(
  ctx: AtlasAgentContext,
  idOrName: string,
  opts?: { pin?: boolean; hover?: boolean },
): { proposal: AtlasProposal; trace: AtlasToolTrace } {
  const m = findModel(ctx.catalog, idOrName);
  if (!m) {
    return {
      proposal: emptyProposal(ctx.catalogSnapshotId, `No model matched “${idOrName}”.`, {
        needs_confirm: false,
        auto_apply: false,
        refuse_reason: "not found",
        tool_trace: [],
      }),
      trace: trace("focus_model", false, idOrName),
    };
  }
  const pin = opts?.pin !== false;
  const hover = opts?.hover !== false;
  return {
    proposal: emptyProposal(
      ctx.catalogSnapshotId,
      `Focus ${m.model}.`,
      {
        pinned_model_id: pin ? m.model : undefined,
        hovered_model_id: hover ? m.model : undefined,
        highlight_model_ids: [m.model],
        needs_confirm: false,
        auto_apply: true,
        tool_trace: [],
      },
    ),
    trace: trace("focus_model", true, m.model),
  };
}

export function toolResetScope(ctx: AtlasAgentContext): {
  proposal: AtlasProposal;
  trace: AtlasToolTrace;
} {
  return {
    proposal: emptyProposal(
      ctx.catalogSnapshotId,
      "Reset filters to product defaults (clears provider/family/VRAM gates).",
      {
        filters_replace: { ...DEFAULT_FILTERS, providers: [], families: [] },
        needs_confirm: true,
        auto_apply: false,
        tool_trace: [],
      },
    ),
    trace: trace("reset_scope", true, "defaults"),
  };
}
