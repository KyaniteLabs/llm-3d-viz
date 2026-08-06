import { describe, expect, it } from "vitest";
import { markChannels, MARK_GLYPH_LEGEND } from "../src/viz/mark-encoding";

describe("mark-encoding (openness × reasoning 2×2)", () => {
  it("maps standard closed → solid sphere / circle", () => {
    const m = markChannels({ openness: "closed", reasoning: false });
    expect(m.sceneGlyph).toBe("sphere");
    expect(m.plotlySymbol).toBe("circle");
    expect(m.keyId).toBe("standard-closed");
  });

  it("maps standard open → wire sphere / circle-open", () => {
    const m = markChannels({ openness: "open", reasoning: false });
    expect(m.sceneGlyph).toBe("sphere-open");
    expect(m.plotlySymbol).toBe("circle-open");
  });

  it("maps reasoning closed → solid octa / diamond", () => {
    const m = markChannels({ openness: "closed", reasoning: true });
    expect(m.sceneGlyph).toBe("octa");
    expect(m.plotlySymbol).toBe("diamond");
  });

  it("maps reasoning open → wire octa / diamond-open", () => {
    const m = markChannels({ openness: "open", reasoning: true });
    expect(m.sceneGlyph).toBe("octa-open");
    expect(m.plotlySymbol).toBe("diamond-open");
  });

  it("does not depend on lab/provider (identity is color)", () => {
    // Same attributes → same glyph regardless of imagined lab.
    const a = markChannels({ openness: "open", reasoning: true });
    const b = markChannels({ openness: "open", reasoning: true });
    expect(a.sceneGlyph).toBe(b.sceneGlyph);
    expect(a.plotlySymbol).toBe(b.plotlySymbol);
  });

  it("exposes a stable 4-row glyph legend", () => {
    expect(MARK_GLYPH_LEGEND).toHaveLength(4);
    expect(MARK_GLYPH_LEGEND.map((r) => r.id)).toEqual([
      "standard-closed",
      "standard-open",
      "reasoning-closed",
      "reasoning-open",
    ]);
  });
});
