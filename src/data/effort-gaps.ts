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
  return `Published efforts: ${published}. Missing scored tiers: ${missing}. ${gap.notes}`.trim();
}
