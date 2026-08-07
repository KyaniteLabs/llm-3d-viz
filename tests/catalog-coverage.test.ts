import { describe, expect, it } from "vitest";
import {
  buildCatalogCoverage,
  formatCoverageTable,
} from "../src/lib/catalog-coverage";
import {
  formatArenaElo,
  formatCoverageBadge,
  formatProvenanceLine,
  taskTimeInfo,
} from "../src/lib/provenance";
import type { Model } from "../src/data/models";

function row(partial: Partial<Model> & Pick<Model, "model">): Model {
  return {
    provider: "Test",
    openness: "closed",
    modality: ["text"],
    context_length: 128000,
    release_date: "2026-01-01",
    source_url: "https://example.test",
    tps: 100,
    ttft: 200,
    price_in_per_M: 1,
    price_out_per_M: 2,
    blended_price_per_M: 1.5,
    aa_intelligence_index: 55,
    arena_elo: null,
    gpqa: null,
    swe_bench: null,
    aider_pct: null,
    data_date: "2026-08-07",
    source: "test",
    reasoning: false,
    ...partial,
  };
}

describe("catalog coverage", () => {
  it("counts present vs missing fields", () => {
    const report = buildCatalogCoverage([
      row({ model: "A", arena_elo: 1200, cost_per_index_task_usd: 0.1 }),
      row({ model: "B", aa_intelligence_index: null, tps: null, blended_price_per_M: null }),
    ] as unknown as Record<string, unknown>[]);
    expect(report.model_count).toBe(2);
    expect(report.decide_ready).toBe(1);
    const arena = report.fields.find((f) => f.field === "arena_elo");
    expect(arena?.present).toBe(1);
    expect(arena?.missing).toBe(1);
    expect(formatCoverageTable(report)).toMatch(/Decide-ready/);
  });
});

describe("provenance + task time honesty", () => {
  it("formats provenance from sources map", () => {
    const line = formatProvenanceLine({
      source: "AA Data API free",
      sources: {
        aa_intelligence_index: { origin: "aa", kind: "measured" },
        blended_price_per_M: { origin: "openrouter", kind: "list" },
        arena_elo: { origin: "arena", kind: "measured" },
      },
    });
    expect(line).toMatch(/Index: Artificial Analysis/);
    expect(line).toMatch(/OpenRouter/);
    expect(line).toMatch(/Arena/);
  });

  it("labels estimated task time when wall time missing", () => {
    const info = taskTimeInfo({
      time_per_index_task_s: null,
      tps: 100,
      ttft: 1000,
    });
    expect(info.kind).toBe("estimated");
    expect(info.label).toMatch(/est/);
    // TTFT 1s + 1000/100 = 11s
    expect(info.seconds).toBeCloseTo(11, 5);
  });

  it("labels measured task time when present", () => {
    const info = taskTimeInfo({
      time_per_index_task_s: 42,
      tps: 100,
      ttft: 1000,
    });
    expect(info.kind).toBe("measured");
    expect(info.label).not.toMatch(/est/);
  });

  it("formats arena and coverage badge", () => {
    expect(formatArenaElo(1250.4)).toBe("1,250");
    expect(formatArenaElo(null)).toBe("—");
    expect(
      formatCoverageBadge({
        modelCount: 100,
        costTaskPresent: 40,
        arenaPresent: 20,
        timeTaskMeasured: 0,
      }),
    ).toMatch(/task cost 40%/);
  });
});
