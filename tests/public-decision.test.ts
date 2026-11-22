import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function cli(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "bin/atlas-cli.ts", ...args], {
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
    expect(ranked.shortlist).toHaveLength(3);
    expect(ranked.shortlist).toEqual(listed.eligible.slice(0, 3));
    for (const row of ranked.shortlist) {
      expect(row.intelligence.metric).toBe("Epoch Capabilities Index (ECI)");
      expect(row.intelligence.value).toBeGreaterThanOrEqual(50);
      expect(row.price.blended_per_M).toBeGreaterThanOrEqual(0);
      expect(row.price.license_url).toMatch(/^https:/);
      expect(row.intelligence.attribution).toMatch(/Epoch/);
    }
  });

  it("reports provider filtering, no matches, no speed, and missing prices", () => {
    const result = JSON.parse(cli("eligible", "--provider", "Anthropic", "--floor", "0").stdout);
    expect(result.eligible.length).toBeGreaterThan(0);
    expect(result.eligible.every((row: { provider: string }) => row.provider === "Anthropic")).toBe(true);
    expect(result.missing_price_count).toBeGreaterThan(0);
    const empty = JSON.parse(cli("eligible", "--provider", "No such provider").stdout);
    expect(empty.eligible).toEqual([]);
    expect(empty.message).toMatch(/provider/i);
    const speed = JSON.parse(cli("rank", "--objective", "max_speed").stdout);
    expect(speed.shortlist).toEqual([]);
    expect(speed.message).toMatch(/speed measurements/i);
  });
});
