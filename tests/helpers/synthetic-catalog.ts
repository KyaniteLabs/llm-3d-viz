/**
 * Deterministic synthetic catalog for logic tests.
 *
 * The public data plane (ba01e4d, Path C 2026-08-29) ships every licensed
 * metric (tps, prices, intelligence, task cost/time) as null, so tests that
 * exercise axis, scoring and palette logic cannot borrow the real catalog as
 * input. These rows are invented, spread across the value ranges the real
 * catalog covers, and carry no AA/OpenRouter-derived data.
 */
import { CLOUD_LABS } from "../../src/data/catalog-scope";
import { isScorable, type Model } from "../../src/data/models";

const ROWS = 40;

function syntheticRow(i: number): Model {
  const intelligence = 20 + ((i * 37) % 56); // 20..75
  const tps = 20 + ((i * 53) % 280); // 20..299 tok/s
  const blended = Number((0.1 * 2 ** (i % 10)).toFixed(4)); // $0.10..$51.20 per M
  const ttft = 300 + ((i * 97) % 3000); // ms
  return {
    model: `Synthetic Model ${i}`,
    provider: CLOUD_LABS[i % CLOUD_LABS.length],
    openness: i % 2 === 0 ? "closed" : "open",
    modality: ["text"],
    context_length: 128_000,
    release_date: "2026-03-01",
    data_date: "2026-11-11",
    source: "synthetic test fixture",
    tps,
    ttft,
    price_in_per_M: Number((blended * 0.6).toFixed(4)),
    price_out_per_M: Number((blended * 2.5).toFixed(4)),
    price_cache_per_M: null,
    blended_price_per_M: blended,
    aa_intelligence_index: intelligence,
    arena_elo: null,
    swe_bench: null,
    aider_pct: null,
    gpqa: null,
    reasoning: true,
    family_id: `Synthetic Model ${i}`,
    effort_tier: "default",
    coding_index: null,
    agentic_index: null,
    cost_per_index_task_usd: Number((blended * 0.05).toFixed(4)),
    time_per_index_task_s: null,
  } as Model;
}

/** Fully scorable synthetic rows. */
export const syntheticModels: Model[] = Array.from({ length: ROWS }, (_, i) => syntheticRow(i));

if (!syntheticModels.every(isScorable)) {
  throw new Error("synthetic catalog must be fully scorable");
}
