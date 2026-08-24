import { describe, expect, it } from "vitest";
import {
  parseFamilyLineGen,
  meetsGenerationDepth,
  GENERATION_DEPTH,
  LAB_OPENNESS_CLASS,
} from "../src/data/catalog-scope";

describe("parseFamilyLineGen (D-H4)", () => {
  it("splits vendor line + generation", () => {
    expect(parseFamilyLineGen("GPT-5.6 Sol")).toEqual({ line: "gpt", generation: 5.6 });
    expect(parseFamilyLineGen("Claude Opus 5")).toEqual({ line: "claude-opus", generation: 5 });
    expect(parseFamilyLineGen("DeepSeek V4 Flash 0731")).toEqual({ line: "deepseek-flash", generation: 4 });
    expect(parseFamilyLineGen("Grok 4.20 0309 v2")).toEqual({ line: "grok", generation: 4.2 });
  });

  it("edition word after the version splits the product line", () => {
    expect(parseFamilyLineGen("Gemini 3.7 Flash").line).toBe("gemini-flash");
    expect(parseFamilyLineGen("Gemini 3.1 Pro Preview").line).toBe("gemini-pro");
    expect(parseFamilyLineGen("GPT-5.4 mini")).toEqual({ line: "gpt-mini", generation: 5.4 });
    expect(parseFamilyLineGen("Qwen3 Coder Next")).toEqual({ line: "qwen-coder", generation: 3 });
  });

  it("versionless families are their own line with null generation", () => {
    expect(parseFamilyLineGen("Muse Glimmer")).toEqual({ line: "muse-glimmer", generation: null });
  });
});

describe("meetsGenerationDepth (D-H4: newest + previous per product line)", () => {
  const row = (family: string, model = family) => ({
    provider: "OpenAI",
    family_id: family,
    model,
    release_date: "2026-01-01",
  });

  it("keeps the two newest generations of a line, drops older (GPT case)", () => {
    const rows = [
      row("GPT-5.6 Sol"),
      row("GPT-5.5"),
      row("GPT-5.4"),
      row("GPT-5.3 Codex"),
    ].map((r) => ({ ...r, model: r.family_id }));
    const keep = meetsGenerationDepth(rows);
    expect(keep.has(rows[0])).toBe(true); // 5.6
    expect(keep.has(rows[1])).toBe(true); // 5.5
    expect(keep.has(rows[2])).toBe(false); // 5.4 dropped
    expect(keep.has(rows[3])).toBe(false); // 5.3 dropped
  });

  it("an edition line survives while its older sibling-generation main line drops", () => {
    const rows = [
      { provider: "OpenAI", family_id: "GPT-5.6 Sol", model: "GPT-5.6 Sol", release_date: "2026-01-01" },
      { provider: "OpenAI", family_id: "GPT-5.5", model: "GPT-5.5", release_date: "2026-01-01" },
      { provider: "OpenAI", family_id: "GPT-5.4 mini", model: "GPT-5.4 mini", release_date: "2026-01-01" },
    ];
    const keep = meetsGenerationDepth(rows);
    expect(keep.has(rows[2])).toBe(true); // no newer mini exists
  });

  it("closed-API lifecycle caps: K-line analog keeps newest+previous (OpenAI-shaped)", () => {
    const rows = ["Fam K3", "Fam K2.7 Code", "Fam K2.6", "Fam K2.5"].map((f) => ({
      provider: "OpenAI", // closed-API lab → generation cap applies
      family_id: f,
      model: f,
      release_date: "2026-01-01",
    }));
    const keep = meetsGenerationDepth(rows);
    expect(keep.has(rows[0])).toBe(true);
    expect(keep.has(rows[1])).toBe(true);
    expect(keep.has(rows[2])).toBe(false);
    expect(keep.has(rows[3])).toBe(false);
  });

  it("open-weight labs bypass the generation cap (local lifecycle lasts longer)", () => {
    const rows = ["Kimi K3", "Kimi K2.7 Code", "Kimi K2.6", "Kimi K2.5", "Qwen3.5 27B"].map((f) => ({
      provider: "Kimi",
      family_id: f,
      model: f,
      release_date: "2026-01-01",
    }));
    const keep = meetsGenerationDepth(rows);
    expect(keep.size).toBe(rows.length); // all pass uncapped
  });

  it("versionless rows always pass; depth respects custom values", () => {
    const rows = [
      { provider: "Meta", family_id: "Muse Glimmer", model: "Muse Glimmer (high)", release_date: "2026-01-01" },
      { provider: "X", family_id: "M 1", model: "M 1", release_date: "2026-01-01" },
      { provider: "X", family_id: "M 2", model: "M 2", release_date: "2026-01-01" },
      { provider: "X", family_id: "M 3", model: "M 3", release_date: "2026-01-01" },
    ];
    expect(meetsGenerationDepth(rows).size).toBe(3); // versionless + top-2
    expect(meetsGenerationDepth(rows, 1).size).toBe(2); // versionless + newest only
  });

  it("lines are provider-scoped (same line name across providers never competes)", () => {
    const rows = [
      { provider: "A", family_id: "Fam 1", model: "Fam 1 (A)", release_date: "2026-01-01" },
      { provider: "B", family_id: "Fam 9", model: "Fam 9 (B)", release_date: "2026-01-01" },
      { provider: "B", family_id: "Fam 8", model: "Fam 8 (B)", release_date: "2026-01-01" },
      { provider: "B", family_id: "Fam 7", model: "Fam 7 (B)", release_date: "2026-01-01" },
    ];
    const keep = meetsGenerationDepth(rows);
    expect(keep.has(rows[0])).toBe(true);
    expect(keep.has(rows[3])).toBe(false);
  });

  it("GENERATION_DEPTH is newest + previous", () => {
    expect(GENERATION_DEPTH).toBe(2);
  });
});

describe("D-H4 exemption derives from the W1 truth map (ticket #188 regression)", () => {
  /** Three generations of one line under `provider` — newest two survive a cap. */
  const genRows = (provider: string) =>
    ["Fam 3", "Fam 2.7", "Fam 2.6"].map((f, i) => ({
      provider,
      family_id: f,
      model: `${provider} ${f} ${i}`,
      release_date: "2026-01-01",
    }));

  // Generated from the map — no hardcoded lab list; adding a lab extends this.
  it.each(Object.entries(LAB_OPENNESS_CLASS))(
    "lab %s (class %s): open class bypasses the cap, mixed/closed cap",
    (lab, cls) => {
      const rows = genRows(lab);
      const keep = meetsGenerationDepth(rows);
      if (cls === "open") {
        expect(keep.size).toBe(rows.length); // local lifecycle: uncapped
      } else {
        expect(keep.has(rows[0])).toBe(true); // newest
        expect(keep.has(rows[1])).toBe(true); // previous
        expect(keep.has(rows[2])).toBe(false); // capped
      }
    },
  );

  it("exemption set is exactly the map's open classes — identical to the retired OPEN_WEIGHT_LABS (spot check)", () => {
    const openLabs = Object.entries(LAB_OPENNESS_CLASS)
      .filter(([, cls]) => cls === "open")
      .map(([lab]) => lab)
      .sort();
    // The retired OPEN_WEIGHT_LABS list, pinned once so the derivation cannot
    // drift. DeepReinforce AI added 2026-08-24 (Ornith, MIT self-hosted).
    expect(openLabs).toEqual(
      ["Alibaba", "DeepReinforce AI", "DeepSeek", "Kimi", "Meta", "MiniMax", "NVIDIA", "Z AI"].sort(),
    );
  });
});
