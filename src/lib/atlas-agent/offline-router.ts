/**
 * Offline Atlas agent: multi-step tool use without an LLM.
 * Real agent loop = parse intent → tools → structured proposal.
 */

import { displayName } from "../display-name";
import { DEFAULT_FILTERS } from "../filters";
import type { ModelFilters } from "../filters";
import type { AtlasAgentContext, AtlasProposal, AtlasToolTrace } from "./types";
import { emptyProposal } from "./types";
import type { CatalogConstraints } from "./query-catalog";
import {
  describeConstraints,
  dropUnsupportedData,
  isCompositional,
  parseConstraints,
  toolQueryCatalog,
  unsupportedDataAxes,
} from "./query-catalog";
import {
  toolCompareModels,
  toolGetCatalogMeta,
  toolGetModel,
  toolListEligible,
  toolProposeFloor,
  toolRankEligible,
  toolSearchModels,
} from "./tools";

function speakableList(ids: string[], max = 3): string {
  const names = ids.slice(0, max).map((id) => displayName(id));
  if (names.length === 0) return "none";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** Map compositional constraints onto the viz filter surface (best-effort). */
function constraintFiltersPatch(c: CatalogConstraints): Partial<ModelFilters> {
  const patch: Partial<ModelFilters> = {};
  if (c.openness) patch.openness = c.openness;
  if (c.reasoning) patch.excludeNonReasoning = true;
  return patch;
}

/** Shallow equality over the set constraint axes (ignores `limit`). */
function sameConstraints(a: CatalogConstraints, b: CatalogConstraints): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => k !== "limit"));
  for (const k of keys) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
  }
  return true;
}

/**
 * Run the offline agent on a natural-language or slash command.
 */
export function runOfflineAtlas(
  utterance: string,
  ctx: AtlasAgentContext,
): AtlasProposal {
  const raw = utterance.trim();
  const text = raw.toLowerCase();
  const trace: AtlasToolTrace[] = [];
  const snap = ctx.catalogSnapshotId;

  if (!raw) {
    return emptyProposal(snap, "Say a command — for example, floor 50, or cheapest eligible.", {
      needs_confirm: false,
      tool_trace: [],
    });
  }

  // --- meta / help ---
  if (/^(help|\?|what can you do|commands)/i.test(raw)) {
    const meta = toolGetCatalogMeta(ctx);
    trace.push(meta.trace);
    return emptyProposal(
      snap,
      `I can set an intelligence floor, list who's eligible, pick cheapest or fastest among them, or explain why a model is out. Catalog has ${meta.result.model_count} models; current floor ${meta.result.floor}. Try: floor 50. Floor from Claude. Cheapest eligible. Why is Gemini out.`,
      { needs_confirm: false, tool_trace: trace },
    );
  }

  // --- compositional constraint query ---
  // Handles multi-axis questions the single-intent regex blocks below cannot
  // express ("cheapest open model above floor 50 with vision"). Fires only when
  // ≥2 axes are detected, or a single axis the legacy intents don't cover. Plain
  // shorthands ("cheapest eligible", "floor 50") keep hitting their own intents.
  {
    const parsed = parseConstraints(raw, ctx);
    if (isCompositional(parsed)) {
      const c = parsed.constraints;
      const q = toolQueryCatalog(ctx, c);
      trace.push(q.trace);
      let ids = q.result.map((s) => s.id);
      let active = c;
      let label = describeConstraints(c);

      // Empty result? If a constraint sits on an axis the catalog has no data
      // for (vision modality, SWE-bench, GPQA), de-scope it and re-query so the
      // user still gets real answers — and say so honestly.
      if (ids.length === 0) {
        const gaps = unsupportedDataAxes(ctx, c);
        const scoped = dropUnsupportedData(ctx, c);
        const hasOtherAxes = Object.entries(scoped).some(
          ([k, v]) => k !== "limit" && v != null,
        );
        if (gaps.length && hasOtherAxes && !sameConstraints(scoped, c)) {
          const q2 = toolQueryCatalog(ctx, scoped);
          trace.push(q2.trace);
          const ids2 = q2.result.map((s) => s.id);
          if (ids2.length) {
            ids = ids2;
            active = scoped;
            label = `${describeConstraints(scoped)} (ignored: ${gaps.join(", ")})`;
          }
        }
        if (ids.length === 0) {
          const why = gaps.length
            ? `I don't track ${gaps.join(", ")} in this catalog yet, so I can't answer that.`
            : `No models match (${label}). Try loosening a constraint.`;
          return emptyProposal(snap, why, {
            needs_confirm: false,
            refuse_reason: gaps.length ? "unsupported data" : "empty query",
            tool_trace: trace,
          });
        }
      }

      // Objective set → Decide + ranked shortlist, honoring every constraint.
      if (active.objective) {
        return emptyProposal(
          snap,
          `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${speakableList(ids)}. Apply Decide with this ranking?`,
          {
            floor: active.floor ?? ctx.floor,
            decide_mode: true,
            cost_speed_bias:
              active.objective === "min_cost"
                ? -1
                : active.objective === "max_speed"
                  ? 1
                  : ctx.costSpeedBias,
            shortlist_ids: ids,
            highlight_model_ids: ids,
            filters_patch: constraintFiltersPatch(active),
            needs_confirm: true,
            tool_trace: trace,
          },
        );
      }
      // Pure filter query → narrow the view + highlight the matches.
      return emptyProposal(
        snap,
        `${ids.length} ${label} model(s): ${speakableList(ids)}. Apply to filter the view?`,
        {
          filters_patch: constraintFiltersPatch(active),
          highlight_model_ids: ids,
          needs_confirm: true,
          tool_trace: trace,
        },
      );
    }
  }

  // --- floor from number ---
  {
    const m =
      text.match(/\bfloor\s*(?:to|=|:)?\s*(\d{1,3})\b/) ||
      text.match(/^\/?floor\s+(\d{1,3})\b/) ||
      text.match(/\bset\s+(?:intelligence\s+)?(?:floor\s+)?(?:to\s+)?(\d{1,3})\b/);
    if (m) {
      const prop = toolProposeFloor(ctx, { floor: Number(m[1]) });
      trace.push(prop.trace);
      if (!prop.result) {
        return emptyProposal(snap, "I couldn't parse that floor number.", {
          needs_confirm: false,
          refuse_reason: prop.trace.detail ?? "bad floor",
          tool_trace: trace,
        });
      }
      const rank = toolRankEligible(ctx, prop.result.floor, "balanced", 3);
      trace.push(rank.trace);
      const ids = rank.result.shortlist.map((s) => s.id);
      return emptyProposal(
        snap,
        `Floor ${prop.result.floor}. Among eligible, balanced shortlist: ${speakableList(ids)}. Apply to update Decide?`,
        {
          floor: prop.result.floor,
          floor_anchor_model_id: null,
          decide_mode: true,
          cost_speed_bias: rank.result.bias,
          shortlist_ids: ids,
          highlight_model_ids: ids,
          needs_confirm: true,
          auto_apply: false,
          tool_trace: trace,
        },
      );
    }
  }

  // --- floor from model name ---
  {
    const m =
      text.match(/\bfloor\s+from\s+(.+)$/i) ||
      text.match(/\banchor\s+(?:to\s+|on\s+)?(.+)$/i) ||
      text.match(/\buse\s+(.+?)\s+as\s+(?:the\s+)?floor\b/i);
    if (m) {
      const name = m[1]!.replace(/[?.!]+$/, "").trim();
      const prop = toolProposeFloor(ctx, { anchor: name });
      trace.push(prop.trace);
      if (!prop.result) {
        const search = toolSearchModels(ctx, name, "catalog");
        trace.push(search.trace);
        return emptyProposal(
          snap,
          prop.trace.detail ?? `No model matched “${name}”.`,
          {
            needs_confirm: false,
            refuse_reason: prop.trace.detail ?? "not found",
            tool_trace: trace,
            highlight_model_ids: search.result.map((s) => s.id).slice(0, 3),
          },
        );
      }
      const rank = toolRankEligible(ctx, prop.result.floor, "balanced", 3);
      trace.push(rank.trace);
      const ids = rank.result.shortlist.map((s) => s.id);
      const anchorLabel = displayName(prop.result.anchor_id!);
      return emptyProposal(
        snap,
        `Floor ${prop.result.floor} from ${anchorLabel}. Shortlist: ${speakableList(ids)}. Apply?`,
        {
          floor: prop.result.floor,
          floor_anchor_model_id: prop.result.anchor_id,
          decide_mode: true,
          shortlist_ids: ids,
          highlight_model_ids: ids,
          needs_confirm: true,
          tool_trace: trace,
        },
      );
    }
  }

  // --- cheapest / fastest / balanced eligible ---
  {
    const cheap = /\b(cheapest|budget|lowest\s*cost|prefer\s*cheap)/.test(text);
    const fast = /\b(fastest|speed|lowest\s*latency|prefer\s*fast)/.test(text);
    const shortlistWord = /\b(shortlist|eligible|decide|who\s+wins|pick)\b/.test(text);
    if (cheap || fast || (shortlistWord && !/\bwhy\b/.test(text))) {
      const objective = cheap ? "min_cost" : fast ? "max_speed" : "balanced";
      const floorMatch = text.match(/\b(?:over|above|floor\s*)(\d{1,3})\b/);
      const floor = floorMatch ? Number(floorMatch[1]) : ctx.floor;
      const list = toolListEligible(ctx, floor);
      trace.push(list.trace);
      const rank = toolRankEligible(ctx, floor, objective, 3);
      trace.push(rank.trace);
      const ids = rank.result.shortlist.map((s) => s.id);
      const label =
        objective === "min_cost" ? "cheapest" : objective === "max_speed" ? "fastest" : "balanced";
      if (ids.length === 0) {
        return emptyProposal(
          snap,
          `No eligible models at floor ${floor} with measured cost and speed.`,
          {
            floor,
            decide_mode: true,
            needs_confirm: true,
            refuse_reason: "empty eligible set",
            tool_trace: trace,
          },
        );
      }
      return emptyProposal(
        snap,
        `At floor ${floor}, ${label} shortlist: ${speakableList(ids)}. Apply Decide with this ranking?`,
        {
          floor,
          decide_mode: true,
          cost_speed_bias: rank.result.bias,
          shortlist_ids: ids,
          highlight_model_ids: ids,
          needs_confirm: true,
          tool_trace: trace,
        },
      );
    }
  }

  // --- why is X out ---
  {
    const m =
      text.match(/\bwhy\s+(?:is\s+)?(.+?)\s+out\b/) ||
      text.match(/\bwhy\s+(?:isn'?t|not)\s+(.+?)(?:\s+eligible)?\b/) ||
      text.match(/\bexplain\s+(.+)$/);
    if (m) {
      const name = m[1]!.replace(/[?.!]+$/g, "").trim();
      const got = toolGetModel(ctx, name);
      trace.push(got.trace);
      if (!got.result) {
        return emptyProposal(snap, `I couldn't find “${name}” in the catalog.`, {
          needs_confirm: false,
          refuse_reason: "not found",
          tool_trace: trace,
        });
      }
      const row = got.result;
      const floor = ctx.floor;
      const reasons: string[] = [];
      if (row.index == null) reasons.push("intelligence Index is unmeasured");
      else if (row.index < floor) reasons.push(`Index ${row.index} is below floor ${floor}`);
      if (row.tps == null) reasons.push("speed (tok/s) is unmeasured");
      if (row.price == null) reasons.push("blended price is unmeasured");
      const inVisible = ctx.visible.some((v) => v.model === row.id);
      if (!inVisible) reasons.push("hidden by current filters (age, multi-effort, open/local, etc.)");
      if (reasons.length === 0) {
        reasons.push("it is eligible under the current floor and has cost+speed — check shortlist ranking");
      }
      return emptyProposal(
        snap,
        `${row.display}: ${reasons.join("; ")}.`,
        {
          needs_confirm: false,
          highlight_model_ids: [row.id],
          tool_trace: trace,
        },
      );
    }
  }

  // --- local VRAM intents ---
  {
    const m = text.match(/\blocal\s*(?:·\s*)?(8|12|24)\b/) || text.match(/\b(8|12|24)\s*gb\b/);
    if (m) {
      const gb = Number(m[1]) as 8 | 12 | 24;
      return emptyProposal(
        snap,
        `Switch to Local · ${gb} GB (open weights that fit ~${gb} GB VRAM). Apply filters?`,
        {
          needs_confirm: true,
          auto_apply: false,
          filters_patch: {
            openness: "open",
            vramMaxGb: gb,
            multiEffortOnly: false,
            ageEnabled: false,
            excludeNonReasoning: true,
          },
          tool_trace: [{ name: "filters", ok: true, detail: `local ${gb}` }],
        },
      );
    }
  }

  // --- full-app navigation: cinema / decide / economy / pin / reset ---
  {
    if (/\b(cinema\s+on|enter\s+cinema|cinema\s+mode)\b/.test(text)) {
      return emptyProposal(snap, "Cinema mode on.", {
        cinema_mode: true,
        needs_confirm: false,
        auto_apply: true,
        tool_trace: [{ name: "set_view", ok: true, detail: "cinema on" }],
      });
    }
    if (/\b(cinema\s+off|exit\s+cinema|leave\s+cinema)\b/.test(text)) {
      return emptyProposal(snap, "Cinema mode off.", {
        cinema_mode: false,
        needs_confirm: false,
        auto_apply: true,
        tool_trace: [{ name: "set_view", ok: true, detail: "cinema off" }],
      });
    }
    if (/\b(decide\s+on|enter\s+decide|open\s+decide)\b/.test(text)) {
      return emptyProposal(snap, "Decide mode on.", {
        decide_mode: true,
        needs_confirm: false,
        auto_apply: true,
        tool_trace: [{ name: "set_view", ok: true, detail: "decide on" }],
      });
    }
    if (/\b(decide\s+off|exit\s+decide|close\s+decide)\b/.test(text)) {
      return emptyProposal(snap, "Decide mode off.", {
        decide_mode: false,
        needs_confirm: false,
        auto_apply: true,
        tool_trace: [{ name: "set_view", ok: true, detail: "decide off" }],
      });
    }
    if (/\b(task\s+economy|per\s+task|\$\/task)\b/.test(text)) {
      return emptyProposal(snap, "Economy basis: $/task · s/task.", {
        economy_basis: "task",
        needs_confirm: false,
        auto_apply: true,
        tool_trace: [{ name: "set_axes", ok: true, detail: "task" }],
      });
    }
    if (/\b(rate\s+economy|per\s+million|\$\/m|tok\/s\s+basis)\b/.test(text)) {
      return emptyProposal(snap, "Economy basis: $/M · tok/s.", {
        economy_basis: "rate",
        needs_confirm: false,
        auto_apply: true,
        tool_trace: [{ name: "set_axes", ok: true, detail: "rate" }],
      });
    }
    if (/\b(reset\s+(filters|scope)|clear\s+filters|default\s+scope)\b/.test(text)) {
      return emptyProposal(
        snap,
        "Reset filters to product defaults. Apply?",
        {
          filters_replace: {
            ...DEFAULT_FILTERS,
            providers: [],
            families: [],
          },
          needs_confirm: true,
          auto_apply: false,
          tool_trace: [{ name: "reset_scope", ok: true, detail: "defaults" }],
        },
      );
    }
    const pin = text.match(/\b(?:pin|focus|select|highlight)\s+(.+)$/i);
    if (pin) {
      const name = pin[1]!.replace(/[?.!]+$/, "").trim();
      const got = toolGetModel(ctx, name);
      trace.push(got.trace);
      if (got.result) {
        return emptyProposal(snap, `Focus ${got.result.display}.`, {
          pinned_model_id: got.result.id,
          hovered_model_id: got.result.id,
          highlight_model_ids: [got.result.id],
          needs_confirm: false,
          auto_apply: true,
          tool_trace: trace,
        });
      }
    }
    const openOnly = /\b(open\s+weights?\s+only|only\s+open|show\s+open)\b/.test(text);
    const closedOnly = /\b(closed\s+only|only\s+closed|proprietary\s+only)\b/.test(text);
    if (openOnly || closedOnly) {
      return emptyProposal(
        snap,
        openOnly ? "Show open weights only. Apply?" : "Show closed weights only. Apply?",
        {
          filters_patch: { openness: openOnly ? "open" : "closed" },
          needs_confirm: true,
          auto_apply: false,
          tool_trace: [{ name: "set_filters", ok: true, detail: openOnly ? "open" : "closed" }],
        },
      );
    }
  }

  // --- compare A vs B ---
  {
    const m = text.match(/\bcompare\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+)$/i);
    if (m) {
      const cmp = toolCompareModels(ctx, [m[1]!.trim(), m[2]!.trim()]);
      trace.push(cmp.trace);
      if (cmp.result.length === 0) {
        return emptyProposal(snap, "Neither model found.", {
          needs_confirm: false,
          refuse_reason: "not found",
          tool_trace: trace,
        });
      }
      const bits = cmp.result.map(
        (r) =>
          `${r.display}: Index ${r.index ?? "—"}, ${r.tps ?? "—"} tok/s, $${r.price ?? "—"}/M`,
      );
      return emptyProposal(snap, bits.join(". ") + ".", {
        needs_confirm: false,
        highlight_model_ids: cmp.result.map((r) => r.id),
        tool_trace: trace,
      });
    }
  }

  // --- search fallback ---
  const search = toolSearchModels(ctx, raw, "catalog");
  trace.push(search.trace);
  if (search.result.length > 0) {
    const ids = search.result.slice(0, 3).map((s) => s.id);
    return emptyProposal(
      snap,
      `Matches: ${speakableList(ids)}. Try “floor from ${displayName(ids[0]!)}” or “why is ${displayName(ids[0]!)} out”.`,
      {
        needs_confirm: false,
        highlight_model_ids: ids,
        tool_trace: trace,
      },
    );
  }

  return emptyProposal(
    snap,
    `I didn't catch a command in “${raw}”. Try floor 50, cheapest eligible, cinema on, pin <model>, open weights only, task economy, or why is X out.`,
    {
      needs_confirm: false,
      refuse_reason: "unparsed",
      tool_trace: trace,
    },
  );
}
