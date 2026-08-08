import { describe, expect, it, vi } from "vitest";
import {
  dispatchUiAction,
  dispatchUiActions,
  isUiActionRegistered,
  listUiActions,
  registerUiAction,
  unregisterUiAction,
} from "../src/lib/atlas-agent/ui-actions";
import { runOfflineAtlas } from "../src/lib/atlas-agent/offline-router";
import { applyProposalToStore } from "../src/lib/atlas-agent/apply";
import { emptyProposal, type AtlasAgentContext } from "../src/lib/atlas-agent/types";
import { DEFAULT_FILTERS } from "../src/lib/filters";
import type { Model } from "../src/data/models";

function ctx(): AtlasAgentContext {
  const catalog: Model[] = [
    {
      model: "X",
      provider: "Test",
      openness: "closed",
      modality: ["text"],
      context_length: 128000,
      release_date: "2026-01-01",
      source_url: "https://x",
      tps: 100,
      ttft: 100,
      price_in_per_M: 1,
      price_out_per_M: 1,
      blended_price_per_M: 1,
      aa_intelligence_index: 60,
      arena_elo: null,
      gpqa: null,
      swe_bench: null,
      aider_pct: null,
      data_date: "2026-08-01",
      source: "test",
    },
  ];
  return {
    catalog,
    visible: catalog,
    floor: 50,
    costSpeedBias: 0,
    catalogSnapshotId: "ui",
    filters: { ...DEFAULT_FILTERS },
  };
}

describe("UI-action bus", () => {
  it("registers, dispatches, and lists actions", () => {
    const fn = vi.fn();
    registerUiAction("test_action", "a test", fn);
    expect(isUiActionRegistered("test_action")).toBe(true);
    expect(dispatchUiAction("test_action", { n: 3 })).toBe(true);
    expect(fn).toHaveBeenCalledWith({ n: 3 });
    expect(listUiActions().some((a) => a.id === "test_action")).toBe(true);
    unregisterUiAction("test_action");
    expect(isUiActionRegistered("test_action")).toBe(false);
  });

  it("ignores unknown ids and swallows handler errors", () => {
    expect(dispatchUiAction("does_not_exist")).toBe(false);
    registerUiAction("boom", "throws", () => {
      throw new Error("nope");
    });
    expect(dispatchUiAction("boom")).toBe(false); // swallowed, not thrown
    unregisterUiAction("boom");
  });

  it("dispatches a batch, reporting dispatched vs unknown", () => {
    const fn = vi.fn();
    registerUiAction("batch_a", "a", fn);
    const res = dispatchUiActions([
      { id: "batch_a", args: { x: 1 } },
      { id: "batch_missing" },
    ]);
    expect(res.dispatched).toEqual(["batch_a"]);
    expect(res.unknown).toEqual(["batch_missing"]);
    expect(fn).toHaveBeenCalledTimes(1);
    unregisterUiAction("batch_a");
  });
});

describe("reset-view intent", () => {
  it("emits a reset_view ui_action proposal", () => {
    const p = runOfflineAtlas("reset the view", ctx());
    expect(p.ui_actions?.[0]?.id).toBe("reset_view");
    expect(p.auto_apply).toBe(true);
    expect(p.needs_confirm).toBe(false);
  });
  it("also matches 'recenter' and 'reset camera'", () => {
    expect(runOfflineAtlas("recenter", ctx()).ui_actions?.[0]?.id).toBe("reset_view");
    expect(runOfflineAtlas("reset camera", ctx()).ui_actions?.[0]?.id).toBe("reset_view");
  });
});

describe("apply dispatches ui_actions", () => {
  it("calls the registered handler when applying a proposal with ui_actions", () => {
    const fn = vi.fn();
    registerUiAction("apply_test", "t", fn);
    const store = {
      getState: () => ({ filters: { ...DEFAULT_FILTERS }, axisMapping: undefined }),
      update: () => {},
    };
    const p = emptyProposal("ui", "do it", {
      ui_actions: [{ id: "apply_test", args: { k: 1 } }],
      needs_confirm: false,
    });
    const res = applyProposalToStore(store as never, p);
    expect(fn).toHaveBeenCalledWith({ k: 1 });
    expect(res.uiDispatched).toEqual(["apply_test"]);
    unregisterUiAction("apply_test");
  });
});
