import { describe, expect, it } from "vitest";
import {
  CLOUD_LABS,
  FAMILY_OPENNESS_EXCEPTIONS,
  HELD_LABS_FOR_LATER,
  LAB_OPENNESS_CLASS,
  labOpennessClass,
  opennessForLab,
} from "../src/data/catalog-scope";
import { applyCuratedOpenness } from "../scripts/lib/catalog-join.mjs";
import { normalizeFamily } from "../src/lib/family-effort.shared";
import { validateModels, type Model } from "../src/data/models";
import draftRows from "../data/models.v0.draft.json";

/**
 * W1 truth-source openness (ticket #188, plan data-stewardship-v2).
 *
 * Fixtures are GENERATED from the curated map — assertions iterate
 * LAB_OPENNESS_CLASS / FAMILY_OPENNESS_EXCEPTIONS instead of hardcoding lab
 * lists, so adding a lab to the map automatically extends coverage. Only a
 * couple of named spot checks pin real-world rows.
 */

/** One synthetic row per map lab (generated fixture — no hardcoded lab list). */
function rowsFromMap(): {
  provider: string;
  family_id: string;
  model: string;
  openness: string;
}[] {
  return Object.keys(LAB_OPENNESS_CLASS).map((lab) => ({
    provider: lab,
    family_id: `${lab} Fixture Model 1`,
    model: `${lab} Fixture Model 1`,
    openness: "closed", // pre-overlay value: prove the map decides, not the input
  }));
}

/** Any lab whose class disagrees with `expected` — found, not hardcoded. */
function labWithDisagreeingClass(expected: "open" | "closed"): string | null {
  for (const [lab, cls] of Object.entries(LAB_OPENNESS_CLASS)) {
    const resolvesOpen = cls === "open";
    if (resolvesOpen !== (expected === "open")) return lab;
  }
  return null;
}

describe("W1 curated lab-class map — vocabulary lint", () => {
  const draftProviders = [
    ...new Set((draftRows as { provider: string }[]).map((r) => r.provider)),
  ].sort();

  it("covers every provider appearing in the built draft", () => {
    const missing = draftProviders.filter((p) => !(p in LAB_OPENNESS_CLASS));
    expect(
      missing,
      `draft providers missing from LAB_OPENNESS_CLASS: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("covers the full scope vocabulary (CLOUD_LABS ∪ HELD_LABS_FOR_LATER) and nothing else", () => {
    const vocabulary = new Set<string>([...CLOUD_LABS, ...HELD_LABS_FOR_LATER]);
    const missing = [...vocabulary].filter((p) => !(p in LAB_OPENNESS_CLASS));
    const unknown = Object.keys(LAB_OPENNESS_CLASS).filter((p) => !vocabulary.has(p));
    expect({ missing, unknown }).toEqual({ missing: [], unknown: [] });
  });

  it("unknown labs resolve closed (honest default)", () => {
    expect(labOpennessClass("Lab Nobody Curated")).toBe("closed");
    expect(opennessForLab("Lab Nobody Curated", "Whatever 1")).toBe("closed");
  });
});

describe("W1 opennessForLab — class inheritance generated from the map", () => {
  it.each(Object.entries(LAB_OPENNESS_CLASS))(
    "lab %s (class %s) resolves its class; mixed defaults closed",
    (lab, cls) => {
      expect(opennessForLab(lab, `${lab} Some Family 2`)).toBe(
        cls === "open" ? "open" : "closed",
      );
    },
  );

  it("every mixed class resolves closed by default (generated from map)", () => {
    const mixedLabs = Object.entries(LAB_OPENNESS_CLASS)
      .filter(([, cls]) => cls === "mixed")
      .map(([lab]) => lab);
    expect(mixedLabs.length).toBeGreaterThan(0);
    for (const lab of mixedLabs) {
      expect(opennessForLab(lab, `${lab} Uncurated Family 7`)).toBe("closed");
    }
  });

  it("spot check: DeepSeek inherits open, OpenAI inherits closed", () => {
    expect(opennessForLab("DeepSeek", "DeepSeek V5")).toBe("open");
    expect(opennessForLab("OpenAI", "GPT-5.6 Sol")).toBe("closed");
  });
});

describe("W1 per-family exception list", () => {
  it.each(Object.entries(FAMILY_OPENNESS_EXCEPTIONS))(
    "exception %s → %s overrides a disagreeing lab class",
    (famKey, expected) => {
      const lab = labWithDisagreeingClass(expected);
      expect(lab, `no lab with a disagreeing class for ${famKey}`).not.toBeNull();
      // The exception must win over the lab class the lab would otherwise get.
      expect(opennessForLab(lab as string, famKey)).toBe(expected);
      // …while a sibling family of the same lab still resolves the class.
      expect(opennessForLab(lab as string, `${famKey}-other-family`)).not.toBe(expected);
    },
  );

  it("exception lookup normalizes display names (effort suffixes stripped)", () => {
    expect(opennessForLab("OpenAI", "gpt-oss-120b (high)")).toBe("open");
    expect(opennessForLab("Z AI", "GLM-5.3 (max)")).toBe("closed");
  });

  it("spot check: the gpt-oss exception exists inside the closed OpenAI lab", () => {
    expect(labOpennessClass("OpenAI")).toBe("closed");
    expect(FAMILY_OPENNESS_EXCEPTIONS["gpt-oss-20b"]).toBe("open");
    expect(opennessForLab("OpenAI", "gpt-oss-20b")).toBe("open");
  });
});

describe("W1 applyCuratedOpenness overlay (build-time)", () => {
  it("stamps every non-null openness { origin: curated, kind: list }", () => {
    const { rows, stamped } = applyCuratedOpenness(rowsFromMap());
    expect(stamped).toBe(rows.length);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.sources.openness).toEqual({ origin: "curated", kind: "list" });
    }
  });

  it("resolves every generated row to its map truth and counts flips honestly", () => {
    const expectedFlips = Object.entries(LAB_OPENNESS_CLASS).filter(
      ([, cls]) => cls === "open",
    ).length; // generated rows start closed → exactly the open-class labs flip
    const { rows, flips } = applyCuratedOpenness(rowsFromMap());
    expect(flips).toBe(expectedFlips);
    for (const row of rows) {
      const cls = LAB_OPENNESS_CLASS[row.provider];
      expect(row.openness).toBe(cls === "open" ? "open" : "closed");
    }
  });

  it("manual-row value wins while the row is alive", () => {
    const manualRow = {
      provider: "Anthropic",
      family_id: "Claude Fable 5",
      model: "Claude Fable 5",
      openness: "open", // differs from the lab class (closed) AND any exception
    };
    const alive = applyCuratedOpenness([manualRow], [manualRow]);
    expect(alive.rows[0].openness).toBe("open"); // manual value wins
    expect(alive.flips).toBe(0);
    expect(alive.rows[0].sources.openness).toEqual({ origin: "curated", kind: "list" });
  });

  it("exception survives manual-row supersede (simulated AA family publication)", () => {
    // Stage 1 — manual GLM-5.3 row alive: its explicit closed value wins.
    const manualGlm = {
      provider: "Z AI",
      family_id: "GLM-5.3",
      model: "GLM-5.3 (max)",
      openness: "closed",
    };
    const alive = applyCuratedOpenness([manualGlm], [manualGlm]);
    expect(alive.rows[0].openness).toBe("closed");

    // Stage 2 — AA publishes the family: the manual row is superseded
    // (loadManualAdditions drops it upstream, so manualRows is empty). The
    // per-family exception — not the open Z AI lab class — decides.
    const aaGlm = {
      provider: "Z AI",
      family_id: "GLM-5.3",
      model: "GLM-5.3 (max)",
      openness: "open", // whatever the retired mapper default guessed
    };
    const superseded = applyCuratedOpenness([aaGlm], []);
    expect(superseded.rows[0].openness).toBe("closed"); // exception survives
    expect(FAMILY_OPENNESS_EXCEPTIONS[normalizeFamily("GLM-5.3")]).toBe("closed");

    // Contrast — a Z AI family without an exception resolves the open class.
    expect(opennessForLab("Z AI", "GLM-5.2")).toBe("open");
  });

  it("family exceptions apply to overlay rows inside mixed labs (generated)", () => {
    const mixedLabs = Object.entries(LAB_OPENNESS_CLASS)
      .filter(([, cls]) => cls === "mixed")
      .map(([lab]) => lab);
    expect(mixedLabs.length).toBeGreaterThan(0);
    const rows = mixedLabs.map((lab) => ({
      provider: lab,
      family_id: "Mistral Small 3", // an exception family inside a mixed lab
      model: "Mistral Small 3",
      openness: "closed",
    }));
    const { rows: out } = applyCuratedOpenness(rows, []);
    for (const row of out) {
      expect(row.openness).toBe("open"); // exception beats mixed→closed default
    }
  });
});

describe("W1 provenance plumbing", () => {
  const prices = { price_in_per_M: 1, price_out_per_M: 2, blended_price_per_M: 1.7 };
  const base: Model = {
    model: "fixture",
    provider: "fixture",
    openness: "closed",
    modality: ["text"],
    context_length: 128_000,
    release_date: "2026-01-01",
    source_url: "https://example.test",
    tps: 100,
    ttft: 100,
    ...prices,
    aa_intelligence_index: 80,
    arena_elo: null,
    gpqa: null,
    swe_bench: null,
    aider_pct: null,
    data_date: "2026-01-01",
    source: "fixture",
  };

  it("validator accepts sources.openness with origin curated", () => {
    expect(() =>
      validateModels([
        {
          ...base,
          sources: { openness: { origin: "curated", kind: "list" } },
        },
      ]),
    ).not.toThrow();
  });
});
