import { describe, expect, it } from "vitest";
import type { FloorSource } from "../src/lib/decide";
import {
  FLOOR_SOURCES,
  IllegalFloorTransition,
  assertFloorProvenance,
  defaultFloorProvenance,
  enterDecideDefault,
  isLegalFloorProvenance,
  readFloorProvenance,
  setFloorByAnchor,
  setFloorByUser,
  type FloorProvenance,
} from "../src/lib/floor-state";
import { createStore } from "../src/state";
import { proposalToStorePatch } from "../src/lib/atlas-agent";
import { emptyProposal } from "../src/lib/atlas-agent";
import { DEFAULT_FILTERS } from "../src/lib/filters";
import {
  DEFAULT_DECIDE_SHARE,
  parseShareableState,
  serializeShareableState,
} from "../src/lib/url-state";
import { DEFAULT_AXIS_MAPPING } from "../src/lib/axis-metrics";
import { presets } from "../src/lib/score";

/** Canonical legal triple per stage — exhaustive over FloorSource. */
const CANONICAL: Record<FloorSource, FloorProvenance> = {
  default: { floorSource: "default", floorUserSet: false, floorAnchorModelId: null },
  user: { floorSource: "user", floorUserSet: true, floorAnchorModelId: null },
  anchor: { floorSource: "anchor", floorUserSet: true, floorAnchorModelId: "Model-A" },
};

describe("floor-state: stage table", () => {
  it("names every FloorSource exactly once (adding a stage must update this table)", () => {
    expect([...FLOOR_SOURCES].sort()).toEqual(Object.keys(CANONICAL).sort());
  });

  it.each(FLOOR_SOURCES)("canonical %s triple is legal", (src) => {
    expect(isLegalFloorProvenance(CANONICAL[src])).toBe(true);
  });

  it("every other combination of the three fields is illegal", () => {
    const anchors = [null, "", "  ", "Model-A"];
    let legal = 0;
    for (const floorSource of FLOOR_SOURCES) {
      for (const floorUserSet of [true, false]) {
        for (const floorAnchorModelId of anchors) {
          const p = { floorSource, floorUserSet, floorAnchorModelId };
          const isCanonical =
            (floorSource === "default" && !floorUserSet && floorAnchorModelId === null) ||
            (floorSource === "user" && floorUserSet && floorAnchorModelId === null) ||
            (floorSource === "anchor" && floorUserSet && floorAnchorModelId === "Model-A");
          expect(isLegalFloorProvenance(p), JSON.stringify(p)).toBe(isCanonical);
          if (isCanonical) legal++;
        }
      }
    }
    expect(legal).toBe(FLOOR_SOURCES.length);
    expect(isLegalFloorProvenance({ floorSource: "bogus" as FloorSource, floorUserSet: false, floorAnchorModelId: null })).toBe(false);
  });
});

describe("floor-state: transitions", () => {
  it.each(FLOOR_SOURCES)("%s → user / anchor are legal", (from) => {
    void CANONICAL[from];
    expect(setFloorByUser()).toEqual(CANONICAL.user);
    expect(setFloorByAnchor("Model-A")).toEqual(CANONICAL.anchor);
  });

  it("default → default via enterDecideDefault", () => {
    expect(enterDecideDefault(CANONICAL.default)).toEqual(CANONICAL.default);
  });

  it.each(["user", "anchor"] as const)("enterDecideDefault refuses from %s (would drop the user's floor)", (from) => {
    expect(() => enterDecideDefault(CANONICAL[from])).toThrow(IllegalFloorTransition);
  });

  it.each([["", "empty"], ["   ", "blank"]])("setFloorByAnchor refuses %j (%s id)", (id) => {
    expect(() => setFloorByAnchor(id)).toThrow(IllegalFloorTransition);
  });

  it("assertFloorProvenance throws on an illegal mix", () => {
    expect(() =>
      assertFloorProvenance({ floorSource: "anchor", floorUserSet: true, floorAnchorModelId: null }),
    ).toThrow(IllegalFloorTransition);
  });
});

describe("floor-state: tolerant reader", () => {
  it.each([
    [{}, CANONICAL.default],
    [{ floorSource: "default", floorUserSet: true }, CANONICAL.default],
    [{ floorSource: "user", floorAnchorModelId: "X" }, CANONICAL.user],
    [{ floorSource: "anchor", floorAnchorModelId: "Model-A" }, CANONICAL.anchor],
    [{ floorSource: "anchor", floorAnchorModelId: null }, CANONICAL.user],
    [{ floorSource: "legacy", floorUserSet: true }, CANONICAL.user],
    [{ floorSource: "legacy", floorAnchorModelId: "Model-A" }, CANONICAL.anchor],
    [{ floorUserSet: false }, CANONICAL.default],
  ])("reads %j as a legal stage", (raw, want) => {
    const got = readFloorProvenance(raw);
    expect(got).toEqual(want);
    expect(isLegalFloorProvenance(got)).toBe(true);
  });
});

describe("floor-state: store enforcement", () => {
  it("refuses a partial patch that would mix stages", () => {
    const store = createStore();
    expect(() => store.update({ floorSource: "anchor" })).toThrow(IllegalFloorTransition);
    expect(() => store.update({ floorUserSet: true })).toThrow(IllegalFloorTransition);
    // State untouched after a refused move.
    expect(store.getState().floorSource).toBe("default");
  });

  it("refuses an illegal initial state and an illegal replace()", () => {
    expect(() => createStore({ floorSource: "user", floorUserSet: false })).toThrow(IllegalFloorTransition);
    const store = createStore();
    const { datarevision: _r, ...rest } = store.getState();
    expect(() => store.replace({ ...rest, floorAnchorModelId: "X" })).toThrow(IllegalFloorTransition);
  });
});

describe("floor-state: Atlas proposal patch (bug: empty anchor id)", () => {
  const p = (anchor: string | null | undefined) => ({
    ...emptyProposal("snap", "s"),
    floor: 60,
    floor_anchor_model_id: anchor,
  });

  // Old code wrote { floorSource: "user", floorAnchorModelId: "" } — an anchor id
  // on a user floor (illegal mix), and "  " became an anchor with a blank id.
  it.each([[""], ["   "], [null], [undefined]])("anchor %j → legal user floor", (anchor) => {
    const { patch } = proposalToStorePatch(p(anchor), { ...DEFAULT_FILTERS });
    expect(patch).toMatchObject(CANONICAL.user);
    const store = createStore();
    expect(() => store.update(patch)).not.toThrow();
    expect(isLegalFloorProvenance(store.getState())).toBe(true);
  });

  it("non-empty anchor → anchor stage", () => {
    const { patch } = proposalToStorePatch(p("Model-A"), { ...DEFAULT_FILTERS });
    expect(patch).toMatchObject(CANONICAL.anchor);
  });
});

/** Deterministic PRNG so the model walk is reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("floor-state: stateful model walk (store + URL round-trip)", () => {
  type Cmd = "slider" | "anchor" | "clearAnchor" | "toggleDecide" | "badPatch" | "roundTrip";
  const CMDS: Cmd[] = ["slider", "anchor", "clearAnchor", "toggleDecide", "badPatch", "roundTrip"];

  it("invariant holds after every step of 200 random 60-step walks", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const store = createStore();
      // Model: just the expected stage.
      let model: FloorSource = "default";
      for (let step = 0; step < 60; step++) {
        const cmd = CMDS[Math.floor(rnd() * CMDS.length)];
        const cur = store.getState();
        switch (cmd) {
          case "slider":
            store.update({ intelligenceFloor: Math.round(rnd() * 100), ...setFloorByUser() });
            model = "user";
            break;
          case "anchor":
            store.update({ intelligenceFloor: 55, ...setFloorByAnchor(rnd() < 0.5 ? "Alpha" : "Beta") });
            model = "anchor";
            break;
          case "clearAnchor":
            store.update(setFloorByUser());
            model = "user";
            break;
          case "toggleDecide":
            // Mirrors src/main.ts decide toggle.
            if (!cur.decideMode && cur.floorSource === "default") {
              store.update({ decideMode: true, ...enterDecideDefault(cur) });
            } else {
              store.update({ decideMode: !cur.decideMode });
            }
            break;
          case "badPatch":
            expect(() => store.update({ floorUserSet: !cur.floorUserSet })).toThrow(IllegalFloorTransition);
            break;
          case "roundTrip": {
            const qs = serializeShareableState({
              filters: { ...DEFAULT_FILTERS },
              axisMapping: { ...DEFAULT_AXIS_MAPPING },
              weights: { ...presets.chat },
              decide: { ...DEFAULT_DECIDE_SHARE, ...cur },
            }).toString();
            const back = parseShareableState(`?${qs}`).decide;
            expect(isLegalFloorProvenance(back)).toBe(true);
            expect(back.floorSource).toBe(cur.floorSource);
            expect(back.floorAnchorModelId).toBe(cur.floorAnchorModelId);
            break;
          }
        }
        const s = store.getState();
        expect(isLegalFloorProvenance(s), `seed ${seed} step ${step} ${cmd}`).toBe(true);
        expect(s.floorSource).toBe(model);
      }
    }
  });
});
