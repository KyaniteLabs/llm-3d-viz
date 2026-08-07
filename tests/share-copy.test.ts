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
});
