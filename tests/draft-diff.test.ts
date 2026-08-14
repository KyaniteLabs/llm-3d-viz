import { describe, expect, it } from "vitest";
import { diffDrafts } from "../scripts/lib/draft-diff.mjs";

function row(p) {
  const model = p?.model ?? "Model A";
  return {
    model,
    provider: "DeepSeek",
    family_id: model,
    effort_tier: "none",
    release_date: "2026-01-01",
    source_url: `https://artificialanalysis.ai/models/${model.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    price_in_per_M: 1,
    price_out_per_M: 2,
    blended_price_per_M: 1.2,
    ...p,
  };
}

describe("draft-diff", () => {
  it("returns unavailable when the previous draft is absent (first run)", () => {
    const d = diffDrafts(null, [row({})]);
    expect(d.available).toBe(false);
    expect(d.counts).toBeNull();
  });

  it("classifies adds and removes by spine", () => {
    const prev = [row({}), row({ model: "Old Model", family_id: "Old Model" })];
    const next = [row({}), row({ model: "New Model", family_id: "New Model" })];
    const d = diffDrafts(prev, next);
    expect(d.counts).toEqual({ added: 1, removed: 1, renamed: 0, price_deltas: 0 });
    expect(d.removed[0].model).toBe("Old Model");
    expect(d.added[0].model).toBe("New Model");
  });

  it("pairs renames (same provider + normalized family) — Ling-style AA rename", () => {
    const prev = [
      row({
        model: "Ling-3.0-flash",
        source_url: "https://artificialanalysis.ai/models/ling-3-0-flash",
      }),
    ];
    const next = [
      row({
        model: "Ling 3.0 Flash",
        source_url: "https://artificialanalysis.ai/models/ling-3-0-flash-v2",
      }),
    ];
    const d = diffDrafts(prev, next);
    expect(d.counts).toEqual({ added: 0, removed: 0, renamed: 1, price_deltas: 0 });
    expect(d.renamed[0]).toMatchObject({ from: "Ling-3.0-flash", to: "Ling 3.0 Flash", provider: "DeepSeek" });
  });

  it("classifies manual→AA supersede as a rename, not a cloud-lab removal (GLM-5.3 case)", () => {
    const prev = [
      row({
        model: "GLM-5.3 (max)",
        provider: "Z AI",
        family_id: "GLM-5.3",
        effort_tier: "max",
        source_url: "https://z.ai/blog/glm-5.3",
      }),
    ];
    const next = [
      row({
        model: "GLM-5.3 (max)",
        provider: "Z AI",
        family_id: "GLM-5.3",
        effort_tier: "max",
        source_url: "https://artificialanalysis.ai/models/glm-5-3",
      }),
    ];
    const d = diffDrafts(prev, next);
    expect(d.counts).toEqual({ added: 0, removed: 0, renamed: 1, price_deltas: 0 });
  });

  it("does not pair across providers (same family name)", () => {
    const prev = [
      row({ model: "Fam X", provider: "Meta", source_url: "https://artificialanalysis.ai/models/fam-x-meta" }),
    ];
    const next = [
      row({ model: "Fam X", provider: "Google", source_url: "https://artificialanalysis.ai/models/fam-x-google" }),
    ];
    const d = diffDrafts(prev, next);
    expect(d.counts).toEqual({ added: 1, removed: 1, renamed: 0, price_deltas: 0 });
  });

  it("records price deltas above 10%, ignores below", () => {
    const prev = [row({})];
    const next = [row({ price_in_per_M: 1.05, price_out_per_M: 2.6, blended_price_per_M: 1.2 })];
    const d = diffDrafts(prev, next);
    expect(d.price_deltas).toHaveLength(1);
    expect(d.price_deltas[0]).toMatchObject({ field: "price_out_per_M", pct: 30 });
  });
});
