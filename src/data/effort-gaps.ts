/**
 * Effort-ladder coverage gaps from multi-source catalog refresh.
 * Generated file is written by scripts/expand-aa-multi-effort.mjs.
 */
import gapsRaw from "../../data/effort-gaps.generated.json";

export interface EffortGap {
  family: string;
  provider: string | null;
  expected_tiers: string[];
  published_tiers: string[];
  missing_tiers: string[];
  published_rows: number;
  complete: boolean;
  notes?: string;
  /** Present when AA has speed/price cards without Intelligence Index. */
  partial_tiers?: Array<{ tier?: string; slug?: string }>;
  /** Expand script currently emits partial_cards; accept either key. */
  partial_cards?: Array<{ tier?: string; slug?: string }>;
}

interface EffortGapsFile {
  data_date?: string;
  gaps?: EffortGap[];
  fable?: EffortGap | null;
  /** Extra API-only metadata — ignore for UI typing. */
  [key: string]: unknown;
}

const file = gapsRaw as unknown as EffortGapsFile;

export const effortGaps: readonly EffortGap[] = file.gaps ?? [];
export const effortGapsDataDate = file.data_date ?? null;

const byFamily = new Map(effortGaps.map((g) => [g.family, g]));

export function effortGapForFamily(familyId: string | null | undefined): EffortGap | null {
  if (!familyId) return null;
  return byFamily.get(familyId) ?? null;
}

export function formatEffortGapNote(gap: EffortGap): string {
  const published = gap.published_tiers.length ? gap.published_tiers.join(", ") : "none";
  const missing = gap.missing_tiers.length ? gap.missing_tiers.join(", ") : "—";
  const partialList = gap.partial_tiers ?? gap.partial_cards;
  const partial =
    Array.isArray(partialList) && partialList.length
      ? ` Cards exist without Intelligence Index: ${partialList.map((p) => p.tier).join(", ")}.`
      : "";
  return `Published efforts: ${published}. Missing scored tiers: ${missing}.${partial} ${gap.notes ?? ""}`.trim();
}
