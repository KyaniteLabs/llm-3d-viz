import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { publicDecision } from "../src/lib/public-decision";

it("generates the public frontier from the decision catalog without writing to public/", () => {
  const out = mkdtempSync(join(tmpdir(), "iolite-frontier-test-"));
  const tracked = "public/frontier-watch.json";
  const before = readFileSync(tracked, "utf8");
  try {
    const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/gen-public-frontier.ts", out], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const result = JSON.parse(readFileSync(join(out, "frontier-watch.json"), "utf8"));
    expect(result.score_basis).toMatch(/Epoch/);
    expect(result.frontier.length).toBeGreaterThan(0);
    const all = publicDecision(0).eligible;
    for (const row of result.frontier) {
      expect(row).toMatchObject({ intelligence: { metric: "Epoch Capabilities Index (ECI)" } });
      expect(all.some((candidate) =>
        candidate.price.blended_per_M <= row.price.blended_per_M &&
        candidate.intelligence.value >= row.intelligence.value &&
        (candidate.price.blended_per_M < row.price.blended_per_M ||
          candidate.intelligence.value > row.intelligence.value),
      )).toBe(false);
    }
    expect(readFileSync(tracked, "utf8")).toBe(before);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

it("links the public frontier to the bundled sources and licence notices", () => {
  const markdown = readFileSync("public/frontier-watch.md", "utf8");
  const sources = readFileSync("public/sources/index.html", "utf8");
  const notices = readFileSync("public/decision-data-attribution.txt", "utf8");
  expect(markdown).toContain("/sources/#decision-data");
  expect(sources).toMatch(/id="decision-data"[\s\S]*Epoch AI[\s\S]*LiteLLM/);
  expect(sources).toContain("/decision-data-attribution.txt");
  expect(notices).toContain("Copyright (c) 2023 Berri AI");
});
