/**
 * Atlas LLM endpoint config — BYOK / same-origin proxy, browser localStorage.
 * Protocol is the wire format, not the vendor: any host that speaks
 * OpenAI Chat Completions or Anthropic Messages works (OpenRouter,
 * Ollama, Groq, DeepSeek, vLLM, LiteLLM, Claude official, NUCBox Unsloth, etc.).
 */

export type AtlasLlmProtocol = "openai" | "anthropic";

export interface AtlasLlmConfig {
  /** When false, always use offline router. */
  enabled: boolean;
  /** Wire protocol (not a provider allow-list). */
  protocol: AtlasLlmProtocol;
  /**
   * Base URL for the API root the client will join paths onto.
   * OpenAI-compatible: usually ends with `/v1` (e.g. https://api.openai.com/v1,
   * http://127.0.0.1:11434/v1, https://openrouter.ai/api/v1).
   * Same-origin proxy: `/api/atlas/llm/v1` (Vite injects Unsloth key server-side).
   * Anthropic-compatible: host root or `/v1`.
   */
  baseUrl: string;
  /**
   * Secret — never commit; localStorage only.
   * For same-origin proxy presets use `"proxy"` (dev server injects the real key).
   */
  apiKey: string;
  /** Model id as the endpoint expects it. */
  model: string;
  /** Cap tool rounds (default 6). */
  maxToolRounds: number;
}

export const DEFAULT_ATLAS_LLM_CONFIG: AtlasLlmConfig = {
  enabled: false,
  protocol: "openai",
  baseUrl: "",
  apiKey: "",
  model: "",
  maxToolRounds: 6,
};

/**
 * Simon's NUCBox Unsloth Studio OpenAI proxy (Ornith sticky workhorse).
 * Browser talks same-origin `/api/atlas/llm/*` so CORS is not required;
 * Vite (or a local reverse proxy) forwards to Tailscale :8890 and injects the agent key.
 */
export const ATLAS_PRESET_NUCBOX_UNSLOTH: AtlasLlmConfig = {
  enabled: true,
  protocol: "openai",
  baseUrl: "/api/atlas/llm/v1",
  apiKey: "proxy",
  model: "SC117/Ornith-1.0-35B-MTP-APEX-GGUF",
  maxToolRounds: 6,
};


export const ATLAS_LLM_PRESETS = {
  "nucbox-unsloth": ATLAS_PRESET_NUCBOX_UNSLOTH,
} as const;

export type AtlasLlmPresetId = keyof typeof ATLAS_LLM_PRESETS;

const STORAGE_KEY = "atlas.llm.config.v1";

/** Relative base or explicit proxy marker → auth may be injected by the origin. */
export function usesProxyAuth(cfg: AtlasLlmConfig): boolean {
  const base = cfg.baseUrl.trim();
  const key = cfg.apiKey.trim().toLowerCase();
  return (
    base.startsWith("/") ||
    key === "proxy" ||
    key === "local" ||
    key === "same-origin"
  );
}

export function isAtlasLlmReady(cfg: AtlasLlmConfig): boolean {
  if (!cfg.enabled) return false;
  if (!(cfg.protocol === "openai" || cfg.protocol === "anthropic")) return false;
  if (!cfg.baseUrl.trim() || !cfg.model.trim()) return false;
  if (usesProxyAuth(cfg)) return true;
  return Boolean(cfg.apiKey.trim());
}

export function loadAtlasLlmConfig(): AtlasLlmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...ATLAS_PRESET_NUCBOX_UNSLOTH }; // default: LLM always on (NUCBox Unsloth)
    const parsed = JSON.parse(raw) as Partial<AtlasLlmConfig>;
    return normalizeAtlasLlmConfig(parsed);
  } catch {
    return { ...DEFAULT_ATLAS_LLM_CONFIG };
  }
}

export function saveAtlasLlmConfig(cfg: AtlasLlmConfig): void {
  const next = normalizeAtlasLlmConfig(cfg);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearAtlasLlmConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function applyAtlasLlmPreset(id: AtlasLlmPresetId): AtlasLlmConfig {
  const preset = ATLAS_LLM_PRESETS[id];
  const next = normalizeAtlasLlmConfig({ ...preset });
  saveAtlasLlmConfig(next);
  return next;
}

export function normalizeAtlasLlmConfig(
  partial: Partial<AtlasLlmConfig> | null | undefined,
): AtlasLlmConfig {
  const p = partial ?? {};
  const protocol: AtlasLlmProtocol =
    p.protocol === "anthropic" ? "anthropic" : "openai";
  const rounds =
    typeof p.maxToolRounds === "number" && Number.isFinite(p.maxToolRounds)
      ? Math.max(1, Math.min(12, Math.floor(p.maxToolRounds)))
      : DEFAULT_ATLAS_LLM_CONFIG.maxToolRounds;
  let baseUrl = typeof p.baseUrl === "string" ? p.baseUrl.trim() : "";
  // Keep relative proxy paths; strip trailing slash on absolutes and relatives alike.
  if (baseUrl.length > 1) baseUrl = baseUrl.replace(/\/+$/, "");
  return {
    enabled: Boolean(p.enabled),
    protocol,
    baseUrl,
    apiKey: typeof p.apiKey === "string" ? p.apiKey : "",
    model: typeof p.model === "string" ? p.model.trim() : "",
    maxToolRounds: rounds,
  };
}

/** Safe summary for UI (never includes apiKey). */
export function describeAtlasLlmConfig(cfg: AtlasLlmConfig): string {
  if (!cfg.enabled) return "Offline tools only";
  if (!isAtlasLlmReady(cfg)) {
    return usesProxyAuth(cfg)
      ? "LLM incomplete (need base URL + model)"
      : "LLM incomplete (need base URL, model, API key)";
  }
  const host = (() => {
    if (cfg.baseUrl.startsWith("/")) {
      return `same-origin ${cfg.baseUrl}`;
    }
    try {
      return new URL(cfg.baseUrl).host;
    } catch {
      return cfg.baseUrl.slice(0, 40);
    }
  })();
  const shortModel =
    cfg.model.length > 42 ? `${cfg.model.slice(0, 40)}…` : cfg.model;
  return `${cfg.protocol} · ${shortModel} @ ${host}`;
}
