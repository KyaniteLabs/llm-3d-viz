import { describe, expect, it } from "vitest";
import { DEFAULT_AXIS_MAPPING } from "../src/lib/axis-metrics";
import { DEFAULT_FILTERS } from "../src/lib/filters";
import { presets } from "../src/lib/score";
import { parseShareableState, serializeShareableState } from "../src/lib/url-state";

describe("url-state", () => {
  it("parses age=0 and provider/family lists", () => {
    const state = parseShareableState("?age=0&providers=OpenAI,Anthropic&families=GPT-5.6");
    expect(state.filters.ageEnabled).toBe(false);
    expect(state.filters.providers).toEqual(["OpenAI", "Anthropic"]);
    expect(state.filters.families).toEqual(["GPT-5.6"]);
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
    const params = serializeShareableState({
      filters: { ...DEFAULT_FILTERS },
      axisMapping: { ...DEFAULT_AXIS_MAPPING },
      weights: { ...presets.chat },
    });
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
});

describe("enc presentation flag", () => {
  it("preserves enc=openness when serializing shareable state", () => {
    const existing = new URLSearchParams("enc=openness&heat=1");
    const params = serializeShareableState(
      {
        filters: { ...DEFAULT_FILTERS },
        axisMapping: { ...DEFAULT_AXIS_MAPPING },
        weights: { ...presets.chat },
      },
      existing,
    );
    expect(params.get("enc")).toBe("openness");
    expect(params.get("heat")).toBe("1");
  });
});

describe("multi-effort only URL", () => {
  it("serializes me=0 when multiEffortOnly is off", () => {
    const params = serializeShareableState({
      filters: { ...DEFAULT_FILTERS, multiEffortOnly: false },
      axisMapping: { ...DEFAULT_AXIS_MAPPING },
      weights: { ...presets.chat },
    });
    expect(params.get("me")).toBe("0");
  });
  it("parses me=0", () => {
    const state = parseShareableState("?me=0");
    expect(state.filters.multiEffortOnly).toBe(false);
  });
});
