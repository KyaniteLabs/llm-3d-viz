import { describe, expect, it } from "vitest";
import { buildWatchlistReport } from "../scripts/lib/model-watchlist.mjs";
import watchlistDoc from "../data/model-watchlist.json";

const entries = [
  { family: "GLM-5.3", provider: "Z AI", announced_date: "2026-08-14" },
  { family: "Qwen3.8 27B", provider: "Alibaba", announced_date: "2026-08-03" },
  { family: "Seed 2.1 Turbo", provider: "ByteDance Seed", announced_date: "2026-08-10" },
];

describe("model watchlist report", () => {
  it("marks entries awaiting AA measurement with aging days", () => {
    const report = buildWatchlistReport(entries, [], [], "2026-08-14");
    const qwen = report.find((r) => r.family === "Qwen3.8 27B");
    expect(qwen.status).toBe("awaiting_aa_measurement");
    expect(qwen.days_since_announcement).toBe(11);
  });

  it("flips to measured_by_aa when AA has the family (slug-style family match)", () => {
    const aaRows = [{ model: "Qwen3.8-27B (Reasoning)", provider: "Alibaba", family_id: "Qwen3.8-27B" }];
    const report = buildWatchlistReport(entries, aaRows, [], "2026-08-14");
    expect(report.find((r) => r.family === "Qwen3.8 27B").status).toBe("measured_by_aa");
  });

  it("marks manual-row tracking (GLM-5.3 case) — supersede regression fixture", () => {
    const manualRows = [{ model: "GLM-5.3 (max)", provider: "Z AI", family_id: "GLM-5.3" }];
    const report = buildWatchlistReport(entries, [], manualRows, "2026-08-14");
    expect(report.find((r) => r.family === "GLM-5.3").status).toBe("tracked_via_manual_row");
  });

  it("the tracked file's entries vet clean and carry the no-sibling-attribution note", () => {
    const rows = (watchlistDoc as { entries: typeof entries & { note?: string }[] }).entries;
    const report = buildWatchlistReport(rows, [], [], "2026-08-14");
    expect(report).toHaveLength(3);
    const qwen = rows.find((r) => r.family === "Qwen3.8 27B");
    expect(qwen.note).toContain("must NOT be attributed");
  });
});
