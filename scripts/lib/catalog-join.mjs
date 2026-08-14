/**
 * Multi-source catalog join: identity, column priority, Arena Elo attach, provenance.
 * Pure functions — no network.
 */

import {
  normalizeFamily,
  normalizeProvider,
  parseArenaIdentity,
  aaSlugFromSourceUrl,
  lastSlugSegment,
} from "../../src/lib/family-effort.shared.ts";
import { opennessForLab } from "../../src/data/catalog-scope.ts";
import { isScorable } from "./aa-extract.mjs";

export { isScorable };

/**
 * W2 provenance-completion gate (ticket #193): every non-null field in the
 * stampable set must carry a sources stamp. Shared by the vitest
 * meta-assertion (tests/provenance-gate.test.ts) and the optional fatal exit
 * in scripts/expand-aa-multi-effort.mjs — never by the non-fatal
 * coverage-report script. Failure messages name the likely ingestion point so
 * legitimate future sources fix forward instead of fighting the gate.
 */
export const PROVENANCE_STAMPABLE_FIELDS = [
  "aa_intelligence_index",
  "tps",
  "ttft",
  "price_in_per_M",
  "price_out_per_M",
  "price_cache_per_M",
  "blended_price_per_M",
  "context_length",
  "modality",
  "arena_elo",
  "coding_index",
  "agentic_index",
  "time_per_index_task_s",
  "openness",
];

const LIKELY_INGESTION_POINT = {
  aa_intelligence_index: "scripts/lib/aa-api.mjs mapAaApiModel (aa-api/measured)",
  tps: "scripts/lib/aa-api.mjs mapAaApiModel (aa-api/measured)",
  ttft: "scripts/lib/aa-api.mjs mapAaApiModel (aa-api/measured)",
  coding_index: "scripts/lib/aa-api.mjs mapAaApiModel (aa-api/measured)",
  agentic_index: "scripts/lib/aa-api.mjs mapAaApiModel (aa-api/measured)",
  time_per_index_task_s: "scripts/lib/aa-api.mjs mapAaApiModel (aa-api/measured)",
  price_in_per_M:
    "scripts/lib/aa-api.mjs mapAaApiModel (aa-api/measured) or applyOpenRouterPricing (openrouter/list)",
  price_out_per_M:
    "scripts/lib/aa-api.mjs mapAaApiModel (aa-api/measured) or applyOpenRouterPricing (openrouter/list)",
  price_cache_per_M:
    "scripts/lib/aa-api.mjs mapAaApiModel (aa-api/measured) or applyOpenRouterPricing (openrouter/list)",
  blended_price_per_M:
    "applyAaDerivedBlend (aa/derived) or applyOpenRouterPricing (openrouter/derived_list_blend)",
  context_length:
    "applyOpenRouterContext (openrouter/list) or the manual-additions row's own sources",
  modality:
    "scripts/lib/aa-api.mjs mapAaApiModel (aa-api/list) or applyOpenRouterModality (openrouter/list)",
  arena_elo: "applyArenaElo (arena/measured)",
  openness: "applyCuratedOpenness curated truth overlay (curated/list)",
};

/**
 * @param {object[]} rows built catalog rows
 * @returns {{ field: string, model: string, message: string }[]}
 */
export function provenanceGateViolations(rows) {
  const violations = [];
  for (const row of rows ?? []) {
    if (!row || typeof row !== "object") continue;
    for (const field of PROVENANCE_STAMPABLE_FIELDS) {
      if (row[field] == null) continue;
      const meta = row.sources?.[field];
      if (!meta?.origin) {
        violations.push({
          field,
          model: row.model,
          message:
            `provenance gate: ${field} is non-null but unstamped on "${row.model}" — ` +
            `likely ingestion point: ${LIKELY_INGESTION_POINT[field] ?? "stamp the field where it is written"}`,
        });
      }
    }
  }
  return violations;
}

/**
 * W1 truth-source openness overlay (ticket #188, plan data-stewardship-v2):
 * replaces the retired name-keyword guess with the curated lab-class map in
 * src/data/catalog-scope.ts. Precedence per row:
 *   1. manual-additions value wins while the row is alive (rows matched by
 *      normalized family — superseded manual rows are already dropped
 *      upstream, so the match cannot leak onto an AA row);
 *   2. per-family exception list (survives manual-row supersede);
 *   3. lab class (mixed → closed; unknown lab → closed).
 * Every non-null openness is stamped { origin: "curated", kind: "list" } —
 * curation is not a provider statement, so the origin is never "provider".
 * Pure; returns { rows, flips, stamped } (flips = values that changed).
 */
export function applyCuratedOpenness(rows, manualRows = []) {
  const manualFamilies = new Set(
    (manualRows ?? [])
      .map((r) => normalizeFamily(r?.family_id || r?.model || ""))
      .filter(Boolean),
  );
  let flips = 0;
  let stamped = 0;
  const out = (rows ?? []).map((row) => {
    if (row?.openness == null) return row;
    const famKey = normalizeFamily(row.family_id || row.model || "");
    const openness =
      famKey && manualFamilies.has(famKey)
        ? row.openness // manual addition wins while alive
        : opennessForLab(row.provider || "", famKey || row.model || "");
    if (openness !== row.openness) flips += 1;
    stamped += 1;
    return setSource({ ...row, openness }, "openness", {
      origin: "curated",
      kind: "list",
    });
  });
  return { rows: out, flips, stamped };
}

/**
 * AA spine key for merge uniqueness.
 */
export function spineKey(row) {
  const slug = aaSlugFromSourceUrl(row.source_url || "") || lastSlugSegment(row.model || "");
  const effort = String(row.effort_tier || "none").toLowerCase();
  return `${slug}::${effort}`;
}

/**
 * @param {object} row
 * @param {string} field
 * @param {{ origin: string, kind: string }} meta
 */
export function setSource(row, field, meta) {
  const sources = { ...(row.sources || {}) };
  sources[field] = meta;
  return { ...row, sources };
}

/**
 * Merge AA rows by spine key — first non-null wins within AA-only merge.
 * @param {object[]} into
 * @param {object[]} rows
 */
export function mergeBySpine(into, rows) {
  const byKey = new Map();
  for (const r of into) {
    byKey.set(spineKey(r), r);
  }
  for (const r of rows) {
    const k = spineKey(r);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, r);
      continue;
    }
    // Collision with different model names — keep separate via model suffix
    if (prev.model !== r.model && prev.model && r.model) {
      const k2 = `${k}::${r.model}`.toLowerCase();
      if (!byKey.has(k2)) {
        byKey.set(k2, r);
        continue;
      }
    }
    const merged = { ...prev };
    for (const [key, val] of Object.entries(r)) {
      if (key === "sources") continue;
      if (val != null && val !== "" && (merged[key] == null || merged[key] === "")) {
        merged[key] = val;
      }
    }
    if (prev.source && r.source && prev.source !== r.source) {
      merged.source = `${prev.source}; ${r.source}`;
    }
    if (prev.sources || r.sources) {
      merged.sources = { ...(prev.sources || {}), ...(r.sources || {}) };
    }
    byKey.set(k, merged);
  }
  return [...byKey.values()];
}

/**
 * AA 7:2:1 blend: 70% cache-hit, 20% input, 10% output tokens.
 * When cache pricing is available: (7*cache + 2*input + 1*output) / 10.
 * When cache is null, fall back conservatively: treat cache as input price
 * → (7*input + 2*input + 1*output) / 10 = (9*input + output) / 10.
 */
export function applyAaDerivedBlend(aaRows) {
  return aaRows.map((row) => {
    if (row.blended_price_per_M != null) return row;
    const pin = row.price_in_per_M;
    const pout = row.price_out_per_M;
    if (pin == null || pout == null) return row;
    if (!Number.isFinite(pin) || !Number.isFinite(pout)) return row;
    if (pin < 0 || pout < 0) return row; // D12: reject negative price components
    // C1 (datagaps audit 2026-08-14): a cache price of 0 is a sentinel, not a
    // price — no provider serves cache reads for free (OpenRouter lists
    // non-zero cache for models AA reports as 0). With cache at 70% blend
    // weight, trusting 0 understated blended cost up to 2.75× (4 DeepSeek rows
    // on stage). 0/absent/unknown falls back to input price: conservative
    // overestimate, never an understatement.
    const rawCache = row.price_cache_per_M;
    const pcache =
      typeof rawCache === "number" && Number.isFinite(rawCache) && rawCache > 0
        ? rawCache
        : pin; // conservative fallback: cache = input price when unknown/zero
    let next = {
      ...row,
      blended_price_per_M: (pcache * 7 + pin * 2 + pout * 1) / 10,
    };
    next = setSource(next, "blended_price_per_M", { origin: "aa", kind: "derived" });
    return next;
  });
}

/**
 * Build a lookup index over OpenRouter models.
 * Indexes canonical full IDs (`org/model`) in byId and bare slugs → array of
 * models in byBareSlug so collisions are visible. Never registers display names
 * (too ambiguous) or bare slugs as first-wins keys.
 */
export function buildOpenRouterIndex(orModels) {
  const byId = new Map();
  const byBareSlug = new Map();
  for (const m of orModels ?? []) {
    const id = String(m.id || "").toLowerCase();
    if (!id) continue;
    byId.set(id, m);
    const bare = id.includes("/") ? id.split("/").pop() : id;
    if (bare) {
      let list = byBareSlug.get(bare);
      if (!list) {
        list = [];
        byBareSlug.set(bare, list);
      }
      list.push(m);
    }
  }
  return { byId, byBareSlug };
}

/**
 * AA provider → OpenRouter organization slug mapping for exact-match candidates.
 * Keys are normalizeProvider outputs (lowercased, legal suffixes stripped).
 * W6 (ticket #192): grown from the unmatched_by_provider histogram in
 * data/effort-gaps.generated.json. Every org below was verified present in
 * data/openrouter-snapshot.json (2026-08-14) before adding. Two of the planned
 * slugs were corrected against the snapshot: OpenRouter lists `stepfun`
 * (not "stepfun-ai") and `xiaomi` (not "xiaomimi"). On this snapshot the new
 * orgs hold no exact AA-slug match yet (OpenRouter lists different strings for
 * those families — version/date suffixes, word order); the mappings are still
 * the verified org anchors so future snapshots join without another edit.
 */
const PROVIDER_TO_ORG = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  deepseek: "deepseek",
  nvidia: "nvidia",
  kimi: "moonshotai",
  zai: "z-ai",
  alibaba: "qwen",
  minimax: "minimax",
  xai: "x-ai",
  meta: "meta-llama",
  mistral: "mistralai",
  // W6 additions (verified vs data/openrouter-snapshot.json, 2026-08-14)
  "bytedance seed": "bytedance-seed",
  "reka ai": "rekaai",
  amazon: "amazon",
  microsoft: "microsoft",
  stepfun: "stepfun",
  tencent: "tencent",
  inclusionai: "inclusionai",
  xiaomi: "xiaomi",
  "ai21 labs": "ai21",
  cohere: "cohere",
  ibm: "ibm-granite",
  upstage: "upstage",
};

/**
 * Match a catalog row to its OpenRouter model using provider-compatible exact
 * IDs. Returns { model, matchedId } or null. No unbounded suffix/name fallback.
 * Bare-slug match only resolves when exactly one OpenRouter org owns that slug.
 */
export function matchOpenRouterModel(row, index) {
  const { byId, byBareSlug } = index;
  const slug = aaSlugFromSourceUrl(row.source_url || "");
  if (!slug) return null;
  const providerNorm = normalizeProvider(row.provider || "");
  const orgHint = PROVIDER_TO_ORG[providerNorm] || "";

  // AA uses grok-4-5; OpenRouter uses grok-4.5 (digit-digit → digit.digit).
  const slugOrStyle = slug.replace(/(\d+)-(\d+)/g, "$1.$2");
  const slugDash = slug.replace(/\./g, "-");

  // 1. Try exact full IDs with org prefix
  const candidates = [];
  if (orgHint) {
    candidates.push(
      `${orgHint}/${slug}`,
      `${orgHint}/${slugOrStyle}`,
      `${orgHint}/${slugDash}`,
    );
  }
  candidates.push(slug, slugOrStyle, slugDash);
  for (const c of candidates) {
    const hit = byId.get(c);
    if (hit) return { model: hit, matchedId: c };
  }

  // 2. Bare-slug match only when exactly one provider owns the slug (no collision)
  for (const s of [slug, slugOrStyle]) {
    const list = byBareSlug.get(s);
    if (list && list.length === 1) {
      return { model: list[0], matchedId: String(list[0].id || "").toLowerCase() };
    }
  }

  return null;
}

/**
 * OpenRouter modality overlay — attaches input modalities (vision/audio/video)
 * from the OpenRouter models list. Only ever ADDS modalities (union with the
 * row's existing set), never downgrades curated data. Same legal public source
 * the pricing overlay already uses; just consumes architecture.input_modalities.
 * Vocab map: OpenRouter "image" → catalog "vision".
 */
export function applyOpenRouterModality(aaRows, orModels) {
  if (!orModels?.length) return { rows: aaRows, attaches: 0 };
  const index = buildOpenRouterIndex(orModels);
  const VOCAB = { text: "text", image: "vision", audio: "audio", video: "video" };
  let attaches = 0;
  const rows = aaRows.map((row) => {
    const match = matchOpenRouterModel(row, index);
    const hit = match?.model;
    const inputMods = hit?.architecture?.input_modalities;
    if (!Array.isArray(inputMods) || !inputMods.length) return row;
    const existing = new Set(row.modality ?? []);
    let improved = false;
    const merged = [...existing];
    for (const raw of inputMods) {
      const mapped = VOCAB[String(raw).toLowerCase()];
      if (mapped && !existing.has(mapped)) {
        existing.add(mapped);
        merged.push(mapped);
        improved = true;
      }
    }
    if (!improved) return row;
    attaches += 1;
    let next = { ...row, modality: merged };
    next = setSource(next, "modality", { origin: "openrouter", kind: "list" });
    return next;
  });
  return { rows, attaches };
}

/**
 * OpenRouter pricing overlay — never writes IQ/TPS (intelligence/speed stay AA spine).
 * May fill missing price sides; labels list / derived_list_blend.
 * Matching is multi-host (x-ai, meta, qwen, …) so joined rows can admit with OR cost.
 *
 * WS2 stage-3 (plan; Architect carve-out): an AA cache price of 0/absent is a
 * sentinel, not a price — when OpenRouter publishes a positive cache-read
 * price, complete the cache slot from OR (openrouter/list) and re-derive OUR
 * fallback blend with the real cache price (openrouter/derived_list_blend).
 * Never recomputes an AA-measured blend; never touches a positive AA cache.
 */
export function applyOpenRouterPricing(aaRows, orModels) {
  if (!orModels?.length) return { rows: aaRows, overlays: 0 };
  const index = buildOpenRouterIndex(orModels);
  let overlays = 0;
  const rows = aaRows.map((row) => {
    const needIn = row.price_in_per_M == null;
    const needOut = row.price_out_per_M == null;
    const needBlend = row.blended_price_per_M == null;
    const cacheSentinel = row.price_cache_per_M == null || row.price_cache_per_M === 0;
    if (!needIn && !needOut && !needBlend && !cacheSentinel) return row;

    const match = matchOpenRouterModel(row, index);
    const hit = match?.model;
    if (!hit?.pricing) return row;
    let next = { ...row };

    // Per-side fills (D12: null/empty/non-numeric OR prices never become 0).
    if (needIn && hit.pricing.prompt != null && hit.pricing.prompt !== "") {
      const pinTok = Number(hit.pricing.prompt);
      if (Number.isFinite(pinTok) && pinTok >= 0) {
        next.price_in_per_M = pinTok * 1e6;
        next = setSource(next, "price_in_per_M", { origin: "openrouter", kind: "list" });
      }
    }
    if (needOut && hit.pricing.completion != null && hit.pricing.completion !== "") {
      const poutTok = Number(hit.pricing.completion);
      if (Number.isFinite(poutTok) && poutTok >= 0) {
        next.price_out_per_M = poutTok * 1e6;
        next = setSource(next, "price_out_per_M", { origin: "openrouter", kind: "list" });
      }
    }

    // D05 + stage-3: cache-slot completion from OR list price.
    let cacheCompleted = false;
    const cacheRaw = hit.pricing.input_cache_read;
    if (cacheSentinel && cacheRaw != null && cacheRaw !== "") {
      const cacheTok = Number(cacheRaw);
      if (Number.isFinite(cacheTok) && cacheTok > 0) {
        next.price_cache_per_M = cacheTok * 1e6;
        next = setSource(next, "price_cache_per_M", { origin: "openrouter", kind: "list" });
        cacheCompleted = true;
      }
    }

    const pin = next.price_in_per_M;
    const pout = next.price_out_per_M;
    const ourFallbackBlend =
      next.sources?.blended_price_per_M?.origin === "aa" &&
      next.sources?.blended_price_per_M?.kind === "derived";
    if (cacheCompleted && (needBlend || ourFallbackBlend) && pin != null && pout != null &&
        Number.isFinite(pin) && Number.isFinite(pout)) {
      next.blended_price_per_M = (next.price_cache_per_M * 7 + pin * 2 + pout) / 10;
      next = setSource(next, "blended_price_per_M", {
        origin: "openrouter",
        kind: "derived_list_blend",
      });
    } else if (needBlend && pin != null && pout != null &&
        Number.isFinite(pin) && Number.isFinite(pout)) {
      const pcache =
        typeof next.price_cache_per_M === "number" && Number.isFinite(next.price_cache_per_M) && next.price_cache_per_M > 0
          ? next.price_cache_per_M
          : pin; // conservative fallback: cache = input price when unknown
      next.blended_price_per_M = (pcache * 7 + pin * 2 + pout) / 10;
      next = setSource(next, "blended_price_per_M", {
        origin: "openrouter",
        kind: "derived_list_blend",
      });
    }

    const changed =
      next.price_in_per_M !== row.price_in_per_M ||
      next.price_out_per_M !== row.price_out_per_M ||
      next.blended_price_per_M !== row.blended_price_per_M ||
      next.price_cache_per_M !== row.price_cache_per_M;
    if (!changed) return row;
    overlays += 1;
    next.source = `${row.source || "aa"}; OpenRouter pricing overlay (${match.matchedId})`;
    return next;
  });
  return { rows, overlays };
}

/**
 * Canonical numeric slug style for Arena ↔ AA bridging: digit-dash ↔ digit-dot
 * (gemini-3-1 ↔ gemini-3.1). Same rule matchOpenRouterModel already applies to
 * OpenRouter ids; versions still differ across models (4.1 ≠ 4.3), so this only
 * erases punctuation, never version differences.
 */
const canonNumericSlug = (s) => s.replace(/(\d+)-(\d+)/g, "$1.$2");

/**
 * Build candidate AA rows for an Arena identity (slug / normalizeFamily bridge).
 * W6 (ticket #192): slug comparisons also try the canonical numeric style —
 * Arena writes version dots (qwen2.5-coder-32b-instruct) where AA slugs use
 * dashes (qwen2-5-coder-32b-instruct). Exact match stays first; normalizeFamily
 * equality only — never startsWith (avoids gpt-5 → gpt-5-6-sol).
 * @param {object[]} aaRows
 * @param {ReturnType<typeof parseArenaIdentity>} arenaId
 */
export function candidatesForArena(aaRows, arenaId) {
  return aaRows.filter((row) => {
    const aaSlug = aaSlugFromSourceUrl(row.source_url || "");
    // Exact slug match (e.g. claude-fable-5 ↔ claude-fable-5)
    if (arenaId.slug && aaSlug && aaSlug === arenaId.slug) return true;
    // Arena effort-suffixed key vs AA base slug: claude-opus-5-high ↔ claude-opus-5 (exact base only)
    const baseArena = arenaId.slug.replace(/-(xhigh|max|high|medium|low|minimal)$/i, "");
    if (baseArena && aaSlug && aaSlug === baseArena) return true;
    // W6: numeric dot/dash equivalence (arena gemini-3.1 ↔ aa gemini-3-1)
    if (arenaId.slug && aaSlug && canonNumericSlug(aaSlug) === canonNumericSlug(arenaId.slug)) {
      return true;
    }
    if (baseArena && aaSlug && canonNumericSlug(aaSlug) === canonNumericSlug(baseArena)) {
      return true;
    }
    // normalizeFamily equality only — never startsWith (avoids gpt-5 → gpt-5-6-sol)
    const famNorm = normalizeFamily(row.family_id || row.model || "");
    if (arenaId.familyNorm && famNorm && famNorm === arenaId.familyNorm) return true;
    if (baseArena && famNorm && famNorm === normalizeFamily(baseArena)) return true;
    return false;
  });
}

/**
 * Effort-safe Arena Elo attach (algorithm A–C from ralplan).
 * Returns { rows, attaches, logs }
 *
 * W6 residual ceilings (ticket #192; these logs feed arena_match_failures in
 * data/effort-gaps.generated.json): no name bridge can lift them —
 *   - Attach rate: most arena_no_family names are families AA simply does not
 *     publish (older snapshots, differently-sized variants) or deliberately
 *     ambiguous multi-effort families (arena_ambiguous_family protects
 *     effort-safety); wrong-version bridging is worse than a logged miss.
 *   - Field coverage is AA-publish-limited: coding 52%, agentic 44%,
 *     cost/task 42% — the AA free API does not publish those columns for the
 *     remaining rows, so the ceiling moves only when AA publishes more.
 */
export function applyArenaElo(aaRows, arenaEntries) {
  const logs = [];
  let attaches = 0;
  // Work on copies indexed by object identity via map of spine → row
  const rows = aaRows.map((r) => ({ ...r, sources: r.sources ? { ...r.sources } : undefined }));

  for (const entry of arenaEntries || []) {
    const arenaId = parseArenaIdentity(entry);
    if (arenaId.rating == null || !Number.isFinite(arenaId.rating)) {
      logs.push({ code: "arena_no_rating", key: entry?.modelKey });
      continue;
    }
    // D14: Enforce plausible positive Elo range — reject zero/negative/implausible.
    if (arenaId.rating <= 0 || arenaId.rating > 2500) {
      logs.push({ code: "arena_implausible_rating", key: entry?.modelKey, rating: arenaId.rating });
      continue;
    }
    const candidates = candidatesForArena(rows, arenaId);
    if (!candidates.length) {
      logs.push({ code: "arena_no_family", key: entry?.modelKey, slug: arenaId.slug });
      continue;
    }

    let target = null;
    const tier = arenaId.effort_tier;

    if (tier !== "unspecified") {
      const tierHits = candidates.filter(
        (r) => String(r.effort_tier || "").toLowerCase() === tier,
      );
      if (tierHits.length === 1) target = tierHits[0];
      else if (tierHits.length > 1) {
        logs.push({ code: "arena_multi_candidate", key: entry?.modelKey, tier });
        continue;
      } else {
        logs.push({ code: "arena_no_tier_match", key: entry?.modelKey, tier });
        continue;
      }
    } else {
      const scorableCands = candidates.filter(isScorable);
      const pool = scorableCands.length ? scorableCands : candidates;
      if (pool.length === 1) target = pool[0];
      else {
        const maxHits = pool.filter((r) => String(r.effort_tier || "").toLowerCase() === "max");
        if (maxHits.length === 1) target = maxHits[0];
        else if (maxHits.length > 1) {
          logs.push({ code: "arena_ambiguous_family", key: entry?.modelKey });
          continue;
        } else {
          // W6 exact-slug tie-break: when a family label collides across AA rows
          // (e.g. "Step 3.5 Flash" 0202 + 2603), an arena key whose slug —
          // exact or canonically numeric — equals exactly one candidate's AA
          // slug is a provable identity; the label-only hit is not.
          const baseArena = arenaId.slug.replace(/-(xhigh|max|high|medium|low|minimal)$/i, "");
          const slugHits = pool.filter((r) => {
            const aaSlug = aaSlugFromSourceUrl(r.source_url || "");
            return (
              (aaSlug && aaSlug === arenaId.slug) ||
              (baseArena && aaSlug && aaSlug === baseArena) ||
              (aaSlug &&
                arenaId.slug &&
                canonNumericSlug(aaSlug) === canonNumericSlug(arenaId.slug)) ||
              (aaSlug && baseArena && canonNumericSlug(aaSlug) === canonNumericSlug(baseArena))
            );
          });
          if (slugHits.length === 1) target = slugHits[0];
          else {
            logs.push({ code: "arena_ambiguous_family", key: entry?.modelKey });
            continue;
          }
        }
      }
    }

    if (!target) continue;
    // Elo-only patch — never touch tps / aa_intelligence_index
    target.arena_elo = arenaId.rating;
    target.sources = {
      ...(target.sources || {}),
      arena_elo: { origin: "arena", kind: "measured" },
    };
    attaches += 1;
  }

  return { rows, attaches, logs };
}

/**
 * Tag AA-measured fields with provenance when sources absent.
 * @param {object} row
 */
export function stampAaMeasured(row) {
  let next = { ...row, sources: { ...(row.sources || {}) } };
  const stamp = (field, origin = "aa") => {
    if (next[field] != null && !next.sources[field]) {
      next.sources[field] = { origin, kind: "measured" };
    }
  };
  // Prefer existing provenance (e.g. aa-api); only fill gaps.
  stamp("aa_intelligence_index");
  stamp("tps");
  stamp("ttft");
  stamp("blended_price_per_M");
  stamp("price_in_per_M");
  stamp("price_out_per_M");
  stamp("cost_per_index_task_usd");
  return next;
}

/**
 * Extract Arena entries from HTML that embeds style-control leaderboard JSON
 * (escaped \" form as on arena.ai).
 * @param {string} html
 * @returns {object[]}
 */
export function extractArenaEntriesFromHtml(html) {
  if (!html || typeof html !== "string") return [];
  // Prefer style_control board
  const markers = [
    "text-overall-style-control",
    "text-overall-style_control",
    "style_control",
  ];
  let start = -1;
  for (const m of markers) {
    const i = html.indexOf(m);
    if (i >= 0) {
      start = i;
      break;
    }
  }
  if (start < 0) start = html.indexOf("modelDisplayName");
  if (start < 0) return [];

  const chunk = html.slice(Math.max(0, start - 50), start + 900_000);
  // Unescape common JSON-in-string form
  let s = chunk;
  while (s.includes('\\"')) s = s.replaceAll('\\"', '"');

  const e = s.indexOf('"entries":[');
  if (e < 0) {
    // try already-unescaped
    const e2 = chunk.indexOf('"entries":[');
    if (e2 < 0) return [];
    s = chunk;
    return parseEntriesArray(s.slice(e2 + '"entries":'.length));
  }
  return parseEntriesArray(s.slice(e + '"entries":'.length));
}

function parseEntriesArray(sub) {
  if (!sub.startsWith("[")) return [];
  let depth = 0;
  let end = -1;
  for (let j = 0; j < sub.length; j++) {
    const ch = sub[j];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        end = j + 1;
        break;
      }
    }
  }
  if (end < 0) return [];
  try {
    const arr = JSON.parse(sub.slice(0, end));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Plot-admission after multi-source join (ADR-0001 amended).
 * Complete speed×cost×intelligence triple from honest provenance only.
 * Arena Elo alone never admits; missing IQ/TPS never admits.
 * @param {object} row
 * @returns {boolean}
 */
export function canAdmitPlotTriple(row) {
  if (!row || typeof row !== "object") return false;
  const hasIq =
    row.aa_intelligence_index != null &&
    Number.isFinite(Number(row.aa_intelligence_index)) &&
    Number(row.aa_intelligence_index) >= 0 &&
    Number(row.aa_intelligence_index) <= 100;
  const hasTps =
    row.tps != null && Number.isFinite(Number(row.tps)) && Number(row.tps) >= 0;
  const hasCost =
    row.blended_price_per_M != null &&
    Number.isFinite(Number(row.blended_price_per_M)) &&
    Number(row.blended_price_per_M) >= 0;
  return hasIq && hasTps && hasCost && isScorable(row);
}
/**
 * D01: OpenRouter context_length overlay — fills unknown context_length (null)
 * from OpenRouter where identity matches exactly. Validates positive integer.
 */
export function applyOpenRouterContext(aaRows, orModels) {
  if (!orModels?.length) return { rows: aaRows, overlays: 0 };
  const index = buildOpenRouterIndex(orModels);
  let overlays = 0;
  const rows = aaRows.map((row) => {
    if (row.context_length != null && row.context_length > 0) return row;
    const match = matchOpenRouterModel(row, index);
    const hit = match?.model;
    const ctx = hit?.context_length;
    if (typeof ctx !== "number" || !Number.isFinite(ctx) || ctx <= 0) return row;
    overlays += 1;
    let next = { ...row, context_length: ctx };
    next = setSource(next, "context_length", { origin: "openrouter", kind: "list" });
    return next;
  });
  return { rows, overlays };
}

/**
 * Full join pipeline on in-memory rows (no network).
 * @param {object[]} aaRows — may include partials
 * @param {{ arenaEntries?: object[], orModels?: object[] }} overlays
 */
export function joinCatalog(aaRows, overlays = {}) {
  let rows = mergeBySpine([], aaRows.map(stampAaMeasured));
  rows = applyAaDerivedBlend(rows);
  const arena = applyArenaElo(rows, overlays.arenaEntries || []);
  rows = arena.rows;
  const priced = applyOpenRouterPricing(rows, overlays.orModels || []);
  rows = priced.rows;
  const modal = applyOpenRouterModality(rows, overlays.orModels || []);
  rows = modal.rows;
  const ctx = applyOpenRouterContext(rows, overlays.orModels || []);
  rows = ctx.rows;
  const scorable = rows.filter(canAdmitPlotTriple);
  return {
    all: rows,
    scorable,
    arenaAttaches: arena.attaches,
    arenaLogs: arena.logs,
    openrouterOverlays: priced.overlays,
    openrouterModalityAttaches: modal.attaches,
    openrouterContextOverlays: ctx.overlays,
  };
}
