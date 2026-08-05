/**
 * Product catalog scopes.
 *
 * Default instrument focus: **cloud API labs** Simon cares about for
 * multi-effort curve exploration. Full AA scrape remains on disk as
 * `allModels` for later local / on-hold lab work (`?catalog=all`).
 */

/** Labs in the default cloud product set (exact `provider` strings). */
export const CLOUD_LABS = [
  "OpenAI",
  "Anthropic",
  "DeepSeek",
  "Google",
  "NVIDIA",
  "Kimi",
  "Z AI", // GLM
  "Alibaba", // Qwen
  "MiniMax",
] as const;

export type CloudLab = (typeof CLOUD_LABS)[number];

export type CatalogScope = "cloud" | "all";

const CLOUD_SET = new Set<string>(CLOUD_LABS);

export function isCloudLab(provider: string): boolean {
  return CLOUD_SET.has(provider);
}

/** Labs present in the draft scrape but held out of the default cloud focus. */
export const HELD_LABS_FOR_LATER = [
  "AI21 Labs",
  "Amazon",
  "Arcee AI",
  "Celeris",
  "Cohere",
  "IBM",
  "Inception",
  "InclusionAI",
  "KwaiKAT",
  "Liquid AI",
  "LongCat",
  "Meta",
  "Microsoft",
  "Mistral",
  "Multiverse Computing",
  "Nex AGI",
  "Nous Research",
  "Sapiens AI",
  "SpaceXAI",
  "StepFun",
  "Tencent",
  "Thinking Machines",
  "Upstage",
  "Xiaomi",
] as const;

/**
 * Resolve scope from URL search (boot-time).
 * - default / omitted → cloud
 * - `?catalog=all` → full draft catalog (held labs + cloud)
 */
export function catalogScopeFromSearch(
  search: string | URLSearchParams | undefined = typeof window !== "undefined"
    ? window.location.search
    : "",
): CatalogScope {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search : search ? `?${search}` : "")
      : search ?? new URLSearchParams();
  return params.get("catalog") === "all" ? "all" : "cloud";
}
