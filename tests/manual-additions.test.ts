import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  vetManualRows,
  splitSupersededManualRows,
  selectManualAdmissions,
  loadManualAdditions,
} from "../scripts/lib/manual-additions.mjs";
import { applyAaDerivedBlend, spineKey } from "../scripts/lib/catalog-join.mjs";
import { validateModels, type Model } from "../src/data/models";
import manualDoc from "../data/manual-additions.json";

const glm53Manual = {
  model: "GLM-5.3 (max)",
  provider: "Z AI",
  openness: "closed",
  modality: ["text"],
  reasoning: true,
  family_id: "GLM-5.3",
  effort_tier: "max",
  context_length: null,
  release_date: "2026-08-14",
  source_url: "https://z.ai/blog/glm-5.3",
  tps: 115,
  ttft: null,
  price_in_per_M: null,
  price_out_per_M: null,
  blended_price_per_M: null,
  aa_intelligence_index: null,
  arena_elo: null,
  gpqa: null,
  swe_bench: null,
  aider_pct: null,
  data_date: "2026-08-14",
  source: "Z.ai announcement 2026-08-14 (manual addition)",
  null_reason: "not_measured",
  sources: { tps: { origin: "provider", kind: "measured" } },
};

describe("manual additions — vetting", () => {
  it("accepts a valid provider-announced row", () => {
    const { rows, rejected } = vetManualRows([glm53Manual]);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe("GLM-5.3 (max)");
  });

  it("rejects rows carrying AA-only fields (Intelligence Index / TTFT)", () => {
    const { rows, rejected } = vetManualRows([
      { ...glm53Manual, aa_intelligence_index: 61 },
      { ...glm53Manual, ttft: 900 },
    ]);
    expect(rows).toHaveLength(0);
    expect(rejected.map((r) => r.reason)).toEqual([
      "aa_only_field_present:aa_intelligence_index",
      "aa_only_field_present:ttft",
    ]);
  });

  it("rejects rows missing model or provider", () => {
    const { rejected } = vetManualRows([{ provider: "Z AI" }, { model: "X" }]);
    expect(rejected).toHaveLength(2);
  });
});

describe("manual additions — AA supersede", () => {
  it("drops a manual row once any AA row shares its normalized family", () => {
    const aaRows = [
      {
        model: "GLM-5.3 (max)",
        provider: "Z AI",
        family_id: "GLM-5.3",
        source_url: "https://artificialanalysis.ai/models/glm-5-3",
      },
    ];
    const { active, superseded } = splitSupersededManualRows([glm53Manual], aaRows);
    expect(active).toHaveLength(0);
    expect(superseded).toHaveLength(1);
  });

  it("keeps the manual row while AA has only measured older families", () => {
    const aaRows = [
      {
        model: "GLM-5.2 (max)",
        provider: "Z AI",
        family_id: "GLM-5.2",
        source_url: "https://artificialanalysis.ai/models/glm-5-2",
      },
    ];
    const { active } = splitSupersededManualRows([glm53Manual], aaRows);
    expect(active).toHaveLength(1);
  });
});

describe("manual additions — admission dedupe", () => {
  it("admits manual rows when no scorable row shares their spine", () => {
    const admitted = selectManualAdmissions([glm53Manual], [], { spineKeyOf: spineKey });
    expect(admitted).toHaveLength(1);
  });

  it("skips manual rows whose spine is already admitted (overlay completed the triple)", () => {
    const completed = {
      ...glm53Manual,
      aa_intelligence_index: 61,
      blended_price_per_M: 1,
    };
    const admitted = selectManualAdmissions([completed], [completed], {
      spineKeyOf: spineKey,
    });
    expect(admitted).toHaveLength(0);
  });

  it("respects the user-selectable tier filter", () => {
    const admitted = selectManualAdmissions([glm53Manual], [], {
      spineKeyOf: spineKey,
      isUserSelectable: () => false,
    });
    expect(admitted).toHaveLength(0);
  });
});

describe("manual additions — curated file regression", () => {
  const rows = (manualDoc as { rows: unknown[] }).rows;

  it("the tracked GLM-5.3 row vets clean and passes dataset validation", () => {
    const vetted = vetManualRows(rows);
    expect(vetted.rejected).toHaveLength(0);
    expect(vetted.rows.length).toBeGreaterThanOrEqual(1);
    expect(() => validateModels(vetted.rows as unknown as Model[])).not.toThrow();
  });

  it("loadManualAdditions reads the file and applies AA supersede", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "manual-add-"));
    const file = path.join(dir, "manual-additions.json");
    writeFileSync(file, JSON.stringify(manualDoc));
    try {
      const fresh = loadManualAdditions(file, []);
      expect(fresh.active.length).toBeGreaterThanOrEqual(1);
      const supersededRun = loadManualAdditions(file, [
        { model: "GLM-5.3 (max)", provider: "Z AI", family_id: "GLM-5.3" },
      ]);
      expect(
        supersededRun.active.filter((r) => r.family_id === "GLM-5.3"),
      ).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("AA-derived blend — C1 cache sentinel (datagaps 2026-08-14)", () => {
  const dsRow = (extra: Record<string, unknown>) => ({
    model: "DeepSeek V4 Flash 0731 (Reasoning)",
    provider: "DeepSeek",
    openness: "open",
    modality: ["text"],
    release_date: "2026-07-31",
    source_url: "https://artificialanalysis.ai/models/deepseek-v4-flash-0731",
    tps: 100,
    ttft: null,
    aa_intelligence_index: 50,
    data_date: "2026-08-14",
    price_in_per_M: 0.28,
    price_out_per_M: 0.42,
    ...extra,
  });

  it("cache=0 falls back to input price — never understates blended cost", () => {
    const out = applyAaDerivedBlend([dsRow({ price_cache_per_M: 0 })]);
    expect(out[0].blended_price_per_M).toBeCloseTo(
      (0.28 * 7 + 0.28 * 2 + 0.42) / 10,
      5,
    );
  });

  it("positive cache price is used in the 7:2:1 blend", () => {
    const out = applyAaDerivedBlend([dsRow({ price_cache_per_M: 0.028 })]);
    expect(out[0].blended_price_per_M).toBeCloseTo(
      (0.028 * 7 + 0.28 * 2 + 0.42) / 10,
      5,
    );
  });

  it("absent cache keeps the conservative input-price fallback", () => {
    const out = applyAaDerivedBlend([dsRow({})]);
    expect(out[0].blended_price_per_M).toBeCloseTo(
      (0.28 * 7 + 0.28 * 2 + 0.42) / 10,
      5,
    );
  });

  it("negative cache price falls back instead of rejecting the whole row", () => {
    const out = applyAaDerivedBlend([dsRow({ price_cache_per_M: -0.1 })]);
    expect(out[0].blended_price_per_M).toBeCloseTo(
      (0.28 * 7 + 0.28 * 2 + 0.42) / 10,
      5,
    );
  });
});
