import { describe, expect, it } from "vitest";
import { DEFAULT_AXIS_MAPPING } from "../src/lib/axis-metrics";
import { DEFAULT_FILTERS } from "../src/lib/filters";
import { presets } from "../src/lib/score";
import {
  DEFAULT_DECIDE_SHARE,
  parseShareableState,
  serializeShareableState,
} from "../src/lib/url-state";

const baseShare = () => ({
  filters: { ...DEFAULT_FILTERS },
  axisMapping: { ...DEFAULT_AXIS_MAPPING },
  weights: { ...presets.chat },
  decide: { ...DEFAULT_DECIDE_SHARE },
});

describe("url-state", () => {
  it("parses age=0 and provider/family lists", () => {
    const state = parseShareableState("?age=0&providers=OpenAI,Anthropic&families=GPT-5.6");
    expect(state.filters.ageEnabled).toBe(false);
    expect(state.filters.providers).toEqual(["OpenAI", "Anthropic"]);
    expect(state.filters.families).toEqual(["GPT-5.6"]);
  });

  it("accepts fam= as an alias for families=", () => {
    const state = parseShareableState("?fam=Claude%20Fable%205&me=1");
    expect(state.filters.families).toEqual(["Claude Fable 5"]);
    expect(state.filters.multiEffortOnly).toBe(true);
  });

  it("parses axis mapping and weights", () => {
    const state = parseShareableState("?ax=tps,intelligence,blended_price&w=0.25,0.15,0.6");
    expect(state.axisMapping).toEqual({
      x: "tps",
      y: "intelligence",
      z: "blended_price",
    });
    expect(state.weights).toEqual({ speed: 0.25, cost: 0.15, intelligence: 0.6 });
  });

  it("omits product defaults on serialize", () => {
    const params = serializeShareableState(baseShare());
    expect(params.toString()).toBe("");
  });

  it("round-trips non-default shareable state and preserves stage/heat", () => {
    const existing = new URLSearchParams("stage=plotly&heat=1");
    const state = {
      filters: {
        ageEnabled: false,
        ageMonths: 6,
        multiEffortOnly: true,
        providers: ["OpenAI"],
        families: ["Claude Opus 5"],
      },
      axisMapping: {
        x: "tps" as const,
        y: "intelligence" as const,
        z: "blended_price" as const,
      },
      weights: { speed: 0.25, cost: 0.15, intelligence: 0.6 },
      decide: { ...DEFAULT_DECIDE_SHARE },
    };
    const serialized = serializeShareableState(state, existing);
    expect(serialized.get("stage")).toBe("plotly");
    expect(serialized.get("heat")).toBe("1");
    expect(serialized.get("age")).toBe("0");
    expect(serialized.get("providers")).toBe("OpenAI");
    expect(serialized.get("ax")).toBe("tps,intelligence,blended_price");
    const again = parseShareableState(serialized);
    expect(again.filters.ageEnabled).toBe(false);
    expect(again.filters.providers).toEqual(["OpenAI"]);
    expect(again.axisMapping).toEqual(state.axisMapping);
    expect(again.weights).toEqual(state.weights);
  });

  it("round-trips decide floor bias and always writes floor when decide on", () => {
    const state = {
      ...baseShare(),
      decide: {
        decideMode: true,
        intelligenceFloor: 62,
        costSpeedBias: -0.5,
        floorAnchorModelId: null as string | null,
        floorSource: "user" as const,
        floorUserSet: true,
      },
    };
    const params = serializeShareableState(state);
    expect(params.get("decide")).toBe("1");
    expect(params.get("floor")).toBe("62");
    expect(params.get("bias")).toBe("-0.5");
    const again = parseShareableState(params);
    expect(again.decide.decideMode).toBe(true);
    expect(again.decide.intelligenceFloor).toBe(62);
    expect(again.decide.costSpeedBias).toBe(-0.5);
    expect(again.decide.floorSource).toBe("user");
  });

  it("anchor wins floor number when catalog resolves Index", () => {
    const catalog = [
      { model: "Model-A", aa_intelligence_index: 72 },
      { model: "Model-B", aa_intelligence_index: 40 },
    ];
    const state = parseShareableState("?decide=1&floor=60&anchor=Model-A", {}, { catalog });
    expect(state.decide.floorAnchorModelId).toBe("Model-A");
    expect(state.decide.intelligenceFloor).toBe(72);
    expect(state.decide.floorSource).toBe("anchor");
  });

  it("unknown anchor falls back to floor as user", () => {
    const catalog = [{ model: "Model-A", aa_intelligence_index: 72 }];
    const state = parseShareableState("?decide=1&floor=55&anchor=Missing", {}, { catalog });
    expect(state.decide.floorAnchorModelId).toBeNull();
    expect(state.decide.intelligenceFloor).toBe(55);
    expect(state.decide.floorSource).toBe("user");
  });

  it("serializes both anchor and resolved floor", () => {
    const params = serializeShareableState({
      ...baseShare(),
      decide: {
        decideMode: true,
        intelligenceFloor: 72,
        costSpeedBias: 0,
        floorAnchorModelId: "Model-A",
        floorSource: "anchor",
        floorUserSet: true,
      },
    });
    expect(params.get("anchor")).toBe("Model-A");
    expect(params.get("floor")).toBe("72");
  });

  it("serializes me=0 opt-out of multi-effort default", () => {
    const params = serializeShareableState({
      ...baseShare(),
      filters: { ...DEFAULT_FILTERS, multiEffortOnly: false },
    });
    expect(params.get("me")).toBe("0");
    const again = parseShareableState(params);
    expect(again.filters.multiEffortOnly).toBe(false);
  });

  it("parses and round-trips local VRAM + open-weight share params", () => {
    const state = parseShareableState("?vram=12&open=1");
    expect(state.filters.vramMaxGb).toBe(12);
    expect(state.filters.openness).toBe("open");

    const params = serializeShareableState({
      ...baseShare(),
      filters: { ...DEFAULT_FILTERS, openness: "open", vramMaxGb: 24 },
    });
    expect(params.get("vram")).toBe("24");
    expect(params.get("open")).toBe("1");
    const again = parseShareableState(params);
    expect(again.filters.vramMaxGb).toBe(24);
    expect(again.filters.openness).toBe("open");
  });

  it("vram alone forces openness open; invalid vram ignored", () => {
    const state = parseShareableState("?vram=24");
    expect(state.filters.vramMaxGb).toBe(24);
    expect(state.filters.openness).toBe("open");
    const bad = parseShareableState("?vram=16");
    expect(bad.filters.vramMaxGb).toBeNull();
  });

  it("clears stale open/vram when serializing defaults", () => {
    const existing = new URLSearchParams("vram=8&open=1&heat=1");
    const params = serializeShareableState(baseShare(), existing);
    expect(params.get("vram")).toBeNull();
    expect(params.get("open")).toBeNull();
    expect(params.get("heat")).toBe("1");
  });
});

describe("enc presentation flag", () => {
  it("preserves enc=openness when serializing shareable state", () => {
    const existing = new URLSearchParams("enc=openness&heat=1");
    const params = serializeShareableState(baseShare(), existing);
    expect(params.get("enc")).toBe("openness");
    expect(params.get("heat")).toBe("1");
  });
});
