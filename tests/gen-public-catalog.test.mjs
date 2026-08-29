import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import {
  buildPublicCatalog,
  assertPublicCatalogClean,
  FULL_PATH,
} from "../scripts/gen-public-catalog.mjs";

const row = (over = {}) => ({
  model: "Test Model",
  provider: "TestLab",
  openness: "open",
  modality: "text",
  aa_intelligence_index: 42,
  tps: 99,
  blended_price_per_M: 1.5,
  arena_elo: 1300,
  sources: {
    aa_intelligence_index: { origin: "aa-api", kind: "measured" },
    tps: { origin: "aa-api", kind: "measured" },
    blended_price_per_M: { origin: "aa", kind: "measured" },
    arena_elo: { origin: "arena", kind: "leaderboard" },
    modality: { origin: "aa-api", kind: "meta" },
  },
  ...over,
});

describe("gen-public-catalog transform", () => {
  it("nulls aa-api/aa/openrouter-origin fields and drops their provenance", () => {
    const [out] = buildPublicCatalog([row()]);
    expect(out.aa_intelligence_index).toBeNull();
    expect(out.tps).toBeNull();
    expect(out.blended_price_per_M).toBeNull();
    expect(out.sources.aa_intelligence_index).toBeUndefined();
    expect(out.sources.tps).toBeUndefined();
    expect(out.sources.blended_price_per_M).toBeUndefined();
  });

  it("strips openrouter-origin pricing the same as aa", () => {
    const r = row();
    r.price_in_per_M = 0.5;
    r.sources.price_in_per_M = { origin: "openrouter", kind: "measured" };
    const [out] = buildPublicCatalog([r]);
    expect(out.price_in_per_M).toBeNull();
    expect(out.sources.price_in_per_M).toBeUndefined();
  });

  it("keeps public-spec facts (modality/context_length) but re-sources them", () => {
    const r = row();
    r.context_length = 131072;
    r.sources.context_length = { origin: "openrouter", kind: "measured" };
    const [out] = buildPublicCatalog([r]);
    expect(out.modality).toBe("text");
    expect(out.context_length).toBe(131072);
    expect(out.sources.modality).toEqual({ origin: "curated", kind: "public-spec" });
    expect(out.sources.context_length).toEqual({ origin: "provider", kind: "public-spec" });
  });

  it("keeps arena/provider/curated origins untouched", () => {
    const [out] = buildPublicCatalog([row()]);
    expect(out.arena_elo).toBe(1300);
    expect(out.sources.arena_elo).toEqual({ origin: "arena", kind: "leaderboard" });
  });

  it("records a null_reason when stripping occurs, and not otherwise", () => {
    const untouched = row({
      aa_intelligence_index: null,
      tps: null,
      blended_price_per_M: null,
      sources: { modality: { origin: "provider", kind: "meta" } },
    });
    const [clean] = buildPublicCatalog([untouched]);
    expect(clean.null_reason).toBeUndefined();
    const [stripped] = buildPublicCatalog([row()]);
    expect(stripped.null_reason).toContain("public plane");
  });

  it("is idempotent over its own output", () => {
    const once = buildPublicCatalog([row()]);
    const twice = buildPublicCatalog(once);
    expect(twice).toEqual(once);
  });

  it("assertPublicCatalogClean throws on leaked origins", () => {
    expect(() => assertPublicCatalogClean([row()])).toThrow();
    expect(() => assertPublicCatalogClean(buildPublicCatalog([row()]))).not.toThrow();
  });

  it("real catalog: output carries zero aa/openrouter origins (when draft exists)", async () => {
    if (!existsSync(FULL_PATH)) return;
    const { readFileSync } = await import("node:fs");
    const rows = JSON.parse(readFileSync(FULL_PATH, "utf8"));
    const pub = buildPublicCatalog(rows);
    assertPublicCatalogClean(pub);
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain('"origin":"aa-api"');
    expect(serialized).not.toContain('"origin":"openrouter"');
  });
});
