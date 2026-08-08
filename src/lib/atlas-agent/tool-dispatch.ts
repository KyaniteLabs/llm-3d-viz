/**
 * Tool schemas (OpenAI + Anthropic shapes) and pure dispatch for Atlas LLM loop.
 * Full-app agent surface: catalog + navigate + control.
 */

import type { ModelFilters } from "../filters";
import type { ScoreWeights } from "../score";
import type { AtlasAgentContext, AtlasProposal, AtlasToolTrace, RankObjective } from "./types";
import { emptyProposal } from "./types";
import {
  toolCompareModels,
  toolGetCatalogMeta,
  toolGetModel,
  toolListEligible,
  toolProposeFloor,
  toolRankEligible,
  toolSearchModels,
} from "./tools";
import {
  toolFocusModel,
  toolGetAppState,
  toolListFamilies,
  toolListProviders,
  toolResetScope,
  toolSetAxes,
  toolSetDecide,
  toolSetFilters,
  toolSetView,
  toolSetWeights,
} from "./app-tools";
import { toolQueryCatalog, type CatalogConstraints } from "./query-catalog";

/** Shared JSON Schema-ish properties for both protocols. */
export const ATLAS_TOOL_DEFINITIONS = [
  {
    name: "get_catalog_meta",
    description: "Catalog size, visible count, current intelligence floor, snapshot id.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_app_state",
    description:
      "Full UI state: floor, filters, axes, cinema, decide, pin, weights. Call before changing the app.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_models",
    description: "Search models by name/provider substring.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        scope: { type: "string", enum: ["visible", "catalog"] },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_model",
    description: "One model: Index, tok/s, blended price (null when unmeasured).",
    parameters: {
      type: "object",
      properties: { id_or_name: { type: "string" } },
      required: ["id_or_name"],
      additionalProperties: false,
    },
  },
  {
    name: "list_eligible",
    description: "Models with Index >= floor and measured cost+speed.",
    parameters: {
      type: "object",
      properties: { floor: { type: "number" } },
      required: ["floor"],
      additionalProperties: false,
    },
  },
  {
    name: "rank_eligible",
    description: "Rank eligible by min_cost, max_speed, or balanced.",
    parameters: {
      type: "object",
      properties: {
        floor: { type: "number" },
        objective: { type: "string", enum: ["min_cost", "max_speed", "balanced"] },
        n: { type: "number" },
      },
      required: ["floor", "objective"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_floor",
    description: "Intelligence floor from number or anchor model Index.",
    parameters: {
      type: "object",
      properties: {
        floor: { type: "number" },
        anchor: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "compare_models",
    description: "Side-by-side metrics for named models.",
    parameters: {
      type: "object",
      properties: {
        names: { type: "array", items: { type: "string" } },
      },
      required: ["names"],
      additionalProperties: false,
    },
  },
  {
    name: "query_catalog",
    description:
      "Compositional filter+rank over the catalog: combine objective (min_cost/max_speed/max_intelligence) with constraints (floor, openness, maxPrice $/M, minTps tok/s, modality vision|audio, minContext tokens, reasoning, frontierOnly, minSweBench, minGpqa, provider, excludeProvider). Returns ranked ModelSummary[]. Use for any multi-axis question.",
    parameters: {
      type: "object",
      properties: {
        objective: { type: "string", enum: ["min_cost", "max_speed", "max_intelligence"] },
        floor: { type: "number" },
        openness: { type: "string", enum: ["open", "closed"] },
        maxPrice: { type: "number" },
        minTps: { type: "number" },
        modality: { type: "string", enum: ["vision", "audio"] },
        minContext: { type: "number" },
        reasoning: { type: "boolean" },
        frontierOnly: { type: "boolean" },
        minSweBench: { type: "number" },
        minGpqa: { type: "number" },
        provider: { type: "string" },
        excludeProvider: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_providers",
    description: "All providers in catalog with counts.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_families",
    description: "All family ids in catalog with counts.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "set_filters",
    description:
      "Patch visible-set filters (openness, vramMaxGb 8|12|24, providers, families, ageEnabled, multiEffortOnly, excludeNonReasoning).",
    parameters: {
      type: "object",
      properties: {
        openness: { type: "string", enum: ["all", "open", "closed"] },
        vramMaxGb: { type: ["number", "null"] },
        providers: { type: "array", items: { type: "string" } },
        families: { type: "array", items: { type: "string" } },
        ageEnabled: { type: "boolean" },
        ageMonths: { type: "number" },
        multiEffortOnly: { type: "boolean" },
        excludeNonReasoning: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "set_decide",
    description: "Toggle Decide mode, set floor/bias/anchor.",
    parameters: {
      type: "object",
      properties: {
        decide_mode: { type: "boolean" },
        floor: { type: "number" },
        bias: { type: "number" },
        anchor: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "set_view",
    description: "Cinema mode and/or Decide chrome without floor change.",
    parameters: {
      type: "object",
      properties: {
        cinema: { type: "boolean" },
        decide_mode: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "set_axes",
    description: "Economy basis rate|task or remap X/Y/Z metric ids.",
    parameters: {
      type: "object",
      properties: {
        economy_basis: { type: "string", enum: ["rate", "task"] },
        x: { type: "string" },
        y: { type: "string" },
        z: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "set_weights",
    description: "Value-score preset (chat, coding, RAG, speed, local8, local12, local24) or raw weights.",
    parameters: {
      type: "object",
      properties: {
        preset: { type: "string" },
        speed: { type: "number" },
        cost: { type: "number" },
        intelligence: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "focus_model",
    description: "Pin and hover a model on the stage.",
    parameters: {
      type: "object",
      properties: {
        id_or_name: { type: "string" },
        pin: { type: "boolean" },
        hover: { type: "boolean" },
      },
      required: ["id_or_name"],
      additionalProperties: false,
    },
  },
  {
    name: "reset_scope",
    description: "Reset filters to product defaults (confirm).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "finish_turn",
    description:
      "End the turn with summary + optional full UI proposal (floor, filters, cinema, pin, axes, weights). Numbers only from tools.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        floor: { type: ["number", "null"] },
        floor_anchor_model_id: { type: ["string", "null"] },
        decide_mode: { type: "boolean" },
        cost_speed_bias: { type: "number" },
        highlight_model_ids: { type: "array", items: { type: "string" } },
        shortlist_ids: { type: "array", items: { type: "string" } },
        pinned_model_id: { type: ["string", "null"] },
        hovered_model_id: { type: ["string", "null"] },
        cinema_mode: { type: "boolean" },
        needs_confirm: { type: "boolean" },
        auto_apply: { type: "boolean" },
        refuse_reason: { type: ["string", "null"] },
        filters_patch: { type: "object", additionalProperties: true },
        economy_basis: { type: "string", enum: ["rate", "task"] },
        weight_preset: { type: "string" },
      },
      required: ["summary"],
      additionalProperties: false,
    },
  },
] as const;

export function openaiToolsPayload() {
  return ATLAS_TOOL_DEFINITIONS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function anthropicToolsPayload() {
  return ATLAS_TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export const ATLAS_SYSTEM_PROMPT = `You are Atlas, the full-app navigator for Model Observatory (3D LLM benchmarks: intelligence Index x cost x speed).

You control the entire product surface, not just chat:
- Catalog tools (search, get, eligible, rank, compare, floor)
- App state (get_app_state, filters, decide, cinema, axes/economy, value-score weights, pin/focus, reset scope)

Rules:
1. Catalog tools are ground truth. Never invent Index, tok/s, or price.
2. Call get_app_state when you need current UI context before changing it.
3. End decision turns with finish_turn. Navigation tools that return a proposal may finish immediately.
4. High-impact: floor changes, filter wipes, reset_scope -> needs_confirm true, auto_apply false.
5. Low-impact: cinema, pin, economy basis, weight presets -> auto_apply true, needs_confirm false.
6. Prefer model ids from tool results. Stay on this product.`;

export type DispatchOutcome =
  | { kind: "tool_result"; content: unknown; trace: AtlasToolTrace }
  | { kind: "finish"; proposal: AtlasProposal; trace: AtlasToolTrace };

function asObj(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  return args as Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function strArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map((x) => String(x));
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}

function finishFromProposal(
  proposal: AtlasProposal,
  t: AtlasToolTrace,
): DispatchOutcome {
  return {
    kind: "finish",
    proposal: {
      ...proposal,
      tool_trace: [...(proposal.tool_trace ?? []), t],
    },
    trace: t,
  };
}

export function dispatchAtlasTool(
  name: string,
  rawArgs: unknown,
  ctx: AtlasAgentContext,
): DispatchOutcome {
  const args = asObj(rawArgs);

  switch (name) {
    case "get_catalog_meta": {
      const { result, trace } = toolGetCatalogMeta(ctx);
      return { kind: "tool_result", content: result, trace };
    }
    case "get_app_state": {
      const { result, trace } = toolGetAppState(ctx);
      return { kind: "tool_result", content: result, trace };
    }
    case "search_models": {
      const scope = args.scope === "catalog" ? "catalog" : "visible";
      const { result, trace } = toolSearchModels(ctx, str(args.query), scope);
      return { kind: "tool_result", content: result, trace };
    }
    case "get_model": {
      const { result, trace } = toolGetModel(ctx, str(args.id_or_name ?? args.idOrName));
      return { kind: "tool_result", content: result, trace };
    }
    case "list_eligible": {
      const floor = num(args.floor) ?? ctx.floor;
      const { result, trace } = toolListEligible(ctx, floor);
      return { kind: "tool_result", content: result, trace };
    }
    case "rank_eligible": {
      const floor = num(args.floor) ?? ctx.floor;
      const obj = str(args.objective) as RankObjective;
      const objective: RankObjective =
        obj === "min_cost" || obj === "max_speed" || obj === "balanced" ? obj : "balanced";
      const n = num(args.n) ?? 3;
      const { result, trace } = toolRankEligible(ctx, floor, objective, n);
      return { kind: "tool_result", content: result, trace };
    }
    case "propose_floor": {
      const { result, trace } = toolProposeFloor(ctx, {
        floor: num(args.floor),
        anchor: str(args.anchor) || undefined,
      });
      return { kind: "tool_result", content: result, trace };
    }
    case "compare_models": {
      const names = strArr(args.names) ?? [];
      const { result, trace } = toolCompareModels(ctx, names);
      return { kind: "tool_result", content: result, trace };
    }
    case "query_catalog": {
      const c: CatalogConstraints = {};
      const obj = str(args.objective);
      if (obj === "min_cost" || obj === "max_speed" || obj === "max_intelligence") c.objective = obj;
      if (num(args.floor) != null) c.floor = num(args.floor);
      if (args.openness === "open" || args.openness === "closed") c.openness = args.openness;
      if (num(args.maxPrice) != null) c.maxPrice = num(args.maxPrice);
      if (num(args.minTps) != null) c.minTps = num(args.minTps);
      const mod = str(args.modality);
      if (mod === "vision" || mod === "audio") c.modality = mod;
      if (num(args.minContext) != null) c.minContext = num(args.minContext);
      if (bool(args.reasoning) != null) c.reasoning = bool(args.reasoning)!;
      if (bool(args.frontierOnly) != null) c.frontierOnly = bool(args.frontierOnly)!;
      if (num(args.minSweBench) != null) c.minSweBench = num(args.minSweBench);
      if (num(args.minGpqa) != null) c.minGpqa = num(args.minGpqa);
      if (str(args.provider)) c.provider = str(args.provider);
      if (str(args.excludeProvider)) c.excludeProvider = str(args.excludeProvider);
      if (num(args.limit) != null) c.limit = num(args.limit);
      const { result, trace } = toolQueryCatalog(ctx, c);
      return { kind: "tool_result", content: result, trace };
    }
    case "list_providers": {
      const { result, trace } = toolListProviders(ctx);
      return { kind: "tool_result", content: result, trace };
    }
    case "list_families": {
      const { result, trace } = toolListFamilies(ctx);
      return { kind: "tool_result", content: result, trace };
    }
    case "set_filters": {
      const patch = { ...args } as Partial<ModelFilters>;
      const { proposal, trace } = toolSetFilters(ctx, patch);
      return finishFromProposal(proposal, trace);
    }
    case "set_decide": {
      const { proposal, trace } = toolSetDecide(ctx, {
        decide_mode: bool(args.decide_mode),
        floor: num(args.floor),
        bias: num(args.bias),
        anchor: str(args.anchor) || undefined,
      });
      return finishFromProposal(proposal, trace);
    }
    case "set_view": {
      const { proposal, trace } = toolSetView(ctx, {
        cinema: bool(args.cinema),
        decide_mode: bool(args.decide_mode),
      });
      return finishFromProposal(proposal, trace);
    }
    case "set_axes": {
      const { proposal, trace } = toolSetAxes(ctx, {
        economy_basis:
          args.economy_basis === "rate" || args.economy_basis === "task"
            ? args.economy_basis
            : undefined,
        x: str(args.x) || undefined,
        y: str(args.y) || undefined,
        z: str(args.z) || undefined,
      });
      return finishFromProposal(proposal, trace);
    }
    case "set_weights": {
      const hasRaw =
        num(args.speed) != null || num(args.cost) != null || num(args.intelligence) != null;
      const weights: ScoreWeights | undefined = hasRaw
        ? {
            speed: num(args.speed) ?? 0.33,
            cost: num(args.cost) ?? 0.33,
            intelligence: num(args.intelligence) ?? 0.34,
          }
        : undefined;
      const { proposal, trace } = toolSetWeights(ctx, {
        preset: str(args.preset) || undefined,
        weights,
      });
      return finishFromProposal(proposal, trace);
    }
    case "focus_model": {
      const { proposal, trace } = toolFocusModel(ctx, str(args.id_or_name ?? args.idOrName), {
        pin: bool(args.pin),
        hover: bool(args.hover),
      });
      return finishFromProposal(proposal, trace);
    }
    case "reset_scope": {
      const { proposal, trace } = toolResetScope(ctx);
      return finishFromProposal(proposal, trace);
    }
    case "finish_turn": {
      const summary = str(args.summary).trim();
      const tr: AtlasToolTrace = {
        name: "finish_turn",
        ok: Boolean(summary),
        detail: summary ? summary.slice(0, 80) : "missing summary",
      };
      if (!summary) {
        return {
          kind: "finish",
          proposal: emptyProposal(ctx.catalogSnapshotId, "Empty finish_turn summary.", {
            needs_confirm: false,
            refuse_reason: "empty summary",
            tool_trace: [tr],
          }),
          trace: tr,
        };
      }
      const highImpact = Boolean(
        args.floor != null ||
          args.filters_patch ||
          (strArr(args.shortlist_ids)?.length ?? 0) > 0,
      );
      const proposal = emptyProposal(ctx.catalogSnapshotId, summary, {
        floor: num(args.floor) ?? (args.floor === null ? null : undefined),
        floor_anchor_model_id:
          args.floor_anchor_model_id === null
            ? null
            : str(args.floor_anchor_model_id) || undefined,
        decide_mode: bool(args.decide_mode),
        cost_speed_bias: num(args.cost_speed_bias),
        highlight_model_ids: strArr(args.highlight_model_ids),
        shortlist_ids: strArr(args.shortlist_ids),
        pinned_model_id:
          args.pinned_model_id === null
            ? null
            : str(args.pinned_model_id) || undefined,
        hovered_model_id:
          args.hovered_model_id === null
            ? null
            : str(args.hovered_model_id) || undefined,
        cinema_mode: bool(args.cinema_mode),
        needs_confirm: highImpact
          ? true
          : typeof args.needs_confirm === "boolean"
            ? args.needs_confirm
            : false,
        // Host panel ignores auto_apply for high-impact; keep flag consistent.
        auto_apply: highImpact
          ? false
          : typeof args.auto_apply === "boolean"
            ? args.auto_apply
            : true,
        refuse_reason:
          args.refuse_reason === null ? null : str(args.refuse_reason) || undefined,
        filters_patch:
          args.filters_patch && typeof args.filters_patch === "object"
            ? (args.filters_patch as Partial<ModelFilters>)
            : undefined,
        economy_basis:
          args.economy_basis === "rate" || args.economy_basis === "task"
            ? args.economy_basis
            : undefined,
        weight_preset: str(args.weight_preset) || undefined,
        tool_trace: [tr],
      });
      return { kind: "finish", proposal, trace: tr };
    }
    default:
      return {
        kind: "tool_result",
        content: { error: `unknown tool: ${name}` },
        trace: { name, ok: false, detail: "unknown tool" },
      };
  }
}
