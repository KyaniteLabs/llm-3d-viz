import { describe, expect, it } from "vitest";
import type { Model } from "../src/data/models";
import {
  buildDecideResponse,
  catalogSnapshotId,
  costSpeedPareto,
  dominatesCostSpeed,
  filterPickEligible,
  isPickEligible,
  rankParetoByBias,
  shortlistFromDecide,
} from "../src/lib/decide";

const model = (
  name: string,
  tps: number | null,
  price: number | null,
  intel: number | null,
): Model => ({
  model: name,
  provider: "lab",
  openness: "open",
  modality: ["text"],
  context_length: 128_000,
  release_date: "2026-01-01",
  source_url: "https://example.test",
  tps,
  ttft: 100,
  price_in_per_M: price,
  price_out_per_M: price,
  blended_price_per_M: price,
  aa_intelligence_index: intel,
  arena_elo: null,
  gpqa: null,
  swe_bench: null,
  aider_pct: null,
  data_date: "2026-01-01",
  source: "fixture",
  null_reason: tps === null || price === null || intel === null ? "incomplete" : undefined,
});

describe("decide floor eligibility", () => {
  it("requires scorable axes and Index ≥ floor", () => {
    const ok = model("ok", 100, 1, 60);
    const dumb = model("dumb", 100, 1, 40);
    const noPrice = model("np", 100, null, 90);
    expect(isPickEligible(ok, 50)).toBe(true);
    expect(isPickEligible(dumb, 50)).toBe(false);
    expect(isPickEligible(noPrice, 50)).toBe(false);
    expect(filterPickEligible([ok, dumb, noPrice], 50).map((m) => m.model)).toEqual(["ok"]);
  });
});

describe("cost×speed Pareto", () => {
  it("keeps non-dominated cheap/fast points", () => {
    const cheapSlow = model("cs", 10, 0.5, 70);
    const mid = model("mid", 50, 2, 70);
    const expensiveFast = model("ef", 200, 10, 70);
    const dominated = model("dom", 20, 5, 70);
    expect(dominatesCostSpeed(mid, dominated)).toBe(true);
    const front = costSpeedPareto([cheapSlow, mid, expensiveFast, dominated]);
    expect(new Set(front.map((m) => m.model))).toEqual(new Set(["cs", "mid", "ef"]));
  });
});

describe("bias shortlist", () => {
  it("orders Pareto cheap-first or fast-first", () => {
    const cheap = model("cheap", 20, 0.5, 70);
    const mid = model("mid", 80, 3, 70);
    const fast = model("fast", 200, 12, 70);
    const pareto = costSpeedPareto([cheap, mid, fast]);
    expect(rankParetoByBias(pareto, -1)[0].model).toBe("cheap");
    expect(rankParetoByBias(pareto, 1)[0].model).toBe("fast");
  });

  it("builds DecideResponse with required snapshot and floorSource", () => {
    const rows = [
      model("a", 10, 0.5, 55),
      model("b", 50, 2, 60),
      model("c", 100, 5, 70),
      model("d", 150, 8, 80),
    ];
    const snap = catalogSnapshotId(rows);
    expect(snap.startsWith("cat_")).toBe(true);
    expect(snap).not.toBe("local");
    const { shortlist } = shortlistFromDecide(rows, 50, 0, 3);
    expect(shortlist.length).toBeLessThanOrEqual(3);
    const resp = buildDecideResponse(rows, {
      floor: 50,
      bias: 0,
      floorSource: "default",
      catalogSnapshotId: snap,
    });
    expect(resp.schema_version).toBe("1.0");
    expect(resp.floor_applied.source).toBe("default");
    expect(resp.catalog_snapshot_id).toBe(snap);
  });

  it("rejects bare local snapshot id", () => {
    expect(() =>
      buildDecideResponse([model("a", 10, 1, 60)], {
        floor: 50,
        bias: 0,
        floorSource: "user",
        catalogSnapshotId: "local",
      }),
    ).toThrow(/catalogSnapshotId/);
  });

  it("is stable for fixed product catalog fixture", () => {
    const catalog = [model("z", 1, 1, 10), model("a", 2, 2, 20)];
    expect(catalogSnapshotId(catalog)).toBe(catalogSnapshotId(catalog));
    // Order of input must not matter
    expect(catalogSnapshotId([...catalog].reverse())).toBe(catalogSnapshotId(catalog));
  });

  it("preserves each floorSource on export", () => {
    const rows = [model("a", 50, 2, 60)];
    const snap = catalogSnapshotId(rows);
    for (const source of ["user", "anchor", "default"] as const) {
      const resp = buildDecideResponse(rows, {
        floor: 55,
        bias: 0,
        floorSource: source,
        catalogSnapshotId: snap,
      });
      expect(resp.floor_applied.source).toBe(source);
    }
  });
});
