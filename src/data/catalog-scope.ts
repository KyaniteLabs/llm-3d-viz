/**
 * Product catalog scopes.
 *
 * Default instrument focus: **cloud API labs** Simon cares about for
 * multi-effort curve exploration, with a **hard release floor** so the stage
 * never shows pre-2026 rows. Full AA scrape remains on disk as `allModels`
 * for later local / archive work.
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
  "SpaceXAI", // xAI Grok (AA provider string)
  "Meta", // Muse Spark
] as const;

export type CloudLab = (typeof CLOUD_LABS)[number];

export type CatalogScope = "cloud" | "all";

const CLOUD_SET = new Set<string>(CLOUD_LABS);

/** Inclusive lower bound on `release_date` for the product instrument (ISO date). */
export const RELEASE_FLOOR_ISO = "2026-01-01";

export function isCloudLab(provider: string): boolean {
  return CLOUD_SET.has(provider);
}

/**
 * True when release_date is on or after RELEASE_FLOOR_ISO.
 * Missing / unparseable dates fail closed (excluded from product catalog).
 */
export function meetsReleaseFloor(
  releaseDate: string | null | undefined,
  floorIso: string = RELEASE_FLOOR_ISO,
): boolean {
  if (!releaseDate || typeof releaseDate !== "string") return false;
  const day = releaseDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day >= floorIso;
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
  "Microsoft",
  "Mistral",
  "Multiverse Computing",
  "Nex AGI",
  "Nous Research",
  "Sapiens AI",
  "StepFun",
  "Tencent",
  "Thinking Machines",
  "Upstage",
  "Xiaomi",
] as const;

/**
 * Resolve scope from URL search (boot-time).
 * - default / omitted → cloud labs + release floor
 * - `?catalog=all` → every lab, still with release floor (no pre-2026 in product UI)
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

/** Apply product membership rules to a candidate list. */
export function filterProductCatalog<T extends { provider: string; release_date: string }>(
  candidates: readonly T[],
  scope: CatalogScope = "cloud",
): T[] {
  return candidates.filter((m) => {
    if (!meetsReleaseFloor(m.release_date)) return false;
    if (scope === "cloud" && !isCloudLab(m.provider)) return false;
    return true;
  });
}
