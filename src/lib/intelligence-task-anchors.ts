/**
 * Frames of reference for AA Intelligence Index levels.
 *
 * Not a native task→min-Index table (see docs/research/task-intelligence-baseline-datasets.md).
 * Each band is a concrete *kind of work* people actually hire models for, calibrated to
 * the AA Index suite genres (agents / coding / scientific / general) — orientation only.
 */

export interface IntelligenceTaskAnchor {
  /** Approximate AA Intelligence Index level this band illustrates. */
  index: number;
  /**
   * Stage callout — plain English job, not benchmark jargon.
   * Shown outside the cube next to the intelligence axis.
   */
  short: string;
  /** Longer tooltip / STAGE KEY line. */
  example: string;
  /** One-word-ish band name for lists. */
  band: string;
  /** Provenance (eval genre), not a measured floor. */
  sources: string;
}

/**
 * Sparse ladder (low → high). Keep short enough to read at a glance;
 * concrete enough that a non-ML person knows what “this high” buys them.
 */
export const INTELLIGENCE_TASK_ANCHORS: readonly IntelligenceTaskAnchor[] = [
  {
    index: 20,
    short: "Polish messy notes into a clean email or FAQ",
    example:
      "Rewrite tone, summarize a paste, answer simple questions from a short document you provide.",
    band: "Drafting help",
    sources: "General / light retrieval load in the AA suite — not a formal floor.",
  },
  {
    index: 32,
    short: "Turn a messy dump into a structured brief or plan",
    example:
      "Produce a multi-section brief, checklist, or small script under clear constraints; easy coding problems.",
    band: "Structured work",
    sources: "Light coding + structured writing (LiveCodeBench Easy–class / general reasoning).",
  },
  {
    index: 42,
    short: "Hard expert Q&A a smart non-expert still gets wrong",
    example:
      "Graduate-level science and technical questions where domain experts do well but skilled outsiders fail even with search.",
    band: "Expert judgment",
    sources: "GPQA Diamond–class scientific reasoning in the AA Index scientific weight.",
  },
  {
    index: 52,
    short: "Find and fix a real multi-file bug so tests pass",
    example:
      "Cross-file repo repair, multi-step terminal work, and agent-style ops that must leave the system in a verified good state.",
    band: "Ship software",
    sources: "SWE-bench–class coding + Terminal-Bench / agent weight in AA Index (agents are ~⅓ of the Index).",
  },
  {
    index: 62,
    short: "Run a long, autonomous project without constant babysitting",
    example:
      "Multi-hour software/agent sessions, research-hard exam items, and work that keeps going across many steps with tools.",
    band: "Long autonomy",
    sources: "HLE-class hard exam + METR-style long task horizons; current frontier Index tops ~60–63.",
  },
] as const;

/** Stage callout only (no Index number — the Y tick carries the number). */
export function formatTaskAnchorStageLabel(a: IntelligenceTaskAnchor): string {
  return a.short;
}

/**
 * Anchors whose Index falls inside the visible intelligence domain
 * (small edge allowance so near-edge bands still read).
 */
export function taskAnchorsInDomain(
  min: number,
  max: number,
  anchors: readonly IntelligenceTaskAnchor[] = INTELLIGENCE_TASK_ANCHORS,
): IntelligenceTaskAnchor[] {
  if (!(Number.isFinite(min) && Number.isFinite(max)) || max < min) return [];
  const lo = min - 2;
  const hi = max + 2;
  return anchors.filter((a) => a.index >= lo && a.index <= hi);
}

/**
 * Nearest vetted band for a numeric Index (tooltips / Decide hints).
 * Prefer taskAnchorsInDomain for stage placement so we never spam every tick.
 */
export function nearestTaskAnchor(
  indexValue: number,
  anchors: readonly IntelligenceTaskAnchor[] = INTELLIGENCE_TASK_ANCHORS,
): IntelligenceTaskAnchor {
  let best = anchors[0]!;
  let bestDist = Math.abs(best.index - indexValue);
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i]!;
    const d = Math.abs(a.index - indexValue);
    if (d < bestDist) {
      best = a;
      bestDist = d;
    }
  }
  return best;
}

/** STAGE KEY / a11y copy. */
export function formatTaskAnchorGuideLine(a: IntelligenceTaskAnchor): string {
  return `~${Math.round(a.index)} · ${a.short}`;
}
