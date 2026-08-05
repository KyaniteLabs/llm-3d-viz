/**
 * Shared Artificial Analysis HTML extractors (public pages only).
 */

/** Parse one `\\"models\\":[ ... ]` array starting at the marker index. */
export function extractModelsArrayAt(html, arrStartMarkerIndex) {
  const marker = '\\"models\\":[';
  const i = arrStartMarkerIndex + marker.length - 1; // at '['
  let depth = 0;
  let inStr = false;
  let j = i;
  while (j < html.length) {
    if (html.slice(j, j + 2) === '\\"') {
      inStr = !inStr;
      j += 2;
      continue;
    }
    if (!inStr) {
      if (html[j] === "[" || html[j] === "{") depth += 1;
      else if (html[j] === "]" || html[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    j += 1;
  }
  const raw = html.slice(i, j).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return JSON.parse(raw);
}

/**
 * Extract every models array embedded in AA HTML (leaderboard, model cards, etc.).
 * Prefer arrays that carry intelligenceIndex / timescale metrics.
 */
export function extractAllModelArrays(html) {
  const arrays = [];
  let idx = 0;
  while (true) {
    const i = html.indexOf('\\"models\\":[', idx);
    if (i < 0) break;
    try {
      const arr = extractModelsArrayAt(html, i);
      if (Array.isArray(arr) && arr.length && typeof arr[0] === "object") {
        arrays.push(arr);
      }
    } catch {
      /* skip malformed */
    }
    idx = i + 12;
  }
  return arrays;
}

/** Legacy single-array extract (leaderboard / rich block). */
export function extractRichModels(html) {
  const arrays = extractAllModelArrays(html);
  if (!arrays.length) throw new Error("rich model block not found");
  // Pick the array with the most metric-bearing rows.
  let best = arrays[0];
  let bestScore = -1;
  for (const arr of arrays) {
    let score = 0;
    for (const m of arr.slice(0, 40)) {
      if (m && (m.intelligenceIndex != null || m.timescaleData || m.medianOutputTokensPerSecond)) {
        score += 1;
      }
      if (m && m.modelCreatorLogo) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = arr;
    }
  }
  return best;
}

/** Flatten all arrays; keep the richest record per slug. */
export function extractAllModelsBySlug(html) {
  const bySlug = new Map();
  for (const arr of extractAllModelArrays(html)) {
    for (const m of arr) {
      if (!m?.slug) continue;
      const prev = bySlug.get(m.slug);
      if (!prev) {
        bySlug.set(m.slug, m);
        continue;
      }
      // Prefer object with intelligenceIndex / timescale
      const prevRich =
        (prev.intelligenceIndex != null ? 2 : 0) +
        (prev.timescaleData || prev.medianOutputTokensPerSecond ? 1 : 0);
      const nextRich =
        (m.intelligenceIndex != null ? 2 : 0) +
        (m.timescaleData || m.medianOutputTokensPerSecond ? 1 : 0);
      if (nextRich >= prevRich) bySlug.set(m.slug, { ...prev, ...m });
    }
  }
  return [...bySlug.values()];
}

export function deriveFamilyId(modelName) {
  let name = modelName.trim();
  name = name.replace(
    /\s*\((?:xhigh|max|high|medium|low|default|minimal|non-reasoning|reasoning|thinking|adaptive reasoning)[^)]*\)\s*$/i,
    "",
  );
  name = name.replace(/\s*[-–]?\s*(xhigh|max effort|max|high|medium|low|minimal)\s*$/i, "");
  // Strip trailing fallback parentheticals that are not effort-only
  name = name.replace(/\s*\(with fallback\)\s*$/i, "");
  name = name.replace(/\s+/g, " ").trim();
  return name.length > 0 ? name : modelName.trim();
}

export function deriveEffortTier(name, isReasoning) {
  const lower = name.toLowerCase();
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

export function costPerTask(m) {
  const block = m.intelligenceIndexCostPerTask;
  if (typeof block === "number") return block;
  if (block && typeof block === "object") {
    if (typeof block.total === "number") return block.total;
    if (block.cost && typeof block.cost.total === "number") return block.cost.total;
  }
  if (typeof m.intelligenceIndexCostTotal === "number") return m.intelligenceIndexCostTotal;
  return null;
}

export function mapAaRow(m, today, sourceLabel) {
  // Leaderboard uses flat medianOutputTokensPerSecond; model cards use timescaleData.*
  const tps =
    m.medianOutputTokensPerSecond ??
    m.timescaleData?.medianOutputSpeed ??
    null;
  const priceIn = m.price1mInputTokens ?? null;
  const priceOut = m.price1mOutputTokens ?? null;
  const blended = m.price1mBlended7To2To1 ?? null;
  const intel = m.intelligenceIndex ?? null;
  const ttftS =
    m.medianTimeToFirstTokenSeconds ??
    m.medianTimeToFirstAnswerTokenSeconds ??
    m.timescaleData?.medianTimeToFirstChunk ??
    null;
  const ttftMs = typeof ttftS === "number" ? ttftS * 1000 : null;
  const openness = m.isOpenWeights ? "open" : "closed";
  const family_id = deriveFamilyId(m.name);
  const effort_tier = deriveEffortTier(m.name, Boolean(m.isReasoning));
  const modality = ["text"];
  if (m.inputModalityImage) modality.push("vision");
  if (m.inputModalitySpeech) modality.push("audio");
  const provider =
    m.modelCreatorName || m.creator?.name || m.creator?.slug || "Unknown";
  return {
    model: m.name,
    provider,
    openness,
    modality,
    context_length: typeof m.contextWindowTokens === "number" ? m.contextWindowTokens : 0,
    release_date: m.releaseDate || today,
    data_date: today,
    source: sourceLabel,
    source_url: `https://artificialanalysis.ai/models/${m.slug}`,
    tps,
    ttft: ttftMs,
    price_in_per_M: priceIn,
    price_out_per_M: priceOut,
    blended_price_per_M: blended,
    aa_intelligence_index: intel,
    arena_elo: null,
    swe_bench: null,
    aider_pct: null,
    gpqa: typeof m.gpqa === "number" ? (m.gpqa <= 1 ? m.gpqa * 100 : m.gpqa) : null,
    reasoning: Boolean(m.isReasoning),
    family_id,
    effort_tier,
    cost_per_index_task_usd: costPerTask(m),
    time_per_index_task_s:
      typeof m.intelligenceIndexTimePerTask === "number" ? m.intelligenceIndexTimePerTask : null,
  };
}

export function isScorable(row) {
  return (
    row.aa_intelligence_index != null &&
    row.tps != null &&
    row.blended_price_per_M != null &&
    Number.isFinite(row.aa_intelligence_index) &&
    Number.isFinite(row.tps) &&
    Number.isFinite(row.blended_price_per_M)
  );
}

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
