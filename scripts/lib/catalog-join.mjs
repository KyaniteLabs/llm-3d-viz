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

/**
 * OpenRouter pricing overlay — never writes IQ/TPS.
 * May fill either missing price side; labels derived blends.
 */
export function applyOpenRouterPricing(aaRows, orModels) {
  if (!orModels?.length) return { rows: aaRows, overlays: 0 };
  const byId = new Map();
  for (const m of orModels) {
    byId.set(String(m.id || "").toLowerCase(), m);
    byId.set(String(m.name || "").toLowerCase(), m);
  }
  let overlays = 0;
  const rows = aaRows.map((row) => {
    const needIn = row.price_in_per_M == null;
    const needOut = row.price_out_per_M == null;
    const needBlend = row.blended_price_per_M == null;
    if (!needIn && !needOut && !needBlend) return row;

    const slug = aaSlugFromSourceUrl(row.source_url || "");
    const candidates = [
      slug,
      `anthropic/${slug}`,
      `openai/${slug}`,
      `google/${slug}`,
      row.model?.toLowerCase(),
    ].filter(Boolean);
    let hit = null;
    for (const c of candidates) {
      if (byId.has(c)) {
        hit = byId.get(c);
        break;
      }
    }
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
    if (arenaId.slug && aaSlug && aaSlug === arenaId.slug) return true;
    // modelKey like claude-opus-5-high → base slug family match via normalizeFamily of family_id
    const famNorm = normalizeFamily(row.family_id || row.model || "");
    if (arenaId.familyNorm && famNorm && famNorm === arenaId.familyNorm) return true;
    // strip effort suffix from arena slug for family match: claude-opus-5-high → claude-opus-5
    const baseArena = arenaId.slug.replace(/-(xhigh|max|high|medium|low|minimal)$/i, "");
    if (baseArena && aaSlug.startsWith(baseArena)) return true;
    if (baseArena && famNorm === normalizeFamily(baseArena)) return true;
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
  if (next.aa_intelligence_index != null && !next.sources.aa_intelligence_index) {
    next.sources.aa_intelligence_index = { origin: "aa", kind: "measured" };
  }
  if (next.tps != null && !next.sources.tps) {
    next.sources.tps = { origin: "aa", kind: "measured" };
  }
  if (next.blended_price_per_M != null && !next.sources.blended_price_per_M) {
    next.sources.blended_price_per_M = { origin: "aa", kind: "measured" };
  }
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
 * Full join pipeline on in-memory rows (no network).
 * @param {object[]} aaRows — may include partials
 * @param {{ arenaEntries?: object[], orModels?: object[] }} overlays
 */
export function joinCatalog(aaRows, overlays = {}) {
  let rows = mergeBySpine([], aaRows.map(stampAaMeasured));
  const arena = applyArenaElo(rows, overlays.arenaEntries || []);
  rows = arena.rows;
  const priced = applyOpenRouterPricing(rows, overlays.orModels || []);
  rows = priced.rows;
  const scorable = rows.filter(isScorable);
  return {
    all: rows,
    scorable,
    arenaAttaches: arena.attaches,
    arenaLogs: arena.logs,
    openrouterOverlays: priced.overlays,
  };
}
