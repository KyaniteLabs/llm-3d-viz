/**
 * Pure catalog tools for Atlas. Numbers only from catalog / decide helpers.
 */

import type { Model } from "../../data/models";
import { displayName } from "../display-name";
import {
  clampBias,
  clampFloor,
  filterPickEligible,
  shortlistFromDecide,
  type CostSpeedBias,
} from "../decide";
import type { AtlasAgentContext, AtlasToolTrace, RankObjective } from "./types";

export interface ModelSummary {
  id: string;
  display: string;
  provider: string;
  index: number | null;
  tps: number | null;
  price: number | null;
  openness: string;
  /** Capability fields — optional, populated for richer query results. */
  modalities?: string[];
  context?: number;
  reasoning?: boolean;
  swe_bench?: number | null;
  gpqa?: number | null;
}

export function summary(m: Model): ModelSummary {
  return {
    id: m.model,
    display: displayName(m.model),
    provider: m.provider,
    index: m.aa_intelligence_index,
    tps: m.tps,
    price: m.blended_price_per_M,
    openness: m.openness,
    modalities: m.modality,
    context: m.context_length,
    reasoning: m.reasoning,
    swe_bench: m.swe_bench,
    gpqa: m.gpqa,
  };
}


function findModel(catalog: readonly Model[], q: string): Model | null {
  const needle = q.trim().toLowerCase();
  if (!needle) return null;
  const exact = catalog.find((m) => m.model.toLowerCase() === needle);
  if (exact) return exact;
  const byDisplay = catalog.find((m) => displayName(m.model).toLowerCase() === needle);
  if (byDisplay) return byDisplay;
  const partial = catalog.filter(
    (m) =>
      m.model.toLowerCase().includes(needle) ||
      displayName(m.model).toLowerCase().includes(needle) ||
      m.provider.toLowerCase().includes(needle),
  );
  if (partial.length === 1) return partial[0]!;
  // Prefer highest Index among partial matches
  if (partial.length > 1) {
    return partial.slice().sort((a, b) => (b.aa_intelligence_index ?? -1) - (a.aa_intelligence_index ?? -1))[0]!;
  }
  return null;
}

export function toolGetCatalogMeta(ctx: AtlasAgentContext): {
  result: { model_count: number; visible_count: number; snapshot: string; floor: number };
  trace: AtlasToolTrace;
} {
  return {
    result: {
      model_count: ctx.catalog.length,
      visible_count: ctx.visible.length,
      snapshot: ctx.catalogSnapshotId,
      floor: ctx.floor,
    },
    trace: {
      name: "get_catalog_meta",
      ok: true,
      detail: `${ctx.catalog.length} models · floor ${ctx.floor}`,
    },
  };
}

export function toolSearchModels(
  ctx: AtlasAgentContext,
  query: string,
  scope: "visible" | "catalog" = "visible",
): { result: ModelSummary[]; trace: AtlasToolTrace } {
  const pool = scope === "catalog" ? ctx.catalog : ctx.visible;
  const needle = query.trim().toLowerCase();
  const hits = !needle
    ? pool.slice(0, 12)
    : pool.filter(
        (m) =>
          m.model.toLowerCase().includes(needle) ||
          displayName(m.model).toLowerCase().includes(needle) ||
          m.provider.toLowerCase().includes(needle),
      );
  const top = hits.slice(0, 12).map(summary);
  return {
    result: top,
    trace: {
      name: "search_models",
      ok: true,
      detail: `${top.length} hit(s) for “${query || "*"}”`,
    },
  };
}

export function toolGetModel(
  ctx: AtlasAgentContext,
  idOrName: string,
): { result: ModelSummary | null; trace: AtlasToolTrace } {
  const m = findModel(ctx.catalog, idOrName);
  if (!m) {
    return {
      result: null,
      trace: { name: "get_model", ok: false, detail: `not found: ${idOrName}` },
    };
  }
  return {
    result: summary(m),
    trace: { name: "get_model", ok: true, detail: m.model },
  };
}

export function toolListEligible(
  ctx: AtlasAgentContext,
  floor: number,
): {
  result: { eligible: ModelSummary[]; excluded_sample: { id: string; reason: string }[] };
  trace: AtlasToolTrace;
} {
  const f = clampFloor(floor);
  const pool = ctx.visible.length ? ctx.visible : ctx.catalog;
  const eligible = filterPickEligible(pool, f).map(summary);
  const excluded_sample: { id: string; reason: string }[] = [];
  for (const m of pool) {
    if (excluded_sample.length >= 5) break;
    const iq = m.aa_intelligence_index;
    if (iq == null) {
      excluded_sample.push({ id: m.model, reason: "unmeasured intelligence" });
    } else if (iq < f) {
      excluded_sample.push({ id: m.model, reason: `index ${iq} < floor ${f}` });
    } else if (m.tps == null || m.blended_price_per_M == null) {
      excluded_sample.push({ id: m.model, reason: "missing cost or speed" });
    }
  }
  return {
    result: { eligible, excluded_sample },
    trace: {
      name: "list_eligible",
      ok: true,
      detail: `${eligible.length} eligible at floor ${f}`,
    },
  };
}

export function toolRankEligible(
  ctx: AtlasAgentContext,
  floor: number,
  objective: RankObjective,
  n = 3,
): {
  result: { shortlist: ModelSummary[]; bias: CostSpeedBias };
  trace: AtlasToolTrace;
} {
  const f = clampFloor(floor);
  const bias: CostSpeedBias =
    objective === "min_cost" ? -1 : objective === "max_speed" ? 1 : clampBias(ctx.costSpeedBias);
  const pool = ctx.visible.length ? ctx.visible : ctx.catalog;
  const { shortlist } = shortlistFromDecide(pool, f, bias, n);
  return {
    result: { shortlist: shortlist.map(summary), bias },
    trace: {
      name: "rank_eligible",
      ok: true,
      detail: `${shortlist.length} shortlist · ${objective} · floor ${f}`,
    },
  };
}

export function toolProposeFloor(
  ctx: AtlasAgentContext,
  opts: { floor?: number; anchor?: string },
): {
  result: { floor: number; anchor_id: string | null; source: "user" | "anchor" } | null;
  trace: AtlasToolTrace;
} {
  if (opts.anchor) {
    const m = findModel(ctx.catalog, opts.anchor);
    if (!m || m.aa_intelligence_index == null) {
      return {
        result: null,
        trace: {
          name: "propose_floor",
          ok: false,
          detail: m ? "anchor has no Index" : `anchor not found: ${opts.anchor}`,
        },
      };
    }
    const floor = clampFloor(m.aa_intelligence_index);
    return {
      result: { floor, anchor_id: m.model, source: "anchor" },
      trace: {
        name: "propose_floor",
        ok: true,
        detail: `floor ${floor} from ${displayName(m.model)}`,
      },
    };
  }
  if (opts.floor != null && Number.isFinite(opts.floor)) {
    const floor = clampFloor(opts.floor);
    return {
      result: { floor, anchor_id: null, source: "user" },
      trace: { name: "propose_floor", ok: true, detail: `floor ${floor}` },
    };
  }
  return {
    result: null,
    trace: { name: "propose_floor", ok: false, detail: "need floor number or anchor name" },
  };
}

export function toolCompareModels(
  ctx: AtlasAgentContext,
  names: string[],
): {
  result: ModelSummary[];
  trace: AtlasToolTrace;
} {
  const rows: ModelSummary[] = [];
  const missing: string[] = [];
  for (const n of names) {
    const m = findModel(ctx.catalog, n);
    if (m) rows.push(summary(m));
    else missing.push(n);
  }
  return {
    result: rows,
    trace: {
      name: "compare_models",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `compared ${rows.length}`
          : `missing: ${missing.join(", ")} · found ${rows.length}`,
    },
  };
}

export { findModel };
