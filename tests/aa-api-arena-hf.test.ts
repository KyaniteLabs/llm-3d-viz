import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mapAaApiModel } from "../scripts/lib/aa-api.mjs";
import { hfRowToArenaEntry } from "../scripts/lib/arena-hf.mjs";
import { applyAaDerivedBlend, applyArenaElo, canAdmitPlotTriple } from "../scripts/lib/catalog-join.mjs";

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
