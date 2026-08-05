/**
 * Effort-ladder coverage gaps from multi-source catalog refresh.
 * Generated file is written by scripts/expand-aa-multi-effort.mjs.
 */
import gapsRaw from "../../data/effort-gaps.generated.json";

export interface EffortGap {
  family: string;
  provider: string;
  expected_tiers: string[];
  published_tiers: string[];
  missing_tiers: string[];
  published_rows: number;
  complete: boolean;
  notes: string;
  /** Present when AA has speed/price cards without Intelligence Index. */
  partial_tiers?: Array<{ tier?: string; slug?: string }>;
}

interface EffortGapsFile {
  data_date?: string;
  gaps?: EffortGap[];
  fable?: EffortGap | null;
}

const file = gapsRaw as EffortGapsFile;

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
  const partial =
    Array.isArray(gap.partial_tiers) && gap.partial_tiers.length
      ? ` Cards exist without Intelligence Index: ${gap.partial_tiers.map((p) => p.tier).join(", ")}.`
      : "";
  return `Published efforts: ${published}. Missing scored tiers: ${missing}.${partial} ${gap.notes}`.trim();
}
