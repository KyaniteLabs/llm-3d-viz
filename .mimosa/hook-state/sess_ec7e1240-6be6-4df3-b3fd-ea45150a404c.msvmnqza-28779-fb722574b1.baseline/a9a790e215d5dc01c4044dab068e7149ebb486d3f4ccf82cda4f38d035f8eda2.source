import { describe, expect, it } from "vitest";
import {
  INTEL_CONSISTENCY_MAX_ENTRIES,
  INTEL_CONSISTENCY_TITLE,
  buildIntelConsistency,
} from "../scripts/lib/intel-consistency.mjs";

function row(p = {}) {
  return {
    model: "Model X",
    provider: "Acme",
    family_id: "Family X",
    effort_tier: "none",
    aa_intelligence_index: 50,
    arena_elo: 1300,
    ...p,
  };
}

describe("AA-Index vs Arena-Elo consistency report (W7 / ticket #194)", () => {
  it("computes both-direction spreads and mean-based ranks for families with both metrics", () => {
    const out = buildIntelConsistency([
      row({
        family_id: "Alpha",
        model: "Alpha low",
        effort_tier: "low",
        aa_intelligence_index: 50,
        arena_elo: 1300,
      }),
      row({
        family_id: "Alpha",
        model: "Alpha high",
        effort_tier: "high",
        aa_intelligence_index: 60,
        arena_elo: 1350,
      }),
      row({ family_id: "Beta", aa_intelligence_index: 70, arena_elo: 1250 }),
      row({ family_id: "Beta", aa_intelligence_index: 80, arena_elo: 1260 }),
    ]);
    expect(out.families).toBe(2);
    expect(out.ranked_pool).toBe(2);
    // By mean Index: Beta (75) > Alpha (55). By mean Elo: Alpha (1325) > Beta (1255).
    expect(out.entries).toEqual([
      {
        family: "Beta",
        provider: "Acme",
        index_min: 70,
        index_max: 80,
        elo_min: 1250,
        elo_max: 1260,
        rank_by_index: 1,
        rank_by_elo: 2,
        rank_gap: 1,
      },
      {
        family: "Alpha",
        provider: "Acme",
        index_min: 50,
        index_max: 60,
        elo_min: 1300,
        elo_max: 1350,
        rank_by_index: 2,
        rank_by_elo: 1,
        rank_gap: 1,
      },
    ]);
    expect(out.max_rank_gap).toBe(1);
  });

  it("sorts entries by rank_gap desc (deterministic tie-break: rank_by_index, then family)", () => {
    const rows = [
      row({ family_id: "P", aa_intelligence_index: 90, arena_elo: 1000 }),
      row({ family_id: "Q", aa_intelligence_index: 80, arena_elo: 1200 }),
      row({ family_id: "R", aa_intelligence_index: 70, arena_elo: 1300 }),
      row({ family_id: "S", aa_intelligence_index: 60, arena_elo: 1400 }),
    ];
    const out = buildIntelConsistency(rows);
    // By index: P,Q,R,S (1-4). By elo: S,R,Q,P (1-4). Gaps: P=3, S=3, Q=1, R=1.
    expect(out.entries.map((e) => e.family)).toEqual(["P", "S", "Q", "R"]);
    expect(out.entries.map((e) => e.rank_gap)).toEqual([3, 3, 1, 1]);
    expect(out.max_rank_gap).toBe(3);
  });

  it("omits families without a row carrying BOTH metrics (elo-null, index-null, split rows, out-of-range index)", () => {
    const out = buildIntelConsistency([
      row({ family_id: "Valid", aa_intelligence_index: 55, arena_elo: 1300 }),
      row({ family_id: "EloNull", aa_intelligence_index: 60, arena_elo: null }),
      row({ family_id: "IndexNull", aa_intelligence_index: null, arena_elo: 1300 }),
      // SplitRow: one row has Index only, another Elo only — no single row has both.
      row({ family_id: "SplitRow", aa_intelligence_index: 65, arena_elo: null }),
      row({ family_id: "SplitRow", aa_intelligence_index: null, arena_elo: 1310 }),
      // Out of the documented 0-100 Index range → row does not qualify.
      row({ family_id: "OutOfRange", aa_intelligence_index: 101, arena_elo: 1290 }),
      // Missing keys entirely (null overrides the fixture defaults).
      row({ family_id: "MissingKeys", aa_intelligence_index: null, arena_elo: undefined }),
    ]);
    expect(out.families).toBe(1);
    expect(out.ranked_pool).toBe(1);
    expect(out.entries.map((e) => e.family)).toEqual(["Valid"]);
    expect(out.entries[0].rank_by_index).toBe(1);
    expect(out.entries[0].rank_by_elo).toBe(1);
    expect(out.entries[0].rank_gap).toBe(0);
  });

  it("titles the report as a consistency measurement, not a replacement score (exact framing)", () => {
    const out = buildIntelConsistency([row()]);
    expect(out.title).toBe(INTEL_CONSISTENCY_TITLE);
    expect(out.title).toBe(
      "AA Intelligence Index vs Arena Elo — consistency measurement, not a replacement score",
    );
    // The not-a-replacement framing is also carried in the note for downstream readers.
    expect(out.note).toContain("not a replacement score");
  });

  it("caps entries at 50 by default while ranking the full pool", () => {
    const rows = Array.from({ length: 55 }, (_, i) =>
      row({ family_id: `Family ${i}`, aa_intelligence_index: i + 10, arena_elo: 1000 + i }),
    );
    const out = buildIntelConsistency(rows);
    expect(out.families).toBe(55);
    expect(out.ranked_pool).toBe(55);
    expect(out.entries).toHaveLength(INTEL_CONSISTENCY_MAX_ENTRIES);
    expect(out.entries).toHaveLength(50);
  });

  it("honors a custom maxEntries cap", () => {
    const rows = [
      row({ family_id: "P", aa_intelligence_index: 90, arena_elo: 1000 }),
      row({ family_id: "Q", aa_intelligence_index: 80, arena_elo: 1200 }),
      row({ family_id: "R", aa_intelligence_index: 70, arena_elo: 1300 }),
      row({ family_id: "S", aa_intelligence_index: 60, arena_elo: 1400 }),
    ];
    const out = buildIntelConsistency(rows, { maxEntries: 2 });
    expect(out.entries.map((e) => e.family)).toEqual(["P", "S"]);
    // max_rank_gap still covers the full ranked pool, not just the capped entries.
    expect(out.max_rank_gap).toBe(3);
    expect(out.families).toBe(4);
  });

  it("returns a clean empty report for empty or missing rows", () => {
    for (const input of [[], undefined, null]) {
      const out = buildIntelConsistency(input as never);
      expect(out.title).toBe(INTEL_CONSISTENCY_TITLE);
      expect(out.families).toBe(0);
      expect(out.ranked_pool).toBe(0);
      expect(out.entries).toEqual([]);
      expect(out.max_rank_gap).toBe(0);
    }
  });
});
