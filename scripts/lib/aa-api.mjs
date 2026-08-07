/**
 * Official Artificial Analysis Data API client (Free tier language models).
 *
 * Docs: https://artificialanalysis.ai/data-api/docs
 * OpenAPI: https://artificialanalysis.ai/api/v2/openapi
 * Auth: x-api-key header (required; free key from https://artificialanalysis.ai/data-api )
 * Attribution: credit Artificial Analysis when displaying API data (footer/byline).
 *
 * Does NOT scrape artificialanalysis.ai HTML.
 */

import {
  deriveFamilyId,
  deriveEffortTierFromName,
} from "../../src/lib/family-effort.shared.ts";

export const AA_API_BASE = "https://artificialanalysis.ai/api/v2";
export const AA_UA = "llm-3d-viz-catalog/0.1 (+https://viz.kyanitelabs.tech; AA Data API)";

/** Env: AA_API_KEY or ARTIFICIAL_ANALYSIS_API_KEY */
export function resolveAaApiKey(env = process.env) {
  return (
    env.AA_API_KEY?.trim() ||
    env.ARTIFICIAL_ANALYSIS_API_KEY?.trim() ||
    ""
  );
}

/**
 * Map Free-tier API model object → catalog row (same shape as mapAaRow).
 * @param {object} m FreeModelData from OpenAPI
 * @param {string} today ISO date
 * @param {string} sourceLabel
 */
export function mapAaApiModel(m, today, sourceLabel = "AA Data API free") {
  const evals = m.evaluations || {};
  const pricing = m.pricing || {};
  const perf = m.performance || {};
  const costBlock = m.artificial_analysis_intelligence_index_cost;

  const tps =
    typeof perf.median_output_tokens_per_second === "number"
      ? perf.median_output_tokens_per_second
      : null;
  const priceIn =
    typeof pricing.price_1m_input_tokens === "number" ? pricing.price_1m_input_tokens : null;
  const priceOut =
    typeof pricing.price_1m_output_tokens === "number" ? pricing.price_1m_output_tokens : null;
  // Free tier has no blended field — applyAaDerivedBlend fills 7:2:1 later.
  const intel =
    typeof evals.artificial_analysis_intelligence_index === "number"
      ? evals.artificial_analysis_intelligence_index
      : null;
  const ttftS =
    typeof perf.median_time_to_first_token_seconds === "number"
      ? perf.median_time_to_first_token_seconds
      : typeof perf.median_time_to_first_answer_token_seconds === "number"
        ? perf.median_time_to_first_answer_token_seconds
        : null;
  const ttftMs = typeof ttftS === "number" ? ttftS * 1000 : null;
  const name = m.name || m.slug || "Unknown";
  const provider = m.model_creator?.name || "Unknown";
  // Free API does not expose open-weights flag — default closed unless name cues open.
  const openness = /\b(open|oss|llama|mistral|qwen|deepseek)\b/i.test(name) ? "open" : "closed";
  const family_id = deriveFamilyId(name);
  const effort_tier = deriveEffortTierFromName(name, false);
  const release =
    typeof m.release_date === "string"
      ? m.release_date.slice(0, 10)
      : m.release_date instanceof Date
        ? m.release_date.toISOString().slice(0, 10)
        : today;

  let cost_per_index_task_usd = null;
  if (costBlock?.cost_per_task && typeof costBlock.cost_per_task.total_cost === "number") {
    cost_per_index_task_usd = costBlock.cost_per_task.total_cost;
  }

  // Free shape has no Index-task wall time; leave null (do not invent).
  const time_per_index_task_s = null;

  return {
    model: name,
    provider,
    openness,
    modality: ["text"],
    // Free API omits context window (Pro field) — use a positive placeholder so
    // the catalog schema accepts rows; not used as a plot axis.
    context_length: 128_000,
    release_date: release,
    data_date: today,
    source: sourceLabel,
    source_url: `https://artificialanalysis.ai/models/${m.slug || ""}`,
    tps,
    ttft: ttftMs,
    price_in_per_M: priceIn,
    price_out_per_M: priceOut,
    blended_price_per_M: null,
    aa_intelligence_index: intel,
    arena_elo: null,
    swe_bench: null,
    aider_pct: null,
    gpqa: null,
    reasoning: /\b(reason|think|adaptive)\b/i.test(name),
    family_id,
    effort_tier,
    cost_per_index_task_usd,
    time_per_index_task_s,
    sources: {
      aa_intelligence_index: { origin: "aa-api", kind: "measured" },
      tps: tps != null ? { origin: "aa-api", kind: "measured" } : undefined,
      ttft: ttftMs != null ? { origin: "aa-api", kind: "measured" } : undefined,
      price_in_per_M: priceIn != null ? { origin: "aa-api", kind: "measured" } : undefined,
      price_out_per_M: priceOut != null ? { origin: "aa-api", kind: "measured" } : undefined,
      cost_per_index_task_usd:
        cost_per_index_task_usd != null ? { origin: "aa-api", kind: "measured" } : undefined,
    },
  };
}

/**
 * Paginate GET /language/models/free until has_more is false.
 * @returns {Promise<{ ok: boolean, models: object[], tier?: string, error?: string, pages?: number }>}
 */
export async function fetchAaLanguageModelsFree(options = {}) {
  const key = options.apiKey ?? resolveAaApiKey();
  if (!key) {
    return {
      ok: false,
      models: [],
      error:
        "AA_API_KEY (or ARTIFICIAL_ANALYSIS_API_KEY) required. Get a free key at https://artificialanalysis.ai/data-api — HTML scraping is not used.",
    };
  }

  const base = options.baseUrl || AA_API_BASE;
  const models = [];
  let page = 1;
  let pages = 0;
  let tier;
  const maxPages = options.maxPages ?? 20;

  while (page <= maxPages) {
    const url = `${base}/language/models/free?page=${page}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": AA_UA,
        "x-api-key": key,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        models,
        error: `${url} → ${res.status} ${body.slice(0, 200)}`,
        pages,
      };
    }
    const json = await res.json();
    tier = json.tier ?? tier;
    const batch = Array.isArray(json.data) ? json.data : [];
    models.push(...batch);
    pages += 1;
    const pag = json.pagination || {};
    if (!pag.has_more) break;
    page = (pag.page || page) + 1;
    // Be polite within Free 100 req/24h budget
    if (options.delayMs) {
      await new Promise((r) => setTimeout(r, options.delayMs));
    }
  }

  return { ok: true, models, tier, pages };
}
