import { describe, expect, it } from "vitest";
import { createStore } from "../src/state";
import {
  emptyProposal,
  isLowImpactProposal,
  shouldAutoApplyProposal,
  proposalToStorePatch,
  validateProposal,
} from "../src/lib/atlas-agent";
import { runOfflineAtlas } from "../src/lib/atlas-agent/offline-router";
import type { AtlasAgentContext } from "../src/lib/atlas-agent/types";
import type { Model } from "../src/data/models";
import { DEFAULT_FILTERS } from "../src/lib/filters";

function m(name: string, iq: number | null): Model {
  return {
    model: name,
    provider: "Test",
    openness: "closed",
    modality: ["text"],
    context_length: 128000,
    release_date: "2026-06-01",
    source_url: "https://example.test",
    tps: 100,
    ttft: 100,
    price_in_per_M: 1,
    price_out_per_M: 1,
    blended_price_per_M: 1,
    aa_intelligence_index: iq,
    arena_elo: null,
    gpqa: null,
    swe_bench: null,
    aider_pct: null,
    data_date: "2026-08-01",
    source: "test",
    reasoning: true,
  };
}

const catalog = [m("Alpha", 55), m("Beta", 40)];

function ctx(): AtlasAgentContext {
  return {
    catalog,
    visible: catalog,
    floor: 50,
    costSpeedBias: 0,
    catalogSnapshotId: "t",
    filters: { ...DEFAULT_FILTERS },
  };
}

describe("full-app atlas apply", () => {
  it("maps cinema + pin to store patch", () => {
    const p = emptyProposal("t", "Focus Alpha in cinema.", {
      cinema_mode: true,
      pinned_model_id: "Alpha",
      needs_confirm: false,
      auto_apply: true,
    });
    expect(validateProposal(p)).toBe(true);
    expect(isLowImpactProposal(p)).toBe(true);
    const { patch, appliedKeys } = proposalToStorePatch(p, DEFAULT_FILTERS);
    expect(patch.cinemaMode).toBe(true);
    expect(patch.pinnedModelId).toBe("Alpha");
    expect(appliedKeys).toContain("cinemaMode");
  });

  it("offline cinema on auto-applies style proposal", () => {
    const p = runOfflineAtlas("cinema on", ctx());
    expect(p.cinema_mode).toBe(true);
    expect(p.auto_apply).toBe(true);
    expect(p.needs_confirm).toBe(false);
  });

  it("offline pin focuses model", () => {
    const p = runOfflineAtlas("pin Alpha", ctx());
    expect(p.pinned_model_id).toBe("Alpha");
    expect(p.auto_apply).toBe(true);
  });

  it("store receives decide floor patch", () => {
    const store = createStore();
    const p = emptyProposal("t", "Floor 60.", {
      floor: 60,
      decide_mode: true,
      needs_confirm: true,
    });
    const { patch } = proposalToStorePatch(p, store.getState().filters);
    store.update(patch);
    expect(store.getState().intelligenceFloor).toBe(60);
    expect(store.getState().decideMode).toBe(true);
  });

  it("host ignores model auto_apply on high-impact floor change", () => {
    const p = emptyProposal("t", "Hostile floor.", {
      floor: 10,
      needs_confirm: false,
      auto_apply: true,
    });
    expect(isLowImpactProposal(p)).toBe(false);
    expect(shouldAutoApplyProposal(p)).toBe(false);
  });

  it("host auto-applies cinema even if model sets needs_confirm oddly with auto true", () => {
    const p = emptyProposal("t", "Cinema.", {
      cinema_mode: true,
      needs_confirm: false,
      auto_apply: true,
    });
    expect(shouldAutoApplyProposal(p)).toBe(true);
  });
});
