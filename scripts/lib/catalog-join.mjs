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
import { isScorable } from "./aa-extract.mjs";

export { isScorable };

/** AA spine key for merge uniqueness. */
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

/** AA 7:2:1 blend when in/out present and blend missing. */
export function applyAaDerivedBlend(aaRows) {
  return aaRows.map((row) => {
    if (row.blended_price_per_M != null) return row;
    const pin = row.price_in_per_M;
    const pout = row.price_out_per_M;
    if (pin == null || pout == null) return row;
    if (!Number.isFinite(pin) || !Number.isFinite(pout)) return row;
    let next = {
      ...row,
      blended_price_per_M: (pin * 7 + pout * 2) / 10,
    };
    next = setSource(next, "blended_price_per_M", { origin: "aa", kind: "derived" });
    return next;
  });
}

/** Build a lookup index over OpenRouter models (id, bare slug, name). */
export function buildOpenRouterIndex(orModels) {
  const byId = new Map();
  for (const m of orModels ?? []) {
    const id = String(m.id || "").toLowerCase();
    const name = String(m.name || "").toLowerCase();
    if (id) {
      byId.set(id, m);
      const bare = id.includes("/") ? id.split("/").pop() : id;
      if (bare && !byId.has(bare)) byId.set(bare, m);
    }
    if (name) byId.set(name, m);
  }
  return byId;
}

const OPENROUTER_ORG_HINTS = [
  "anthropic", "openai", "google", "x-ai", "meta-llama", "meta", "qwen",
  "deepseek", "mistralai", "moonshotai", "z-ai", "minimax", "nvidia",
];

/**
 * Match a catalog row to its OpenRouter model (slug transforms + multi-host +
 * fuzzy endsWith). Returns the OR model object or null. Shared by pricing and
 * modality overlays so both attach to the same identity.
 */
export function matchOpenRouterModel(row, byId) {
  const slug = aaSlugFromSourceUrl(row.source_url || "");
  const modelLc = String(row.model || "").toLowerCase();
  const providerLc = String(row.provider || "").toLowerCase();
  // AA often uses grok-4-5; OpenRouter uses grok-4.5 (digit-digit → digit.digit).
  const slugOrStyle = slug ? slug.replace(/(\d+)-(\d+)/g, "$1.$2") : "";
  const slugDash = slug ? slug.replace(/\./g, "-") : "";
  const candidates = [
    slug, slugOrStyle, slugDash,
    ...OPENROUTER_ORG_HINTS.flatMap((o) =>
      slug ? [`${o}/${slug}`, `${o}/${slugOrStyle}`, `${o}/${slugDash}`] : [],
    ),
    modelLc,
    modelLc.replace(/\s+/g, "-"),
    modelLc.replace(/\s+/g, "-").replace(/(\d+)-(\d+)/g, "$1.$2"),
    modelLc.replace(/\s*\([^)]*\)\s*/g, "").trim(),
    slug?.startsWith("grok") ? `x-ai/${slug}` : null,
    slug?.startsWith("grok") ? `x-ai/${slugOrStyle}` : null,
    providerLc.includes("spacex") || providerLc === "xai" ? `x-ai/${slug}` : null,
    providerLc.includes("spacex") || providerLc === "xai" ? `x-ai/${slugOrStyle}` : null,
  ].filter(Boolean);
  for (const c of candidates) {
    if (byId.has(c)) return byId.get(c);
  }
  if (slug) {
    for (const [id, m] of byId) {
      if (typeof id === "string" && (id === slug || id.endsWith(`/${slug}`) || id.endsWith(slug))) {
        return m;
      }
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
  const byId = buildOpenRouterIndex(orModels);
  const VOCAB = { text: "text", image: "vision", audio: "audio", video: "video" };
  let attaches = 0;
  const rows = aaRows.map((row) => {
    const hit = matchOpenRouterModel(row, byId);
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
 */
export function applyOpenRouterPricing(aaRows, orModels) {
  if (!orModels?.length) return { rows: aaRows, overlays: 0 };
  const byId = buildOpenRouterIndex(orModels);
  let overlays = 0;
  const rows = aaRows.map((row) => {
    const needIn = row.price_in_per_M == null;
    const needOut = row.price_out_per_M == null;
    const needBlend = row.blended_price_per_M == null;
    if (!needIn && !needOut && !needBlend) return row;

    const hit = matchOpenRouterModel(row, byId);
    if (!hit?.pricing) return row;
    const pinTok = Number(hit.pricing.prompt);
    const poutTok = Number(hit.pricing.completion);
    if (!Number.isFinite(pinTok) || !Number.isFinite(poutTok)) return row;

    overlays += 1;
    let next = { ...row };
    const price_in_per_M = needIn ? pinTok * 1e6 : row.price_in_per_M;
    const price_out_per_M = needOut ? poutTok * 1e6 : row.price_out_per_M;
    next.price_in_per_M = price_in_per_M;
    next.price_out_per_M = price_out_per_M;
    if (needIn) next = setSource(next, "price_in_per_M", { origin: "openrouter", kind: "list" });
    if (needOut) next = setSource(next, "price_out_per_M", { origin: "openrouter", kind: "list" });

    if (needBlend && price_in_per_M != null && price_out_per_M != null) {
      next.blended_price_per_M = (price_in_per_M * 7 + price_out_per_M * 2) / 10;
      next = setSource(next, "blended_price_per_M", {
        origin: "openrouter",
        kind: "derived_list_blend",
      });
    }
    next.source = `${row.source || "aa"}; OpenRouter pricing overlay`;
    return next;
  });
  return { rows, overlays };
}

/**
 * Build candidate AA rows for an Arena identity (slug / normalizeFamily bridge).
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
          logs.push({ code: "arena_ambiguous_family", key: entry?.modelKey });
          continue;
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
    row.aa_intelligence_index != null && Number.isFinite(Number(row.aa_intelligence_index));
  const hasTps = row.tps != null && Number.isFinite(Number(row.tps));
  const hasCost =
    row.blended_price_per_M != null &&
    Number.isFinite(Number(row.blended_price_per_M)) &&
    Number(row.blended_price_per_M) >= 0;
  return hasIq && hasTps && hasCost && isScorable(row);
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
  const scorable = rows.filter(canAdmitPlotTriple);
  return {
    all: rows,
    scorable,
    arenaAttaches: arena.attaches,
    arenaLogs: arena.logs,
    openrouterOverlays: priced.overlays,
    openrouterModalityAttaches: modal.attaches,
  };
}
