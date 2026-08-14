import { describe, expect, it } from "vitest";
import {
  buildAwaitingMeasurement,
  buildHiddenByScope,
  buildNonUserTierDrops,
} from "../scripts/lib/annex-report.mjs";

/**
 * WS3 annex fixtures — report-only visibility over the pre-admission pool.
 * Triple completeness mirrors canAdmitPlotTriple semantics.
 */
function aaRow(p: Record<string, unknown>) {
  return {
    model: "",
    family_id: "",
    provider: "",
    release_date: "2026-01-01",
    effort_tier: "none",
    source_url: "",
    aa_intelligence_index: null,
    tps: null,
    blended_price_per_M: null,
    ...p,
  };
}

const awaitingFixture = [
  aaRow({
    model: "Model A (max)",
    family_id: "Model A",
    provider: "Anthropic",
    release_date: "2026-02-01",
    effort_tier: "max",
    source_url: "https://artificialanalysis.ai/models/model-a",
    aa_intelligence_index: 60,
    tps: 100,
    blended_price_per_M: 3,
  }),
  aaRow({
    model: "Model B",
    family_id: "Model B",
    provider: "Google",
    release_date: "2026-01-15",
    effort_tier: "high",
    source_url: "https://artificialanalysis.ai/models/model-b",
    aa_intelligence_index: 55,
    tps: null,
    blended_price_per_M: 2,
  }),
  aaRow({
    model: "Model C",
    family_id: "Model C",
    provider: "DeepSeek",
    release_date: "2026-03-01",
    source_url: "https://artificialanalysis.ai/models/model-c",
    aa_intelligence_index: null,
    tps: 120,
    blended_price_per_M: 0.5,
  }),
  aaRow({
    model: "Model D",
    family_id: "Model D",
    provider: "Kimi",
    release_date: "2026-04-01",
    source_url: "https://artificialanalysis.ai/models/model-d",
    aa_intelligence_index: 50,
    tps: 90,
    blended_price_per_M: null,
  }),
  // Only one element present — not an awaiting-measurement row (needs exactly 2/3).
  aaRow({
    model: "Model E",
    family_id: "Model E",
    provider: "Mistral",
    release_date: "2026-05-01",
    source_url: "https://artificialanalysis.ai/models/model-e",
    aa_intelligence_index: 40,
  }),
];

const admittedFixture = [awaitingFixture[0]];

describe("awaiting_measurement annex (WS3, H1)", () => {
  it("buckets rows with exactly two of three triple elements by missing axis", () => {
    const annex = buildAwaitingMeasurement(awaitingFixture, admittedFixture);
    expect(annex.missing_tps.count).toBe(1);
    expect(annex.missing_iq.count).toBe(1);
    expect(annex.missing_price.count).toBe(1);
    expect(annex.missing_tps.entries[0]).toEqual({
      family_id: "Model B",
      model: "Model B",
      provider: "Google",
      release_date: "2026-01-15",
      missing_axis: "tps",
      source_url_slug: "model-b",
    });
    expect(annex.missing_iq.entries[0].model).toBe("Model C");
    expect(annex.missing_price.entries[0].model).toBe("Model D");
  });

  it("never lists admitted rows and skips rows without exactly 2/3 elements", () => {
    const annex = buildAwaitingMeasurement(awaitingFixture, admittedFixture);
    const allEntries = [
      ...annex.missing_tps.entries,
      ...annex.missing_iq.entries,
      ...annex.missing_price.entries,
    ];
    expect(allEntries.map((e) => e.model)).not.toContain("Model A (max)");
    expect(allEntries.map((e) => e.model)).not.toContain("Model E");
    expect(allEntries).toHaveLength(3);
  });

  it("caps stored entries per bucket and flags the cap", () => {
    const rows = [1, 2, 3].map((n) =>
      aaRow({
        model: `No-Tps ${n}`,
        family_id: `No-Tps ${n}`,
        provider: "OpenAI",
        source_url: `https://artificialanalysis.ai/models/no-tps-${n}`,
        aa_intelligence_index: 50,
        tps: null,
        blended_price_per_M: 1,
      }),
    );
    const annex = buildAwaitingMeasurement(rows, [], { cap: 2 });
    expect(annex.missing_tps.count).toBe(3);
    expect(annex.missing_tps.capped).toBe(true);
    expect(annex.missing_tps.entries).toHaveLength(2);
    expect(annex.entry_cap).toBe(2);
    expect(annex.note).toMatch(/capped/i);
  });

  it("is report-only — inputs (admitted rows included) are never mutated", () => {
    const mergedSnapshot = structuredClone(awaitingFixture);
    const admittedSnapshot = structuredClone(admittedFixture);
    buildAwaitingMeasurement(awaitingFixture, admittedFixture);
    expect(awaitingFixture).toEqual(mergedSnapshot);
    expect(admittedFixture).toEqual(admittedSnapshot);
  });
});

describe("non_user_tier_drops (WS3, audit M5)", () => {
  const triple = { aa_intelligence_index: 70, tps: 80, blended_price_per_M: 5 };
  const rows = [
    aaRow({ model: "GPT-5.6 Sol (Max)", provider: "OpenAI", effort_tier: "Max", ...triple }),
    aaRow({ model: "GPT-5.6 Luna (max)", provider: "OpenAI", effort_tier: "max", ...triple }),
    aaRow({ model: "GPT-5.6 Terra (max)", provider: "OpenAI", effort_tier: "max", ...triple }),
    aaRow({ model: "GPT-5.6 Sol (high)", provider: "OpenAI", effort_tier: "high", ...triple }),
    aaRow({ model: "Other (max)", provider: "Anthropic", effort_tier: "max", ...triple }),
    aaRow({ model: "GPT-5.6 Ghost (max)", provider: "OpenAI", effort_tier: "max", ...triple, tps: null }),
  ];

  it("names exactly the complete-triple rows on a dropped provider tier", () => {
    const drops = buildNonUserTierDrops(rows, { OpenAI: ["max"] });
    expect(drops.count).toBe(3);
    expect(drops.entries.map((e) => e.model).sort()).toEqual([
      "GPT-5.6 Luna (max)",
      "GPT-5.6 Sol (Max)",
      "GPT-5.6 Terra (max)",
    ]);
    for (const e of drops.entries) {
      expect(e.provider).toBe("OpenAI");
      expect(String(e.effort_tier).toLowerCase()).toBe("max");
    }
  });

  it("ignores other providers and incomplete rows", () => {
    const drops = buildNonUserTierDrops(rows, { OpenAI: ["max"] });
    expect(drops.entries.map((e) => e.model)).not.toContain("Other (max)");
    expect(drops.entries.map((e) => e.model)).not.toContain("GPT-5.6 Ghost (max)");
  });
});

describe("hidden_by_scope report (WS3, H4 visibility half)", () => {
  const cloud = ["OpenAI", "Anthropic", "DeepSeek"];
  const draftFixture = [
    aaRow({ model: "Old Cloud (2025-06)", provider: "Anthropic", release_date: "2025-06-15" }),
    aaRow({ model: "Recent Cloud (2025-10)", provider: "DeepSeek", release_date: "2025-10-01" }),
    aaRow({ model: "Old Held (2025-11)", provider: "Mistral", release_date: "2025-11-01" }),
    aaRow({ model: "Visible Cloud (2026)", provider: "OpenAI", release_date: "2026-02-01" }),
    aaRow({ model: "Held 2026 (Mistral)", provider: "Mistral", release_date: "2026-03-01" }),
    aaRow({ model: "Unlisted 2026 (Seed)", provider: "ByteDance Seed", release_date: "2026-08-12" }),
  ];

  it("buckets floor-hidden and held rows with exact math", () => {
    const report = buildHiddenByScope(draftFixture, cloud);
    expect(report.a1_floor_hidden_all_labs.count).toBe(3); // pre-floor, all labs
    expect(report.a2_floor_hidden_cloud_labs.count).toBe(2); // a1 ∩ cloud
    expect(report.a3_floor_hidden_cloud_since_recent.count).toBe(1); // a2 ∩ ≥2025-09
    expect(report.b_held_2026_rows.count).toBe(2); // ≥floor AND not in CLOUD_LABS
    expect(report.a1_floor_hidden_all_labs.notable_names).toEqual([
      "Old Cloud (2025-06) (Anthropic)",
      "Old Held (2025-11) (Mistral)",
      "Recent Cloud (2025-10) (DeepSeek)",
    ]);
    expect(report.b_held_2026_rows.notable_names).toEqual([
      "Held 2026 (Mistral) (Mistral)",
      "Unlisted 2026 (Seed) (ByteDance Seed)",
    ]);
  });

  it("held semantics = not-in-CLOUD_LABS, so unlisted providers count (Rev 3)", () => {
    const report = buildHiddenByScope(draftFixture, cloud);
    expect(
      report.b_held_2026_rows.notable_names.some((n) => n.includes("ByteDance Seed")),
    ).toBe(true);
  });

  it("caps the notable-names list", () => {
    const report = buildHiddenByScope(draftFixture, cloud, { notableCap: 1 });
    expect(report.a1_floor_hidden_all_labs.notable_names).toHaveLength(1);
    expect(report.a1_floor_hidden_all_labs.count).toBe(3);
  });

  it("is report-only — no draft rows added, no input mutation, no row objects emitted", () => {
    const snapshot = structuredClone(draftFixture);
    const report = buildHiddenByScope(draftFixture, cloud);
    expect(draftFixture).toEqual(snapshot);
    expect(draftFixture).toHaveLength(6);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/"tps"|"blended_price_per_M"/); // counts + names only
  });
});
