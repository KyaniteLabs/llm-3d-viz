import { describe, expect, it } from "vitest";
import { markChannels, MARK_GLYPH_LEGEND } from "../src/viz/mark-encoding";

describe("mark-encoding (shape = openness · all wire)", () => {
  it("maps closed weights → wire sphere / circle-open", () => {
    const m = markChannels({ openness: "closed", reasoning: false });
    expect(m.sceneGlyph).toBe("sphere-open");
    expect(m.plotlySymbol).toBe("circle-open");
    expect(m.keyId).toBe("closed-wire");
    expect(m.openness).toBe("closed");
  });

  it("maps open weights → wire octa / diamond-open", () => {
    const m = markChannels({ openness: "open", reasoning: false });
    expect(m.sceneGlyph).toBe("octa-open");
    expect(m.plotlySymbol).toBe("diamond-open");
    expect(m.keyId).toBe("open-wire");
  });

  it("ignores reasoning for glyph choice (freed channel was openness)", () => {
    const closedReason = markChannels({ openness: "closed", reasoning: true });
    const closedStd = markChannels({ openness: "closed", reasoning: false });
    expect(closedReason.sceneGlyph).toBe(closedStd.sceneGlyph);
    expect(closedReason.plotlySymbol).toBe(closedStd.plotlySymbol);
    expect(closedReason.reasoning).toBe(true);
    expect(closedStd.reasoning).toBe(false);

    const openReason = markChannels({ openness: "open", reasoning: true });
    const openStd = markChannels({ openness: "open", reasoning: false });
    expect(openReason.sceneGlyph).toBe(openStd.sceneGlyph);
    expect(openReason.sceneGlyph).toBe("octa-open");
  });

  it("does not depend on lab/provider (identity is color)", () => {
    const a = markChannels({ openness: "open", reasoning: true });
    const b = markChannels({ openness: "open", reasoning: false });
    expect(a.sceneGlyph).toBe(b.sceneGlyph);
  });

  it("exposes a stable 2-row glyph legend (not 2×2)", () => {
    expect(MARK_GLYPH_LEGEND).toHaveLength(2);
    expect(MARK_GLYPH_LEGEND.map((r) => r.id)).toEqual(["closed-wire", "open-wire"]);
    // Product law: all legend glyphs are wire variants.
    for (const row of MARK_GLYPH_LEGEND) {
      expect(row.sceneGlyph.endsWith("-open") || row.sceneGlyph === "cross").toBe(true);
      expect(row.plotlySymbol.includes("open") || row.plotlySymbol === "x").toBe(true);
    }
  });
});
