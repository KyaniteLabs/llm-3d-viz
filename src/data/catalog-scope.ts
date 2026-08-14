/**
 * Product catalog scopes.
 *
 * Default instrument focus: **cloud API labs** Simon cares about for
 * multi-effort curve exploration, with a **hard release floor** so the stage
 * never shows pre-2026 rows. Full AA scrape remains on disk as `allModels`
 * for later local / archive work.
 */

// Explicit .ts extension: this module is imported by the node
// --experimental-strip-types build scripts, whose ESM resolution requires
// extensions (same convention as the scripts/lib/*.mjs imports).
import { normalizeFamily } from "../lib/family-effort.shared.ts";

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
 * Lifecycle class of a lab for the W1 truth-source openness map
 * (plan data-stewardship-v2): how the lab ships model weights.
 */
export type LabOpennessClass = "open" | "closed" | "mixed";

/**
 * W1 truth source for row-level `openness` (ticket #188). Replaces the
 * retired name-keyword guess (audit L4: it mislabeled whole labs) with a
 * curated lab → class map covering the full scope vocabulary
 * (CLOUD_LABS ∪ HELD_LABS_FOR_LATER — every provider that can appear in a
 * draft; the exhaustive-lint test fails when a draft provider is missing).
 * Labs absent from the map resolve `closed` (unknown → closed, honest default).
 *
 *  - `open`  : ships open weights across its catalog — weights stay
 *              downloadable and runnable after supersession (local lifecycle;
 *              also the D-H4 generation-cap exemption set).
 *  - `mixed` : both open-weight and closed-API families; defaults `closed`
 *              per family unless excepted (FAMILY_OPENNESS_EXCEPTIONS).
 *  - `closed`: closed-API lifecycle.
 */
export const LAB_OPENNESS_CLASS: Readonly<Record<string, LabOpennessClass>> = {
  // Open-weight labs (D-H4 generation-cap exemption — derived from these).
  DeepSeek: "open",
  Alibaba: "open", // Qwen
  "Z AI": "open", // GLM
  Kimi: "open", // Moonshot
  Meta: "open", // Muse / Llama
  MiniMax: "open",
  NVIDIA: "open", // Nemotron
  // Mixed portfolio: open-weight AND closed-API families; closed by default.
  "ByteDance Seed": "mixed", // Seed-OSS line is open; the rest closed
  Microsoft: "mixed", // Phi open; MAI closed
  Amazon: "mixed", // Nova mostly closed; selected open releases
  Mistral: "mixed", // Small/Devstral/Magistral-Small open; Large/Medium closed
  Tencent: "mixed", // Hunyuan open releases; Hy3 closed
  Xiaomi: "mixed", // MiMo open releases; Pro tier closed
  // Closed-API labs.
  OpenAI: "closed", // gpt-oss families excepted per-family below
  Anthropic: "closed",
  Google: "closed",
  SpaceXAI: "closed", // xAI Grok
  "AI21 Labs": "closed",
  "Arcee AI": "closed",
  Celeris: "closed",
  Cohere: "closed",
  IBM: "closed",
  Inception: "closed",
  InclusionAI: "closed",
  KwaiKAT: "closed",
  "Liquid AI": "closed",
  LongCat: "closed",
  "Multiverse Computing": "closed",
  "Nex AGI": "closed",
  "Nous Research": "closed", // Hermes families excepted per-family below
  "Reka AI": "closed",
  "Sapiens AI": "closed",
  StepFun: "closed",
  "Thinking Machines": "closed",
  Upstage: "closed",
};

/**
 * Persistent per-family openness exceptions (W1): keys are
 * `normalizeFamily(family_id || model)` output, values are the family's
 * truth when the lab class would be wrong. Unlike a manual-additions row,
 * this list SURVIVES manual-row supersede — when AA publishes the family,
 * the curated exception still wins over the lab class. This is the durable
 * override channel (the manual channel's fatal flaw, fixed).
 */
export const FAMILY_OPENNESS_EXCEPTIONS: Readonly<Record<string, "open" | "closed">> = {
  // OpenAI gpt-oss family — open weights inside a closed-API lab.
  "gpt-oss-120b": "open",
  "gpt-oss-20b": "open",
  // ByteDance Seed OSS line — open weights inside a mixed lab.
  "seed-oss-36b-instruct": "open",
  // Z.ai GLM-5.3 — provider says weights ship ~2 weeks post-announcement
  // (2026-08-14); closed until downloadable. Remove when weights are out.
  // (Key is normalizeFamily("GLM-5.3") — dots collapse to dashes.)
  "glm-5-3": "closed",
  // Nous Research Hermes line — open weights (Llama-based finetunes).
  "hermes-3-llama-3-1-70b": "open",
  "hermes-4-llama-3-1-405b": "open",
  "hermes-4-llama-3-1-70b": "open",
  // Mistral open-weight families (Apache-2.0 lines) inside a mixed lab.
  "mistral-7b-instruct": "open",
  "mistral-small": "open", // covers the open (Sep '24) re-release key
  "mistral-small-3": "open",
  "mistral-small-3-1": "open",
  "mistral-small-3-2": "open",
  "mistral-small-4": "open",
  "devstral-small-2": "open",
  "magistral-small-1-2": "open",
};

/** Lab's curated openness class; unknown labs resolve `closed` (W1). */
export function labOpennessClass(provider: string): LabOpennessClass {
  return LAB_OPENNESS_CLASS[provider] ?? "closed";
}

/**
 * Resolve a row's `openness` from the curated truth map (W1): per-family
 * exception first (survives supersede), then lab class (mixed → closed,
 * unknown lab → closed). Manual-additions values win while their row is
 * alive — that precedence lives in the build-time overlay
 * (applyCuratedOpenness in scripts/lib/catalog-join.mjs).
 */
export function opennessForLab(provider: string, family: string): "open" | "closed" {
  const famKey = normalizeFamily(family ?? "");
  const exception = famKey ? FAMILY_OPENNESS_EXCEPTIONS[famKey] : undefined;
  if (exception === "open" || exception === "closed") return exception;
  return labOpennessClass(provider) === "open" ? "open" : "closed";
}

/**
 * D-H4 exemption set, DERIVED from the truth map's open classes (W1: one
 * module, decoupled concerns). Identical semantics to the retired
 * OPEN_WEIGHT_LABS list: labs whose rows bypass the generation cap because
 * open weights stay runnable after supersession.
 */
const OPEN_LIFECYCLE_SET: ReadonlySet<string> = new Set(
  Object.entries(LAB_OPENNESS_CLASS)
    .filter(([, labClass]) => labClass === "open")
    .map(([provider]) => provider),
);

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
 * rows (local lifecycle — exemption set derived from the truth map's open
 * classes, see OPEN_LIFECYCLE_SET) pass uncapped.
 */
export function meetsGenerationDepth<
  T extends { provider: string; family_id?: string; model: string },
>(rows: readonly T[], depth: number = GENERATION_DEPTH): Set<T> {
  const byLine = new Map<string, Map<number, T[]>>();
  const versionless: T[] = [];
  for (const r of rows) {
    if (OPEN_LIFECYCLE_SET.has(r.provider)) {
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
