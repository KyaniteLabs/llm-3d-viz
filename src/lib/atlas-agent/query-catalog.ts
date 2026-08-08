/**
 * Atlas constraint-composition: the capability the regex intent router lacks.
 *
 * Users ask compositional questions ("cheapest open model above floor 50 with
 * vision") that no single-intent regex can express. This module (a) parses a
 * natural-language utterance into structured per-axis constraints and (b) runs
 * them as one filter+rank pass over the catalog. Shared by the offline router
 * AND the LLM tool loop — the same deterministic query power either path uses.
 */

import type { Model } from "../../data/models";
import { frontier } from "../pareto";
import { displayName } from "../display-name";
import type { AtlasAgentContext, AtlasToolTrace } from "./types";
import { findModel, summary, type ModelSummary } from "./tools";

export type QueryObjective = "min_cost" | "max_speed" | "max_intelligence";

/** Structured, all-optional constraints. Any subset may be set. */
export interface CatalogConstraints {
  objective?: QueryObjective;
  /** Minimum intelligence Index (a.k.a. floor). */
  floor?: number;
  openness?: "open" | "closed";
  /** $/M price ceiling. */
  maxPrice?: number;
  /** tok/s speed floor. */
  minTps?: number;
  /** Require this modality (e.g. "vision"). */
  modality?: string;
  /** Minimum context window (tokens). */
  minContext?: number;
  /** Require a reasoning / thinking model. */
  reasoning?: boolean;
  /** Restrict to the Pareto frontier (non-dominated on speed/cost/intelligence). */
  frontierOnly?: boolean;
  /** Minimum SWE-bench (coding capability). */
  minSweBench?: number;
  /** Minimum GPQA (hard-reasoning capability). */
  minGpqa?: number;
  /** Provider substring to include. */
  provider?: string;
  /** Provider substring to exclude. */
  excludeProvider?: string;
  limit?: number;
}

/** Result of parsing an utterance: constraints + how many axes were recognized. */
export interface ParsedConstraints {
  constraints: CatalogConstraints;
  /** Count of distinct axes the parser detected (drives compositional routing). */
  signals: number;
}

/** Axes the legacy single-intent regex stack cannot express. */
const NEW_AXES: (keyof CatalogConstraints)[] = [
  "maxPrice",
  "minTps",
  "minContext",
  "modality",
  "reasoning",
  "frontierOnly",
  "minSweBench",
  "minGpqa",
  "excludeProvider",
];

function num(v: number | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/** nulls-last numeric comparator (missing metrics sort to the bottom). */
function byMetric(get: (m: Model) => number | null, dir: 1 | -1) {
  return (a: Model, b: Model) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * dir;
  };
}

/**
 * Filter + rank the catalog against structured constraints. Pure: numbers only
 * from the catalog. Returns ModelSummary[] + a trace, matching the existing
 * tool contract so it drops into both the offline router and the LLM dispatch.
 */
export function toolQueryCatalog(
  ctx: AtlasAgentContext,
  c: CatalogConstraints = {},
): { result: ModelSummary[]; trace: AtlasToolTrace } {
  const pool = ctx.visible.length ? ctx.visible.slice() : ctx.catalog.slice();
  const f = num(c.floor) ? c.floor : ctx.floor;

  let rows = pool.filter((m) => {
    if (num(c.floor) || c.floor === 0) {
      if (m.aa_intelligence_index == null || m.aa_intelligence_index < f) return false;
    }
    if (c.openness && m.openness !== c.openness) return false;
    if (num(c.maxPrice) && (m.blended_price_per_M == null || m.blended_price_per_M > c.maxPrice!))
      return false;
    if (num(c.minTps) && (m.tps == null || m.tps < c.minTps!)) return false;
    if (c.modality && !(m.modality ?? []).includes(c.modality as Model["modality"][number]))
      return false;
    if (num(c.minContext) && m.context_length < c.minContext!) return false;
    if (c.reasoning === true && !m.reasoning) return false;
    if (num(c.minSweBench) && (m.swe_bench == null || m.swe_bench < c.minSweBench!)) return false;
    if (num(c.minGpqa) && (m.gpqa == null || m.gpqa < c.minGpqa!)) return false;
    if (c.provider && !m.provider.toLowerCase().includes(c.provider.toLowerCase())) return false;
    if (c.excludeProvider && m.provider.toLowerCase().includes(c.excludeProvider.toLowerCase()))
      return false;
    return true;
  });

  if (c.frontierOnly) {
    const onFrontier = new Set(frontier(rows).map((m) => m.model));
    rows = rows.filter((m) => onFrontier.has(m.model));
  }

  const sorter =
    c.objective === "min_cost"
      ? byMetric((m) => m.blended_price_per_M, 1)
      : c.objective === "max_speed"
        ? byMetric((m) => m.tps, -1)
        : byMetric((m) => m.aa_intelligence_index, -1);
  rows.sort(sorter);

  const limit = num(c.limit) ? c.limit! : 5;
  const top = rows.slice(0, limit).map(summary);

  const bits: string[] = [];
  if (c.objective) bits.push(c.objective);
  if (num(c.floor) || c.floor === 0) bits.push(`≥${f} Index`);
  if (c.openness) bits.push(c.openness);
  if (num(c.maxPrice)) bits.push(`≤$${c.maxPrice}/M`);
  if (num(c.minTps)) bits.push(`≥${c.minTps} tok/s`);
  if (c.modality) bits.push(c.modality);
  if (num(c.minContext)) bits.push(`≥${c.minContext} ctx`);
  if (c.reasoning) bits.push("reasoning");
  if (c.frontierOnly) bits.push("frontier");
  if (num(c.minSweBench)) bits.push(`SWE≥${c.minSweBench}`);
  if (num(c.minGpqa)) bits.push(`GPQA≥${c.minGpqa}`);
  if (c.provider) bits.push(`@${c.provider}`);
  if (c.excludeProvider) bits.push(`!${c.excludeProvider}`);

  return {
    result: top,
    trace: {
      name: "query_catalog",
      ok: true,
      detail: `${top.length} match(es)${bits.length ? ` · ${bits.join(" · ")}` : ""}`,
    },
  };
}

const PROVIDER_HINTS = [
  "anthropic",
  "openai",
  "google",
  "deepmind",
  "meta",
  "mistral",
  "deepseek",
  "alibaba",
  "qwen",
  "nvidia",
  "xai",
  "x.ai",
  "cohere",
  "amazon",
  "microsoft",
  "phind",
  "01.ai",
  "moonshot",
  "kimi",
  "zhipu",
];

/**
 * Parse a natural-language utterance into structured constraints. Best-effort:
 * recognizes per-axis phrasings and composes them. Returns how many axes fired
 * so the router can decide compositional vs. legacy single-intent handling.
 */
export function parseConstraints(text: string, ctx: AtlasAgentContext): ParsedConstraints {
  const t = ` ${text.toLowerCase().trim()} `;
  const c: CatalogConstraints = {};
  let signals = 0;

  // --- objective (mutually exclusive, priority: cost > speed > intelligence) ---
  if (/\b(cheapest|budget|lowest[-\s]?cost|most affordable|prefer cheap|cheapest price)\b/.test(t)) {
    c.objective = "min_cost";
    signals++;
  } else if (/\b(fastest|lowest latency|prefer fast|quickest|highest speed|most speed)\b/.test(t)) {
    c.objective = "max_speed";
    signals++;
  } else if (/\b(smartest|most intelligent|highest index|best intelligence|brainiest)\b/.test(t)) {
    c.objective = "max_intelligence";
    signals++;
  }

  // --- intelligence floor (number or "smarter than X") ---
  const smarter = t.match(/\bsmarter than\b\s+(.+?)(?:\s+(?:that|which|with|and|under|over|above)\b|[.,?!]|$)/);
  if (smarter) {
    const m = findModel(ctx.catalog, smarter[1]!.trim());
    if (m?.aa_intelligence_index != null) {
      c.floor = m.aa_intelligence_index;
      signals++;
    }
  }
  if (c.floor == null) {
    const fl = t.match(/\b(?:above|over|floor(?:\s+of)?|at least|>=?)\s*(\d{1,3})\b/);
    if (fl) {
      c.floor = Number(fl[1]);
      signals++;
    }
  }

  // --- Pareto frontier ---
  if (/\b(frontier|pareto|efficient|non[-\s]?dominated|best value|on the frontier)\b/.test(t)) {
    c.frontierOnly = true;
    signals++;
  }

  // --- openness ---
  if (
    /\b(open[-\s]?(?:weights?|source|models?|ones?|llms?|options?)|only open|show open|local\b|self[-\s]?host)\b/.test(
      t,
    ) ||
    // Bare "open" as an adjective, but not openai/opening/open the/open source.
    /\bopen\b(?!\s*(?:ai|ing|ed|the|source))/.test(t)
  ) {
    c.openness = "open";
    signals++;
  } else if (/\b(closed|proprietary|api[-\s]?only)\b/.test(t)) {
    c.openness = "closed";
    signals++;
  }

  // --- price ceiling ($/M) ---
  const price = t.match(/\$\s*(\d+(?:\.\d+)?)/) || t.match(/\b(?:under|below|cheaper than|less than|max)\s+(\d+(?:\.\d+)?)\s*(?:\/?m|per\s*million)\b/);
  if (price) {
    c.maxPrice = Number(price[1]);
    signals++;
  }

  // --- speed floor (tok/s) ---
  const tps = t.match(/\b(?:faster than|at least|min(?:imum)?\s+)\s*(\d+)\s*tok/) || t.match(/\b(\d+)\s*\+?\s*tok\s*\/?\s*s\b/);
  if (tps) {
    c.minTps = Number(tps[1]);
    signals++;
  }

  // --- modality ---
  if (/\b(vision|multimodal|images?|see images?|can see)\b/.test(t)) {
    c.modality = "vision";
    signals++;
  } else if (/\b(audio|speech|voice(?:\s+in)?|listens?)\b/.test(t)) {
    c.modality = "audio";
    signals++;
  }

  // --- context window ---
  const ctxM =
    t.match(/\b(\d{1,3})(k)?\s*context\b/) ||
    t.match(/\bcontext(?:\s+(?:of|>=?|at least|min(?:imum)?))?\s+(\d{1,3})(k)?\b/);
  if (ctxM) {
    const val = Number(ctxM[1] ?? ctxM[3]);
    const kilo = Boolean(ctxM[2] ?? ctxM[4]);
    c.minContext = val * (kilo ? 1000 : 1);
    signals++;
  }

  // --- reasoning / thinking ---
  if (/\b(reasoning|thinking model|thinking-capable|reasoner)\b/.test(t)) {
    c.reasoning = true;
    signals++;
  }

  // --- coding capability (SWE-bench) ---
  if (/\b(good|great|best)\s+at\s+(coding|code|programming|software|engineering)\b/.test(t) || /\b(for|at)\s+(coding|programming|software dev|swe)\b/.test(t)) {
    c.minSweBench = 40;
    signals++;
  }

  // --- hard-reasoning capability (GPQA) ---
  if (/\b(good|great|best)\s+at\s+(hard reasoning|expert q&a|deep reasoning|reasoning)\b/.test(t)) {
    c.minGpqa = 50;
    signals++;
  }

  // --- provider include / exclude ---
  for (const p of PROVIDER_HINTS) {
    const word = p.replace(/\./g, "\\.");
    const excl = t.match(new RegExp(`\\b(?:not|except|without|exclude|hide)\\s+${word}\\b`));
    if (excl) {
      c.excludeProvider = p;
      signals++;
      break;
    }
  }
  if (!c.excludeProvider) {
    for (const p of PROVIDER_HINTS) {
      const word = p.replace(/\./g, "\\.");
      const incl = t.match(new RegExp(`\\b(?:from|by|made by|only)\\s+${word}\\b`)) || t.match(new RegExp(`\\b${word}\\s+(?:models?|only)\\b`));
      if (incl) {
        c.provider = p;
        signals++;
        break;
      }
    }
  }

  return { constraints: c, signals };
}

/** True when the parsed constraints should take the compositional path. */
export function isCompositional(parsed: ParsedConstraints): boolean {
  if (parsed.signals >= 2) return true;
  // A single signal on an axis the legacy regex stack can't express.
  return NEW_AXES.some((k) => parsed.constraints[k] != null);
}

/** One-line human label for the active constraints (for the spoken summary). */
export function describeConstraints(c: CatalogConstraints): string {
  const parts: string[] = [];
  if (c.objective === "min_cost") parts.push("cheapest");
  else if (c.objective === "max_speed") parts.push("fastest");
  else if (c.objective === "max_intelligence") parts.push("smartest");
  if (c.openness) parts.push(c.openness);
  if (c.frontierOnly) parts.push("frontier");
  if (c.modality) parts.push(`${c.modality}-capable`);
  if (c.reasoning) parts.push("reasoning");
  if (c.minContext) parts.push(`${c.minContext >= 1000 ? `${c.minContext / 1000}k` : c.minContext} ctx`);
  if (c.maxPrice != null) parts.push(`≤$${c.maxPrice}/M`);
  if (c.minTps != null) parts.push(`≥${c.minTps} tok/s`);
  if (c.minSweBench != null) parts.push("coding-strong");
  if (c.minGpqa != null) parts.push("hard-reasoning");
  if (c.floor != null) parts.push(`≥${c.floor} Index`);
  if (c.provider) parts.push(`from ${displayName(c.provider)}`);
  if (c.excludeProvider) parts.push(`not ${displayName(c.excludeProvider)}`);
  return parts.length ? parts.join(" · ") : "best match";
}

/**
 * Constraint axes the catalog has NO data for (so any filter on them always
 * yields empty). Returns human labels, e.g. ["vision modality", "SWE-bench"].
 * Used to give honest feedback instead of a misleading "no match".
 */
export function unsupportedDataAxes(ctx: AtlasAgentContext, c: CatalogConstraints): string[] {
  const gaps: string[] = [];
  if (
    c.modality &&
    !ctx.catalog.some((m) => (m.modality ?? []).includes(c.modality as Model["modality"][number]))
  )
    gaps.push(`${c.modality} modality`);
  if (c.minSweBench != null && !ctx.catalog.some((m) => m.swe_bench != null))
    gaps.push("SWE-bench (coding)");
  if (c.minGpqa != null && !ctx.catalog.some((m) => m.gpqa != null))
    gaps.push("GPQA (hard reasoning)");
  return gaps;
}

/** A copy of `c` with the unsupported-data axes removed (for de-scoped re-query). */
export function dropUnsupportedData(ctx: AtlasAgentContext, c: CatalogConstraints): CatalogConstraints {
  const gaps = unsupportedDataAxes(ctx, c);
  if (!gaps.length) return c;
  const c2: CatalogConstraints = { ...c };
  if (gaps.some((g) => g.endsWith("modality"))) delete c2.modality;
  if (gaps.some((g) => g.includes("SWE-bench"))) delete c2.minSweBench;
  if (gaps.some((g) => g.includes("GPQA"))) delete c2.minGpqa;
  return c2;
}
