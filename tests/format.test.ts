import { describe, expect, it } from "vitest";
import {
  formatTps,
  formatPricePerM,
  formatIntelligence,
  formatTtftSeconds,
  isReasoningModel,
  ttftCaveat,
  TTFT_MULTI_MINUTE_MS,
} from "../src/lib/format";

describe("metric formatting (FIX-C #28: readout units)", () => {
  it("formats speed as tok/s", () => {
    expect(formatTps(172.123)).toBe("172.1 tok/s");
    expect(formatTps(null)).toBe("—");
  });

  it("formats price as $X.XX /M tokens (always two decimals, $ prefix)", () => {
    expect(formatPricePerM(7.7)).toBe("$7.70 /M tokens");
    expect(formatPricePerM(0.05796)).toBe("$0.06 /M tokens");
    expect(formatPricePerM(0)).toBe("$0.00 /M tokens");
    expect(formatPricePerM(null)).toBe("—");
  });

  it("formats the AA intelligence index", () => {
    expect(formatIntelligence(49.9)).toBe("49.9");
    expect(formatIntelligence(null)).toBe("—");
  });

  it("formats ttft from the stored ms value into seconds", () => {
    expect(formatTtftSeconds(2399)).toBe("2.4s");
    expect(formatTtftSeconds(143498)).toBe("143.5s");
    expect(formatTtftSeconds(null)).toBe("—");
  });
});

describe("ttft caveat (#28 review fix: reasoning models only)", () => {
  it("carries the caveat for a reasoning model at/above the multi-minute threshold", () => {
    // Claude Sonnet 5 (Adaptive Reasoning) — reasoning model, ~188s.
    expect(
      ttftCaveat({ model: "Claude Sonnet 5 (Adaptive Reasoning, Max Effort)", ttft: 188_060 }),
    ).toMatch(/long-prompt median/);
    // GPT-5.6 Luna — reasoning by effort tier "(max)", exactly at the threshold.
    expect(ttftCaveat({ model: "GPT-5.6 Luna (max)", ttft: TTFT_MULTI_MINUTE_MS })).toMatch(
      /thinking time/,
    );
  });

  it("omits the caveat below the threshold — fast reasoners included", () => {
    // Gemma 4 31B (Reasoning) is a reasoner, but ~1.1s is not multi-minute.
    expect(ttftCaveat({ model: "Gemma 4 31B (Reasoning)", ttft: 1_091 })).toBe("");
    expect(ttftCaveat({ model: "GPT-5.6 Luna (max)", ttft: 59_999 })).toBe("");
    expect(ttftCaveat({ model: "Claude Sonnet 5 (Adaptive Reasoning, Max Effort)", ttft: null })).toBe(
      "",
    );
  });

  it("does NOT carry the caveat for a NON-reasoning model even with a multi-minute TTFT (#28 review fix)", () => {
    // The old ms-only gate would wrongly attach the thinking-time caveat to a
    // non-reasoning model that is merely slow. The reasoning gate blocks it.
    expect(ttftCaveat({ model: "Llama 4 Scout", ttft: 188_060 })).toBe("");
    expect(ttftCaveat({ model: "Mistral Large 3", ttft: TTFT_MULTI_MINUTE_MS })).toBe("");
    // Parentheses, but not an effort tier — still non-reasoning.
    expect(ttftCaveat({ model: "GPT-4o (Nov '24)", ttft: 200_000 })).toBe("");
  });
});

describe("isReasoningModel (#28 review fix: unified name heuristic)", () => {
  it("detects reasoning models by marker or effort tier", () => {
    expect(isReasoningModel({ model: "Claude 4.5 Haiku (Reasoning)" })).toBe(true);
    expect(isReasoningModel({ model: "DeepSeek V4 Pro (Reasoning, Max Effort)" })).toBe(true);
    expect(isReasoningModel({ model: "Claude Sonnet 5 (Adaptive Reasoning, Max Effort)" })).toBe(true);
    expect(isReasoningModel({ model: "Gemma 4 31B (Reasoning)" })).toBe(true);
    expect(isReasoningModel({ model: "GPT-5.6 Luna (max)" })).toBe(true);
    expect(isReasoningModel({ model: "GPT-5.5 Pro (xhigh)" })).toBe(true);
    expect(isReasoningModel({ model: "GPT-5 (high)" })).toBe(true);
  });

  it("rejects non-reasoning models", () => {
    expect(isReasoningModel({ model: "Llama 4 Scout" })).toBe(false);
    expect(isReasoningModel({ model: "Llama 3.3 Instruct 70B" })).toBe(false);
    expect(isReasoningModel({ model: "GPT-4o (Nov '24)" })).toBe(false);
    expect(isReasoningModel({ model: "Mistral Large 3" })).toBe(false);
    expect(isReasoningModel({ model: "Gemini 3.5 Flash-Lite" })).toBe(false);
    expect(isReasoningModel({ model: "Command A+" })).toBe(false);
  });
});
