/**
 * Official OpenRouter models list API (list prices).
 * GET https://openrouter.ai/api/v1/models
 * Optional Authorization: Bearer OPENROUTER_API_KEY
 * Attribute list prices to OpenRouter when displayed.
 */

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const OPENROUTER_UA = "llm-3d-viz-catalog/0.1 (+https://viz.kyanitelabs.tech; OpenRouter models API)";

export async function fetchOpenRouterModels(options = {}) {
  const headers = {
    Accept: "application/json",
    "User-Agent": OPENROUTER_UA,
  };
  const key =
    options.apiKey ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OR_API_KEY?.trim() ||
    "";
  if (key) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetch(options.url || OPENROUTER_MODELS_URL, {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, models: [], error: `HTTP ${res.status}` };
    }
    const body = await res.json();
    // D06: A successful response with a non-array `data` is a schema regression,
    // not an empty catalog. Return ok:false so callers fail instead of silently
    // treating it as zero models.
    if (!Array.isArray(body.data)) {
      return { ok: false, status: res.status, models: [], error: "response data is not an array (schema regression?)" };
    }
    return { ok: true, models: body.data, authenticated: Boolean(key) };
  } catch (err) {
    return { ok: false, models: [], error: String(err) };
  }
}
