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

/**
 * D-H4 (Simon, 2026-08-14, amended same day): per product line, keep only the
 * newest GENERATION_DEPTH distinct generations — "if GPT 5.6 exists we have no
 * reason to keep anything older than GPT 5.5." **Closed-API lifecycle only:**
 * open-weight labs are exempt because local models last longer — superseded
 * weights stay downloadable and runnable, so generation retirement is a
 * cloud-endpoint behavior, not a local one. A product line is the vendor name
 * plus the leading words before the generation number, plus an edition word
 * (flash/pro/mini/coder/…) when it directly follows the version — so
 * "Gemini 3.7 Flash" and "Gemini 3.1 Pro" are independent lines, and
 * "GPT-5.4 mini" survives until a newer mini exists. Default scope only;
 * `?catalog=all` remains the uncut archive view.
 */
export const GENERATION_DEPTH = 2;

/**
 * CLOUD_LABS members that ship open weights (downloadable, runnable after
 * supersession). Their rows bypass the generation cap. The row-level
 * `openness` field is NOT used for this: the AA free tier has no real
 * open-weights flag and the name-keyword heuristic mislabels whole labs
 * (audit L4) — a lab-level lifecycle class is the honest discriminator.
 */
export const OPEN_WEIGHT_LABS = [
  "DeepSeek",
  "Alibaba", // Qwen
  "Z AI", // GLM
  "Kimi", // Moonshot
  "Meta", // Muse
  "MiniMax",
  "NVIDIA", // Nemotron
] as const;

const OPEN_WEIGHT_SET = new Set<string>(OPEN_WEIGHT_LABS);

const EDITION_WORDS = [
  "mini", "nano", "lite", "flash", "pro", "max", "coder", "omni", "plus",
  "instant", "turbo", "air", "spark", "glimmer",
] as const;

export interface FamilyLineGen {
  line: string;
  generation: number | null;
}

/** Parse a family display name into (product line, generation). Pure. */
export function parseFamilyLineGen(familyId: string): FamilyLineGen {
  const raw = (familyId || "").trim();
  // Leading alpha words before the first version-ish token (V4, 5.6, 3.8…)
  const m = raw.match(/^([A-Za-z][A-Za-z]*(?:[ -][A-Za-z]+)*?)[\s-]*(?:V(\d+)|(\d+(?:\.\d+)?))/i);
  if (!m) {
    return {
      line: raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown",
      generation: null,
    };
  }
  let line = m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const generation = parseFloat(m[3] ?? m[2]);
  // Edition word directly after the version: "Gemini 3.7 Flash", "GPT-5.4 mini"
  const rest = raw.slice(m[0].length).trim().toLowerCase();
  const firstWord = rest.match(/^([a-z]+)/);
  if (firstWord && (EDITION_WORDS as readonly string[]).includes(firstWord[1])) {
    line = `${line}-${firstWord[1]}`;
  }
  return { line: line || "unknown", generation: Number.isFinite(generation) ? generation : null };
}

/**
 * Rows whose generation is within the newest GENERATION_DEPTH distinct
 * generations of their product line. Versionless families and open-weight-lab
 * rows (local lifecycle — see OPEN_WEIGHT_LABS) pass uncapped.
 */
export function meetsGenerationDepth<
  T extends { provider: string; family_id?: string; model: string },
>(rows: readonly T[], depth: number = GENERATION_DEPTH): Set<T> {
  const byLine = new Map<string, Map<number, T[]>>();
  const versionless: T[] = [];
  for (const r of rows) {
    if (OPEN_WEIGHT_SET.has(r.provider)) {
      versionless.push(r); // open-weight lifecycle: no generation retirement
      continue;
    }
    const { line, generation } = parseFamilyLineGen(r.family_id || r.model);
    if (generation == null) {
      versionless.push(r);
      continue;
    }
    const key = `${r.provider}::${line}`;
    let gens = byLine.get(key);
    if (!gens) {
      gens = new Map();
      byLine.set(key, gens);
    }
    const bucket = gens.get(generation) ?? [];
    bucket.push(r);
    gens.set(generation, bucket);
  }
  const keep = new Set<T>(versionless);
  for (const gens of byLine.values()) {
    const allowed = [...gens.keys()].sort((a, b) => b - a).slice(0, depth);
    for (const g of allowed) {
      for (const r of gens.get(g) ?? []) keep.add(r);
    }
  }
  return keep;
}

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
  "ByteDance Seed",
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
  "Reka AI",
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
export function filterProductCatalog<
  T extends { provider: string; release_date: string; family_id?: string; model: string },
>(candidates: readonly T[], scope: CatalogScope = "cloud"): T[] {
  const floored = candidates.filter((m) => {
    if (!meetsReleaseFloor(m.release_date)) return false;
    if (scope === "cloud" && !isCloudLab(m.provider)) return false;
    return true;
  });
  if (scope !== "cloud") return floored;
  // D-H4: newest + previous generation per product line (default scope only).
  const keep = meetsGenerationDepth(floored);
  return floored.filter((m) => keep.has(m));
}
