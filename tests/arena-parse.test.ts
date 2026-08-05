import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractArenaEntriesFromHtml, applyArenaElo } from "../scripts/lib/catalog-join.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(
  __dirname,
  "../scripts/fixtures/arena-text-style-control.snippet.html",
);

describe("Arena HTML parse", () => {
  it("extracts entries from committed fixture", () => {
    const html = fs.readFileSync(fixture, "utf8");
    const entries = extractArenaEntriesFromHtml(html);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.some((e) => String(e.modelDisplayName).includes("fable"))).toBe(true);
    expect(entries.every((e) => typeof e.rating === "number")).toBe(true);
  });

  it("soft-fail returns empty on garbage", () => {
    expect(extractArenaEntriesFromHtml("")).toEqual([]);
    expect(extractArenaEntriesFromHtml("<html>no data</html>")).toEqual([]);
  });

  it("fixture attaches Elo onto synthetic AA rows", () => {
    const html = fs.readFileSync(fixture, "utf8");
    const entries = extractArenaEntriesFromHtml(html);
    const aa = [
      {
        model: "Claude Fable 5 Max",
        family_id: "Claude Fable 5",
        effort_tier: "max",
        source_url: "https://artificialanalysis.ai/models/claude-fable-5",
        aa_intelligence_index: 60,
        tps: 70,
        blended_price_per_M: 7.7,
        price_in_per_M: 10,
        price_out_per_M: 50,
        arena_elo: null,
        source: "test",
      },
      {
        model: "Claude Opus 5 High",
        family_id: "Claude Opus 5",
        effort_tier: "high",
        source_url: "https://artificialanalysis.ai/models/claude-opus-5-high",
        aa_intelligence_index: 58,
        tps: 54,
        blended_price_per_M: 3.85,
        arena_elo: null,
        source: "test",
      },
      {
        model: "Claude Opus 5 Max",
        family_id: "Claude Opus 5",
        effort_tier: "max",
        source_url: "https://artificialanalysis.ai/models/claude-opus-5-max",
        aa_intelligence_index: 60,
        tps: 54,
        blended_price_per_M: 3.85,
        arena_elo: null,
        source: "test",
      },
    ];
    const { attaches } = applyArenaElo(aa, entries);
    expect(attaches).toBeGreaterThanOrEqual(3);
  });
});
