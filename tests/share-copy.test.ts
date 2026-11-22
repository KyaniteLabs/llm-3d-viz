import { describe, expect, it } from "vitest";
import { buildInsightMethodCopy, defaultStoryLine } from "../src/lib/share-copy";

describe("share-copy", () => {
  it("builds DiB method block", () => {
    const text = buildInsightMethodCopy({
      story: "Top pick is Luna.",
      axes: "cost($/M) × AA Index × speed(tok/s)",
      sources: "AA · OpenRouter · Arena",
      asOf: "2026-08-07",
      nPlottable: 93,
      url: "https://viz.kyanitelabs.tech/",
    });
    expect(text).toContain("Top pick is Luna.");
    expect(text).toContain("N plottable: 93");
    expect(text).toContain("Sources:");
  });

  it("fail-closed sparse story", () => {
    expect(defaultStoryLine({ decideMode: false, nPlottable: 1 })).toMatch(/Insufficient/);
  });

  it("reports the floor when Decide has no eligible models", () => {
    const story = defaultStoryLine({ decideMode: true, decideEligible: 0, floor: 72, nPlottable: 6 });
    expect(story).toContain("No models qualify at Index floor 72");
  });

  it("describes the cost and intelligence shortlist even without three plottable models", () => {
    const story = defaultStoryLine({
      decideMode: true, decideBasis: "intelligence", decideEligible: 2, floor: 60, nPlottable: 1,
    });
    expect(story).toContain("Index floor 60 ranked on cost × intelligence");
  });
});
