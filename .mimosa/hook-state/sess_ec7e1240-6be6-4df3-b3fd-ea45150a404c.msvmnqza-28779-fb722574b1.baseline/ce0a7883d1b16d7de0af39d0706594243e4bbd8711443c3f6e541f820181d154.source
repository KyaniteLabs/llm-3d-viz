import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mapAaApiModel } from "../scripts/lib/aa-api.mjs";
import { hfRowToArenaEntry } from "../scripts/lib/arena-hf.mjs";
import { applyAaDerivedBlend, applyArenaElo, canAdmitPlotTriple } from "../scripts/lib/catalog-join.mjs";
import { taskTimeInfo } from "../src/lib/provenance";

const root = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(path.join(root, "../scripts/fixtures/aa-api-free-sample.json"), "utf8"),
);
const arenaFix = JSON.parse(
  readFileSync(path.join(root, "../scripts/fixtures/arena-hf-overall-sample.json"), "utf8"),
);

describe("AA Data API free mapper", () => {
  it("maps free API fields to catalog rows and admits after blend", () => {
    const rows = fixture.data.map((m: object) => mapAaApiModel(m, "2026-08-06"));
    expect(rows[0].aa_intelligence_index).toBe(24.5);
    expect(rows[0].tps).toBeCloseTo(296.47);
    expect(rows[0].price_in_per_M).toBe(0.06);
    expect(rows[0].blended_price_per_M).toBeNull();
    expect(rows[0].cost_per_index_task_usd).toBeCloseTo(0.1678);
    expect(rows[0].sources?.aa_intelligence_index?.origin).toBe("aa-api");

    const blended = applyAaDerivedBlend(rows);
    expect(blended[0].blended_price_per_M).toBeGreaterThan(0);
    expect(canAdmitPlotTriple(blended[0])).toBe(true);
  });
});

describe("WS5 — secondary intelligence axes + measured task time", () => {
  it("maps coding/agentic sub-indices with aa-api measured provenance", () => {
    const row = mapAaApiModel(fixture.data[0], "2026-08-06");
    expect(row.coding_index).toBeCloseTo(18.5);
    expect(row.agentic_index).toBeCloseTo(27.6);
    expect(row.sources?.coding_index).toEqual({ origin: "aa-api", kind: "measured" });
    expect(row.sources?.agentic_index).toEqual({ origin: "aa-api", kind: "measured" });
  });

  it("passes null through (no provenance stamp) when AA omits the sub-indices", () => {
    const sparse = {
      ...fixture.data[0],
      evaluations: { artificial_analysis_intelligence_index: 24.5 },
    };
    const row = mapAaApiModel(sparse, "2026-08-06");
    expect(row.coding_index).toBeNull();
    expect(row.agentic_index).toBeNull();
    expect(row.sources?.coding_index).toBeUndefined();
    expect(row.sources?.agentic_index).toBeUndefined();
  });

  it("maps median end-to-end response time to time_per_index_task_s measured", () => {
    const row = mapAaApiModel(fixture.data[0], "2026-08-06");
    expect(row.time_per_index_task_s).toBeCloseTo(9.09);
    expect(row.sources?.time_per_index_task_s).toEqual({ origin: "aa-api", kind: "measured" });
  });

  it("leaves time_per_index_task_s null and unstamped when e2e time is absent", () => {
    const sparse = {
      ...fixture.data[0],
      performance: { median_output_tokens_per_second: 296.47 },
    };
    const row = mapAaApiModel(sparse, "2026-08-06");
    expect(row.time_per_index_task_s).toBeNull();
    expect(row.sources?.time_per_index_task_s).toBeUndefined();
  });

  it("measured task time flows through taskTimeInfo as measured (existing preference locked)", () => {
    const row = mapAaApiModel(fixture.data[0], "2026-08-06");
    const info = taskTimeInfo(row);
    expect(info.kind).toBe("measured");
    expect(info.seconds).toBeCloseTo(9.09, 5);
    expect(info.label).not.toMatch(/est/);

    const noMeasured = mapAaApiModel(
      { ...fixture.data[0], performance: { median_output_tokens_per_second: 296.47 } },
      "2026-08-06",
    );
    expect(taskTimeInfo(noMeasured).kind).toBe("estimated");
  });
});

describe("Arena HF (CC BY 4.0) adapter", () => {
  it("keeps overall category and drops non-overall", () => {
    const entries = arenaFix.map(hfRowToArenaEntry).filter(Boolean);
    expect(entries).toHaveLength(1);
    expect(entries[0].modelDisplayName).toBe("claude-fable-5");
    expect(entries[0].rating).toBeCloseTo(1508.57);
  });

  it("attaches Elo to matching AA row via existing join", () => {
    const fable = mapAaApiModel(fixture.data[1], "2026-08-06");
    const blended = applyAaDerivedBlend([fable]);
    const entries = arenaFix.map(hfRowToArenaEntry).filter(Boolean);
    const { rows, attaches } = applyArenaElo(blended, entries);
    expect(attaches).toBeGreaterThanOrEqual(1);
    expect(rows[0].arena_elo).toBeCloseTo(1508.57);
    expect(rows[0].sources?.arena_elo?.origin).toBe("arena");
  });
});
