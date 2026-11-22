import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function cli(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "bin/atlas-cli.ts", ...args], {
    cwd: resolve(import.meta.dirname, ".."),
    timeout: 30_000,
    encoding: "utf8",
    env: { ...process.env, ATLAS_CATALOG_PATH: "" },
  });
}

describe("public Atlas CLI", () => {
  it("ranks the same direct Epoch and priced rows that it lists as eligible", () => {
    const rank = cli("rank", "--floor", "50", "--objective", "min_cost");
    const eligible = cli("eligible", "--floor", "50");
    expect(rank.status).toBe(0);
    expect(eligible.status).toBe(0);
    const ranked = JSON.parse(rank.stdout);
    const listed = JSON.parse(eligible.stdout);
    expect(ranked.score_basis).toMatch(/Epoch/);
    expect(ranked.shortlist.length).toBeGreaterThan(0);
    expect(ranked.shortlist.length).toBeLessThanOrEqual(3);
    for (const row of ranked.shortlist) {
      expect(listed.eligible).toContainEqual(row);
      const dominators = listed.eligible.filter((candidate: typeof row) =>
        candidate.price.blended_per_M <= row.price.blended_per_M &&
        candidate.intelligence.value >= row.intelligence.value &&
        (candidate.price.blended_per_M < row.price.blended_per_M ||
          candidate.intelligence.value > row.intelligence.value));
      expect(dominators).toEqual([]);
      expect(row.intelligence.metric).toBe("Epoch Capabilities Index (ECI)");
      expect(row.intelligence.value).toBeGreaterThanOrEqual(50);
      expect(row.price.blended_per_M).toBeGreaterThanOrEqual(0);
      expect(row.price.license_url).toMatch(/^https:/);
      expect(row.intelligence.attribution).toMatch(/Epoch/);
    }
  }, 30_000);

  it("reports provider filtering, no matches, no speed, and missing prices", () => {
    const result = JSON.parse(cli("eligible", "--provider", "Anthropic", "--floor", "0").stdout);
    expect(result.eligible.length).toBeGreaterThan(0);
    expect(result.eligible.every((row: { provider: string }) => row.provider === "Anthropic")).toBe(true);
    expect(result.missing_price_count).toBeGreaterThanOrEqual(0);
    const empty = JSON.parse(cli("eligible", "--provider", "No such provider").stdout);
    expect(empty.eligible).toEqual([]);
    expect(empty.message).toMatch(/provider/i);
    const speed = JSON.parse(cli("rank", "--objective", "max_speed").stdout);
    expect(speed.shortlist).toEqual([]);
    expect(speed.message).toMatch(/speed measurements/i);
    const unknown = JSON.parse(cli("rank", "--objective", "max_speed", "--provider", "Unknown provider").stdout);
    expect(unknown.message).toMatch(/provider/i);
    const balanced = JSON.parse(cli("rank", "--objective", "balanced", "--n", "1").stdout);
    expect(balanced.shortlist).toHaveLength(1);
    expect(balanced.message).toMatch(/cost.capability/i);
  }, 30_000);

  it("keeps cost and capability candidates visible in an explicit measured-catalog override", () => {
    const dir = mkdtempSync(join(tmpdir(), "iolite-atlas-fixture-"));
    try {
      const path = join(dir, "catalog.json");
      writeFileSync(path, JSON.stringify([
        { model: "Measured", provider: "Fixture", aa_intelligence_index: 65, tps: 20, blended_price_per_M: 2 },
        { model: "Speed unknown", provider: "Fixture", aa_intelligence_index: 70, tps: null, blended_price_per_M: 1 },
      ]));
      const eligible = JSON.parse(cli("eligible", "--catalog", path, "--provider", "Fixture").stdout);
      expect(eligible.eligible.map((row: { id: string }) => row.id)).toEqual(["Measured", "Speed unknown"]);
      const speed = JSON.parse(cli("rank", "--catalog", path, "--objective", "max_speed").stdout);
      expect(speed.shortlist.map((row: { id: string }) => row.id)).toEqual(["Measured"]);
      expect(speed.missing_speed_count).toBe(1);
      const unknown = JSON.parse(cli("rank", "--catalog", path, "--provider", "Unknown provider").stdout);
      expect(unknown.message).toMatch(/provider/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
