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

/** Output tokens/sec, one decimal — "172.1 tok/s". */
export function formatTps(value: number | null): string {
  return value === null
    ? "—"
    : `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} tok/s`;
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
 * Whether a model is a reasoning/thinking-effort model — the only models whose
 * measured TTFT can honestly include substantial thinking time. Detected from
 * the curated name: an explicit "(Reasoning)" / "(Adaptive Reasoning, …)"
 * marker, or a parenthesized effort tier "(max)"/"(high)"/"(xhigh)". This is
 * the single heuristic the value-score readout and `ttftCaveat` share — a bare
 * latency threshold alone is wrong, because a slow NON-reasoning model is just
 * slow, not "thinking".
 */
export function isReasoningModel(model: Pick<Model, "model">): boolean {
  const name = model.model.toLowerCase();
  return name.includes("reasoning") || /\((xhigh|max|high)\)/.test(name);
}

/**
 * The TTFT caveat when `model` is a reasoning model whose TTFT is multi-minute,
 * else "". Both gates are required: a fast reasoner (< 60s) has no thinking
 * time to disclose, and a slow non-reasoner has no thinking time to attribute
 * its latency to — the caveat must not appear for either.
 */
export function ttftCaveat(model: Pick<Model, "ttft" | "model">): string {
  return isReasoningModel(model) &&
    model.ttft !== null &&
    model.ttft >= TTFT_MULTI_MINUTE_MS
    ? TTFT_CAVEAT
    : "";
}
