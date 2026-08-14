import { describe, expect, it } from "vitest";
import { buildOrOverlayTelemetry } from "../scripts/lib/or-telemetry.mjs";

/**
 * WS6 OR overlay telemetry fixtures (M3) — report-only match-rate histogram
 * using the production matcher over merged-shaped rows.
 */
function mergedRow(p: Record<string, unknown>) {
  return {
    model: "",
    provider: "",
    effort_tier: "none",
    source_url: "",
    ...p,
  };
}

const orModels = [
  { id: "openai/gpt-5.5", pricing: { prompt: "0.000001" } },
  { id: "anthropic/claude-opus-5", pricing: { prompt: "0.000005" } },
];

const rows = [
  // org-hint exact match
  mergedRow({
    model: "GPT-5.5 (high)",
    provider: "OpenAI",
    source_url: "https://artificialanalysis.ai/models/gpt-5.5",
  }),
  // bare-slug match: exactly one org owns the slug
  mergedRow({
    model: "Claude Opus 5 (max)",
    provider: "Unknown Lab",
    source_url: "https://artificialanalysis.ai/models/claude-opus-5",
  }),
  // no OR model carries this slug → unmatched (DeepSeek)
  mergedRow({
    model: "DeepSeek V4 Pro (max)",
    provider: "DeepSeek",
    source_url: "https://artificialanalysis.ai/models/deepseek-v4-pro",
  }),
  // no source_url slug at all → unmatched (Mistral)
  mergedRow({ model: "Mistral Weird", provider: "Mistral" }),
  // second unmatched DeepSeek row for the histogram count
  mergedRow({
    model: "DeepSeek V4 Pro (none)",
    provider: "DeepSeek",
    source_url: "https://artificialanalysis.ai/models/deepseek-v4-pro",
  }),
];

describe("or_overlay_telemetry (WS6, M3)", () => {
  it("counts matched vs unmatched rows and histograms unmatched by provider", () => {
    const t = buildOrOverlayTelemetry(rows, orModels);
    expect(t.rows_total).toBe(5);
    expect(t.rows_matched).toBe(2);
    expect(t.rows_unmatched).toBe(3);
    expect(t.unmatched_by_provider).toEqual([
      { provider: "DeepSeek", count: 2 },
      { provider: "Mistral", count: 1 },
    ]);
  });

  it("sorts the provider histogram by count, then name (stable output)", () => {
    const mixed = [
      mergedRow({ provider: "Zeta", source_url: "https://artificialanalysis.ai/models/nope-a" }),
      mergedRow({ provider: "Alpha", source_url: "https://artificialanalysis.ai/models/nope-b" }),
      mergedRow({ provider: "Alpha", source_url: "https://artificialanalysis.ai/models/nope-c" }),
      mergedRow({ provider: "mid", source_url: "https://artificialanalysis.ai/models/nope-d" }),
    ];
    const t = buildOrOverlayTelemetry(mixed, orModels);
    expect(t.unmatched_by_provider.map((e: { provider: string }) => e.provider)).toEqual([
      "Alpha",
      "mid",
      "Zeta",
    ]);
  });

  it("handles empty rows and empty OpenRouter models without throwing", () => {
    expect(buildOrOverlayTelemetry([], orModels)).toMatchObject({
      rows_total: 0,
      rows_matched: 0,
      rows_unmatched: 0,
      unmatched_by_provider: [],
    });
    const allUnmatched = buildOrOverlayTelemetry(rows, []);
    expect(allUnmatched.rows_unmatched).toBe(5);
    expect(allUnmatched.unmatched_by_provider[0]).toEqual({ provider: "DeepSeek", count: 2 });
  });

  it("labels missing providers as Unknown in the histogram", () => {
    const t = buildOrOverlayTelemetry(
      [mergedRow({ model: "No Provider Row", source_url: "https://artificialanalysis.ai/models/x" })],
      orModels,
    );
    expect(t.unmatched_by_provider).toEqual([{ provider: "Unknown", count: 1 }]);
  });

  it("is report-only — never mutates the merged rows or OR models", () => {
    const rowsSnapshot = structuredClone(rows);
    const orSnapshot = structuredClone(orModels);
    buildOrOverlayTelemetry(rows, orModels);
    expect(rows).toEqual(rowsSnapshot);
    expect(orModels).toEqual(orSnapshot);
  });
});
