/**
 * Canonical unit formatting for benchmark metrics.
 *
 * One source of truth so the value-score readout (`.model-readout`), the
 * stage tooltip (`.stage-tooltip`), and the incomplete-data list all render
 * identical units. The dataset stores `ttft` in **milliseconds** and price in
 * USD per 1M tokens (AA 7:2:1 blend); these helpers translate raw fields into
 * the human-facing strings the instrument shows.
 */

import type { Model } from "../data/models";

/** Output tokens/sec, integer — "172 tok/s" (S+ numeral craft). */
export function formatTps(value: number | null): string {
  return value === null
    ? "—"
    : `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} tok/s`;
}

/** USD per 1M tokens, always two decimals — "$7.70 /M tokens". */
export function formatPricePerM(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)} /M tokens`;
}

/** AA Intelligence Index, one decimal — "49.9". */
export function formatIntelligence(value: number | null): string {
  return value === null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** Time-to-first-token: dataset stores ms, display in seconds — "2.4s" / "143.5s". */
export function formatTtftSeconds(ms: number | null): string {
  return ms === null
    ? "—"
    : `${(ms / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}s`;
}

/**
 * A TTFT at or above this many milliseconds is "multi-minute" — in this field
 * exclusively reasoning/thinking-effort models whose measured latency includes
 * substantial thinking time on a long prompt. (frontier-math is silent on the
 * threshold; 60s is the literal reading of "multi-minute".)
 */
export const TTFT_MULTI_MINUTE_MS = 60_000;

/**
 * The honest caveat carried wherever a multi-minute reasoning-model TTFT is
 * shown. Explains WHY the number is large: it includes the model's thinking
 * time, measured on the long-prompt median — not raw network/streaming latency.
 */
export const TTFT_CAVEAT = "incl. thinking time (long-prompt median)";

/**
 * Name-only fallback for classifying a model as a reasoning/thinking-effort
 * model — used ONLY when a row omits the structured `reasoning` field. It is
 * deliberately conservative: it matches an explicit "(reasoning)" /
 * "adaptive reasoning" marker (but NOT "non-reasoning", which the old bare
 * `includes("reasoning")` substring wrongly classified as a reasoner), a
 * "thinking" marker, or a parenthesized effort tier "(max)"/"(high)"/"(xhigh)".
 * Authoritative classification is the per-row `reasoning` boolean; this exists
 * for legacy/incomplete rows.
 */
function nameLooksReasoning(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    // "reasoning" as a marker, but not the "non-reasoning" negation.
    /(?<!non-)reasoning/.test(lower) ||
    lower.includes("thinking") ||
    /\((xhigh|max|high)\)/.test(lower)
  );
}

/**
 * Whether a model is a reasoning/thinking-effort model — the only models whose
 * measured TTFT can honestly include substantial thinking time. The structured
 * `reasoning` field is authoritative when present; the name heuristic is a
 * fallback for rows that omit it. A bare latency threshold alone is wrong,
 * because a slow NON-reasoning model is just slow, not "thinking".
 */
export function isReasoningModel(model: Pick<Model, "model" | "reasoning">): boolean {
  return model.reasoning !== undefined ? model.reasoning : nameLooksReasoning(model.model);
}

/**
 * The TTFT caveat when `model` is a reasoning model whose TTFT is multi-minute,
 * else "". Both gates are required: a fast reasoner (< 60s) has no thinking
 * time to disclose, and a slow non-reasoner has no thinking time to attribute
 * its latency to — the caveat must not appear for either.
 */
export function ttftCaveat(model: Pick<Model, "ttft" | "model" | "reasoning">): string {
  return isReasoningModel(model) &&
    model.ttft !== null &&
    model.ttft >= TTFT_MULTI_MINUTE_MS
    ? TTFT_CAVEAT
    : "";
}
