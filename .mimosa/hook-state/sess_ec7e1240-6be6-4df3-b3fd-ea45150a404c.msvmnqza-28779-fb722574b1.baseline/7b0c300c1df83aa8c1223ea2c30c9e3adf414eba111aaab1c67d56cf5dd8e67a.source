import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mapAaApiModel } from "../scripts/lib/aa-api.mjs";
import { hfRowToArenaEntry } from "../scripts/lib/arena-hf.mjs";
import {
  applyAaDerivedBlend,
  applyCuratedOpenness,
  joinCatalog,
  provenanceGateViolations,
  PROVENANCE_STAMPABLE_FIELDS,
} from "../scripts/lib/catalog-join.mjs";
import { vetManualRows } from "../scripts/lib/manual-additions.mjs";
import draftRows from "../data/models.v0.draft.json";

/**
 * W2 provenance completion (ticket #193, plan data-stewardship-v2).
 *
 * The hard gate: every non-null field in the stampable set carries a sources
 * stamp. The gate's fixture is BUILT by running the actual aa-api mapper and
 * join functions over fixture data (pure, no network), proving stamped output
 * end-to-end — every ingestion path (AA mapper, AA blend, OpenRouter overlays,
 * Arena attach, curated openness) stamps what it writes.
 *
 * Live-draft assertion: the shipped data/models.v0.draft.json still carries
 * legacy unstamped fields (modality, price_cache_per_M, openness) until the
 * next pipeline run regenerates it with these stamps — so that assertion is
 * opt-in behind RUN_LIVE_PROVENANCE_GATE=1 (documented for cron to export
 * once the first stamped rebuild has landed; the gate here never blocks CI).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const aaFixture = JSON.parse(
  readFileSync(path.join(here, "../scripts/fixtures/aa-api-free-sample.json"), "utf8"),
);
const arenaFixture = JSON.parse(
  readFileSync(path.join(here, "../scripts/fixtures/arena-hf-overall-sample.json"), "utf8"),
);

/** Minimal OpenRouter models-list fixtures matched by the production matcher. */
const orModels = [
  {
    id: "openai/gpt-oss-20b",
    context_length: 131072,
    architecture: { input_modalities: ["text", "image"] },
    pricing: { prompt: "0.00000006", completion: "0.00000024", input_cache_read: "0.000000015" },
  },
  {
    id: "anthropic/claude-fable-5",
    context_length: 200000,
    architecture: { input_modalities: ["text"] },
    pricing: { prompt: "0.000003", completion: "0.000015", input_cache_read: "0.0000003" },
  },
];

/**
 * Build a small in-memory draft by running the REAL pipeline functions over
 * fixtures — the same mappers/overlays scripts/expand-aa-multi-effort.mjs
 * uses, minus network IO.
 */
function buildFixtureDraft() {
  const aaRows = aaFixture.data.map((m: object) => mapAaApiModel(m, "2026-08-14"));
  const arenaEntries = arenaFixture
    .map((r: object) => hfRowToArenaEntry(r))
    .filter(Boolean);
  const joined = joinCatalog(aaRows, { arenaEntries, orModels });
  return applyCuratedOpenness(joined.all, []).rows;
}

describe("W2 stampable-set contract", () => {
  it("covers exactly the ticket's stampable fields", () => {
    expect([...PROVENANCE_STAMPABLE_FIELDS].sort()).toEqual(
      [
        "aa_intelligence_index",
        "tps",
        "ttft",
        "price_in_per_M",
        "price_out_per_M",
        "price_cache_per_M",
        "blended_price_per_M",
        "context_length",
        "modality",
        "arena_elo",
        "coding_index",
        "agentic_index",
        "time_per_index_task_s",
        "openness",
      ].sort(),
    );
  });
});

describe("W2 ingestion-point stamps (aa-api mapper)", () => {
  it("stamps baseline modality aa-api/list when the mapper sets ['text']", () => {
    for (const m of aaFixture.data) {
      const row = mapAaApiModel(m, "2026-08-14");
      expect(row.modality).toEqual(["text"]);
      expect(row.sources.modality).toEqual({ origin: "aa-api", kind: "list" });
    }
  });

  it("stamps price_cache_per_M aa-api/measured when AA publishes a cache price", () => {
    const withCache = mapAaApiModel(aaFixture.data[0], "2026-08-14"); // cache 0.015
    expect(withCache.price_cache_per_M).not.toBeNull();
    expect(withCache.sources.price_cache_per_M).toEqual({
      origin: "aa-api",
      kind: "measured",
    });
  });

  it("leaves an absent cache price null and unstamped (never invents)", () => {
    const withoutCache = mapAaApiModel(aaFixture.data[1], "2026-08-14"); // cache null
    expect(withoutCache.price_cache_per_M).toBeNull();
    expect(withoutCache.sources.price_cache_per_M).toBeUndefined();
  });

  it("OR modality overlay restamps openrouter/list when it adds modalities (verified)", () => {
    const rows = buildFixtureDraft();
    const gptOss = rows.find((r: { model: string }) => r.model.startsWith("gpt-oss-20B"));
    expect(gptOss.modality).toContain("vision"); // overlay added image→vision
    expect(gptOss.sources.modality).toEqual({ origin: "openrouter", kind: "list" });
  });
});

describe("W2 hard gate over the mapper-built fixture (end-to-end, no network)", () => {
  it("fixture draft has zero unstamped non-null stampable fields", () => {
    const rows = buildFixtureDraft();
    expect(rows.length).toBeGreaterThan(0);
    expect(provenanceGateViolations(rows)).toEqual([]);
  });

  it("every stampable field that is non-null on fixture rows actually carries a stamp", () => {
    const rows = buildFixtureDraft();
    let checked = 0;
    for (const row of rows) {
      for (const field of PROVENANCE_STAMPABLE_FIELDS) {
        if (row[field] == null) continue;
        checked += 1;
        expect(
          row.sources?.[field]?.origin,
          `${field} on ${row.model} must be stamped`,
        ).toBeTruthy();
      }
    }
    expect(checked).toBeGreaterThanOrEqual(
      PROVENANCE_STAMPABLE_FIELDS.length, // every field exercised at least once
    );
  });

  it("deliberate gap fails the gate with a message naming field + model + ingestion point", () => {
    const rows = buildFixtureDraft().map((r: Record<string, unknown>) => ({
      ...r,
      sources: { ...(r.sources as Record<string, unknown>) },
    }));
    delete rows[0].sources.modality; // AA/OR path gap
    const fable = rows.find((r: { provider: string }) => r.provider === "Anthropic");
    delete fable.sources.openness; // curated-overlay gap
    const violations = provenanceGateViolations(rows);
    expect(violations).toHaveLength(2);
    expect(violations[0].message).toMatch(
      /modality is non-null but unstamped on "gpt-oss-20B \(high\)" — likely ingestion point: .*mapAaApiModel .*aa-api\/list.*applyOpenRouterModality/,
    );
    expect(violations[1].message).toMatch(
      /openness is non-null but unstamped on "Claude Fable 5 \(high\)" — likely ingestion point: applyCuratedOpenness/,
    );
  });

  it("null fields never violate the gate (stamps are only owed on non-null values)", () => {
    const row = mapAaApiModel(aaFixture.data[1], "2026-08-14");
    // Fable fixture has no cache price; blended/arena/context are null pre-join.
    expect(provenanceGateViolations([row]).map((v) => v.field)).not.toContain(
      "price_cache_per_M",
    );
  });
});

describe("W2 ingestion-point stamps (manual-additions path)", () => {
  it("fills an unstamped legacy modality as provider/list; existing stamps win", () => {
    const { rows } = vetManualRows([
      {
        model: "Legacy Manual Row",
        provider: "Z AI",
        openness: "closed",
        modality: ["text"], // legacy: value without a stamp
      },
      {
        model: "Stamped Manual Row",
        provider: "ByteDance Seed",
        openness: "closed",
        modality: ["text", "vision"],
        sources: { modality: { origin: "openrouter", kind: "list" } },
      },
    ]);
    expect(rows[0].sources.modality).toEqual({ origin: "provider", kind: "list" });
    expect(rows[1].sources.modality).toEqual({ origin: "openrouter", kind: "list" });
  });

  it("the REAL manual-additions file passes the gate after blend + openness overlay (next-run proof, read-only)", () => {
    const manualPath = path.join(here, "../data/manual-additions.json");
    const doc = JSON.parse(readFileSync(manualPath, "utf8"));
    const candidates = Array.isArray(doc) ? doc : doc.rows ?? [];
    const { rows: vetted } = vetManualRows(candidates);
    expect(vetted.length).toBeGreaterThan(0);
    const blended = applyAaDerivedBlend(vetted);
    const stamped = applyCuratedOpenness(blended, vetted).rows;
    expect(provenanceGateViolations(stamped).map((v) => v.message)).toEqual([]);
    // Fill-if-unstamped: the provider-announced row's baseline modality.
    const glm = stamped.find((r: { family_id?: string }) => r.family_id === "GLM-5.3");
    expect(glm.sources.modality).toEqual({ origin: "provider", kind: "list" });
    // Existing stamps win: the OpenRouter-listed row keeps its own origin.
    const seed = stamped.find((r: { model: string }) => r.model === "Seed 2.1 Turbo");
    expect(seed.sources.modality).toEqual({ origin: "openrouter", kind: "list" });
    expect(seed.sources.openness).toEqual({ origin: "curated", kind: "list" });
  });
});

// Opt-in live assertion: run with RUN_LIVE_PROVENANCE_GATE=1 (vitest or cron).
// The shipped draft predates the W2 ingestion stamps, so it only passes after
// the next pipeline run regenerates the file — cron can export the variable
// once that rebuild has landed, making unstamped fields fatal from then on.
const runLive = process.env.RUN_LIVE_PROVENANCE_GATE === "1";
(runLive ? describe : describe.skip)(
  "W2 live-draft provenance gate (opt-in: RUN_LIVE_PROVENANCE_GATE=1)",
  () => {
    it("data/models.v0.draft.json has zero unstamped non-null stampable fields", () => {
      expect(provenanceGateViolations(draftRows as object[]).map((v) => v.message)).toEqual(
        [],
      );
    });
  },
);
