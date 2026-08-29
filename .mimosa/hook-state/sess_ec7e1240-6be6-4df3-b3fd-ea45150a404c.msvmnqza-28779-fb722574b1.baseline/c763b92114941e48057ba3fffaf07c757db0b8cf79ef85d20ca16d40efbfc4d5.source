import { describe, expect, it } from "vitest";
import { buildStaleCostTask } from "../scripts/lib/stale-cost-task.mjs";

function row(p = {}) {
  return {
    model: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    family_id: "DeepSeek V4 Pro",
    effort_tier: "none",
    cost_per_index_task_usd: 0.0214,
    price_in_per_M: 1,
    price_out_per_M: 2,
    blended_price_per_M: 1,
    ...p,
  };
}

describe("cost-per-task staleness flag (W4 / ticket #190)", () => {
  it("flags a row whose blended price moved +30% on the same spine", () => {
    const prev = [row({ blended_price_per_M: 1 })];
    const cur = [row({ blended_price_per_M: 1.3 })];
    const out = buildStaleCostTask(cur, { prevRows: prev });
    expect(out.count).toBe(1);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({
      model: "DeepSeek V4 Pro",
      provider: "DeepSeek",
      field: "blended_price_per_M",
      from: 1,
      to: 1.3,
      pct: 30,
    });
  });

  it("flags nothing when prices are unchanged", () => {
    const prev = [row()];
    const out = buildStaleCostTask([row()], { prevRows: prev });
    expect(out.count).toBe(0);
    expect(out.entries).toEqual([]);
  });

  it("exactly 25% is not a move (strict >25% rule)", () => {
    const prev = [row({ blended_price_per_M: 1 })];
    const out = buildStaleCostTask([row({ blended_price_per_M: 1.25 })], { prevRows: prev });
    expect(out.count).toBe(0);
  });

  it("first run (no previous draft) flags nothing", () => {
    expect(buildStaleCostTask([row()])).toEqual({ count: 0, entries: [] });
    expect(buildStaleCostTask([row()], { prevRows: null })).toEqual({ count: 0, entries: [] });
    expect(buildStaleCostTask([row()], { prevRows: [] })).toEqual({ count: 0, entries: [] });
  });

  it("excludes rows with null cost_per_index_task_usd even on a big price move", () => {
    const prev = [row()];
    const cur = [row({ cost_per_index_task_usd: null, blended_price_per_M: 2 })];
    const out = buildStaleCostTask(cur, { prevRows: prev });
    expect(out.count).toBe(0);
  });

  it("excludes spines absent from the previous draft (family or effort mismatch)", () => {
    const prev = [row()];
    const newFamily = buildStaleCostTask(
      [row({ family_id: "Kimi K3", model: "Kimi K3", provider: "Moonshot", blended_price_per_M: 2 })],
      { prevRows: prev },
    );
    const newEffort = buildStaleCostTask([row({ effort_tier: "high", blended_price_per_M: 2 })], {
      prevRows: prev,
    });
    expect(newFamily.count).toBe(0);
    expect(newEffort.count).toBe(0);
  });

  it("does not conflate sibling variants sharing family_id + tier (spineKey slug disambiguates)", () => {
    // Real-draft shape: "(Reasoning)" and "(Non-reasoning)" share family_id and
    // effort_tier "none" but are different rows with different prices — only the
    // slug (not the bare family+effort pair) identifies the previous row.
    const prev = [row({ model: "Qwen3.6 27B (Non-reasoning)", blended_price_per_M: 0.9 })];
    const cur = [row({ model: "Qwen3.6 27B (Reasoning)", blended_price_per_M: 0.564 })];
    const out = buildStaleCostTask(cur, { prevRows: prev });
    expect(out.count).toBe(0);
  });

  it("caps entries (and count) at 100", () => {
    const prev = Array.from({ length: 150 }, (_, i) =>
      row({ family_id: `Family ${i}`, model: `Family ${i} Model` }),
    );
    const cur = prev.map((r) => ({ ...r, blended_price_per_M: 2 })); // +100% each
    const out = buildStaleCostTask(cur, { prevRows: prev });
    expect(out.entries).toHaveLength(100);
    expect(out.count).toBe(100);
  });
});
