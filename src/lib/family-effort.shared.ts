/**
 * Shared family / effort / provider normalizers for catalog join + UI.
 * Single implementation — consumed by expand scripts and src/lib/family.ts.
 */

const PROVIDER_ALIASES: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  deepseek: "deepseek",
  moonshot: "kimi",
  kimi: "kimi",
  "x-ai": "xai",
  xai: "xai",
  "x.ai": "xai",
  "z ai": "zai",
  zhipu: "zai",
  "z.ai": "zai",
  zai: "zai",
};

/**
 * Derive a stable family label from a curated model name by stripping effort markers.
 */
export function deriveFamilyId(modelName: string): string {
  if (typeof modelName !== "string") return "";
  let name = modelName.trim();
  name = name.replace(
    /\s*\((?:xhigh|max|high|medium|low|default|minimal|non-reasoning|reasoning|thinking|adaptive reasoning)[^)]*\)\s*$/i,
    "",
  );
  name = name.replace(/\s*[-–]?\s*(xhigh|max effort|max|high|medium|low|minimal)\s*$/i, "");
  name = name.replace(/\s*\(with fallback\)\s*$/i, "");
  name = name.replace(/\s+/g, " ").trim();
  return name.length > 0 ? name : modelName.trim();
}

/**
 * Parse effort tier from a model display name.
 */
export function deriveEffortTierFromName(name: string, isReasoning = false): string {
  const lower = String(name || "").toLowerCase();
  if (/\(xhigh\)|xhigh effort|\bxhigh\b/.test(lower)) return "xhigh";
  if (/\(max\)|max effort|\bmax\b/.test(lower)) return "max";
  if (/\(high\)|high effort|\bhigh\b/.test(lower)) return "high";
  if (/\(medium\)|medium effort|\bmedium\b|\bmid\b/.test(lower)) return "medium";
  if (/\(low\)|low effort|\blow\b/.test(lower)) return "low";
  if (/\(minimal\)|minimal effort|\bminimal\b/.test(lower)) return "minimal";
  if (/non-reasoning/.test(lower)) return "none";
  if (isReasoning) return "default";
  return "none";
}

/**
 * Normalize provider org strings for join diagnostics.
 */
export function normalizeProvider(raw: string): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim().toLowerCase();
  s = s.replace(/\b(inc\.?|ltd\.?|llc|corp\.?)\b/g, "").replace(/\s+/g, " ").trim();
  if (PROVIDER_ALIASES[s]) return PROVIDER_ALIASES[s];
  for (const [k, v] of Object.entries(PROVIDER_ALIASES)) {
    if (s === k || s.includes(k)) return v;
  }
  return s;
}

/**
 * Collapse family/display strings for Arena ↔ AA matching.
 */
export function normalizeFamily(s: string): string {
  if (typeof s !== "string") return "";
  let name = s.trim();
  name = name.replace(/\([^)]*\)/g, " ");
  name = name.replace(/\s*[-–]?\s*(xhigh|max(?:\s+effort)?|high|medium|low|minimal|none)\s*$/i, "");
  name = name.toLowerCase();
  name = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return name;
}

/**
 * Last path segment of a URL or modelKey, with Arena channel suffixes stripped.
 */
export function lastSlugSegment(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  let seg = raw.trim().split("/").pop() || "";
  seg = seg.replace(/-(text|agent|vertex|search|search-v2|v2)$/i, "");
  return seg.toLowerCase();
}

export function aaSlugFromSourceUrl(sourceUrl: string): string {
  return lastSlugSegment(sourceUrl || "");
}

export interface ArenaEntryLike {
  modelDisplayName?: string;
  modelKey?: string;
  modelOrganization?: string;
  rating?: number;
}

export interface ParsedArenaIdentity {
  slug: string;
  familyNorm: string;
  effort_tier: string;
  provider: string;
  rating: number | null;
  displayName: string;
  modelKey: string;
}

/**
 * Parse Arena leaderboard entry into identity fields.
 */
export function parseArenaIdentity(entry: ArenaEntryLike | null | undefined): ParsedArenaIdentity {
  const displayName = entry?.modelDisplayName || entry?.modelKey || "";
  const modelKey = entry?.modelKey || displayName;
  const slug = lastSlugSegment(modelKey);
  const familyNorm = normalizeFamily(displayName) || normalizeFamily(slug);
  let effort = deriveEffortTierFromName(displayName, false);
  const hasToken =
    /\((?:xhigh|max|high|medium|low|minimal)\)/i.test(displayName) ||
    /\b(xhigh|max effort|high effort|medium effort|low effort|minimal)\b/i.test(displayName) ||
    /-(xhigh|max|high|medium|low|minimal)\b/i.test(modelKey);
  if (!hasToken && (effort === "none" || effort === "default")) {
    effort = "unspecified";
  }
  const keyEffort = modelKey.match(/-(xhigh|max|high|medium|low|minimal)(?:-|$)/i);
  if (keyEffort && effort === "unspecified") {
    effort = keyEffort[1].toLowerCase();
  }
  return {
    slug,
    familyNorm,
    effort_tier: effort,
    provider: normalizeProvider(entry?.modelOrganization || ""),
    rating: typeof entry?.rating === "number" ? entry.rating : null,
    displayName,
    modelKey,
  };
}
