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
import { displayName } from "../src/lib/display-name";

describe("displayName", () => {
  it("removes parenthetical reasoning and effort metadata without changing ordinary release labels", () => {
    expect(displayName("GPT-5.6 Luna (max)")).toBe("GPT-5.6 Luna");
    expect(displayName("Claude Sonnet 5 (Adaptive Reasoning, Max Effort)")).toBe("Claude Sonnet 5");
    expect(displayName("GPT-4o (Nov '24)")).toBe("GPT-4o (Nov '24)");
  });
});

describe("metric formatting (FIX-C #28: readout units)", () => {
  it("formats speed as tok/s", () => {
    expect(formatTps(172.123)).toBe("172 tok/s");
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

describe("ttft caveat (#28 r2: reasoning-gated via structured field)", () => {
  it("carries the caveat for a reasoning model at/above the multi-minute threshold", () => {
    // Structured `reasoning: true` is authoritative; multi-minute TTFT.
    expect(ttftCaveat({ model: "Claude Sonnet 5", reasoning: true, ttft: 188_060 })).toMatch(
      /long-prompt median/,
    );
    expect(ttftCaveat({ model: "GPT-5.6 Luna", reasoning: true, ttft: TTFT_MULTI_MINUTE_MS })).toMatch(
      /thinking time/,
    );
  });

  it("omits the caveat below the threshold — fast reasoners included", () => {
    // Both gates: reasoning && ttft >= 60s. A fast reasoner has nothing to disclose.
    expect(ttftCaveat({ model: "Gemma 4 31B", reasoning: true, ttft: 1_091 })).toBe("");
    expect(ttftCaveat({ model: "GPT-5.6 Luna", reasoning: true, ttft: 59_999 })).toBe("");
    expect(ttftCaveat({ model: "Claude Sonnet 5", reasoning: true, ttft: null })).toBe("");
  });

  it("does NOT carry the caveat for a NON-reasoning model even with a multi-minute TTFT", () => {
    // reasoning: false gates the caveat off — a slow non-reasoner is just slow,
    // it has no thinking time to attribute its latency to.
    expect(ttftCaveat({ model: "Llama 4 Scout", reasoning: false, ttft: 188_060 })).toBe("");
    expect(ttftCaveat({ model: "Mistral Large 3", reasoning: false, ttft: TTFT_MULTI_MINUTE_MS })).toBe("");
    expect(ttftCaveat({ model: "GPT-4o (Nov '24)", reasoning: false, ttft: 200_000 })).toBe("");
  });

  it("falls back to the name heuristic when the structured field is absent", () => {
    // Legacy rows without `reasoning`: the curated name marker still classifies.
    expect(
      ttftCaveat({ model: "Claude Sonnet 5 (Adaptive Reasoning, Max Effort)", ttft: 188_060 }),
    ).toMatch(/long-prompt median/);
    expect(ttftCaveat({ model: "Llama 4 Scout", ttft: 188_060 })).toBe("");
  });
});

describe("isReasoningModel (#28 r2: structured field authoritative)", () => {
  it("reads the structured `reasoning` field when present, ignoring the name", () => {
    // Field TRUE wins even with no name marker.
    expect(isReasoningModel({ model: "Acme Base", reasoning: true })).toBe(true);
    // Field FALSE wins even with a reasoning name marker (curator override).
    expect(isReasoningModel({ model: "Acme (Reasoning)", reasoning: false })).toBe(false);
    expect(isReasoningModel({ model: "Acme (max)", reasoning: false })).toBe(false);
  });

  it("falls back to the name heuristic when the field is absent", () => {
    expect(isReasoningModel({ model: "Claude 4.5 Haiku (Reasoning)" })).toBe(true);
    expect(isReasoningModel({ model: "DeepSeek V4 Pro (Reasoning, Max Effort)" })).toBe(true);
    expect(isReasoningModel({ model: "Claude Sonnet 5 (Adaptive Reasoning, Max Effort)" })).toBe(true);
    expect(isReasoningModel({ model: "Gemma 4 31B (Reasoning)" })).toBe(true);
    expect(isReasoningModel({ model: "GPT-5.6 Luna (max)" })).toBe(true);
    expect(isReasoningModel({ model: "GPT-5.5 Pro (xhigh)" })).toBe(true);
    expect(isReasoningModel({ model: "GPT-5 (high)" })).toBe(true);
    expect(isReasoningModel({ model: "Llama 4 Scout" })).toBe(false);
    expect(isReasoningModel({ model: "Llama 3.3 Instruct 70B" })).toBe(false);
    expect(isReasoningModel({ model: "GPT-4o (Nov '24)" })).toBe(false);
    expect(isReasoningModel({ model: "Mistral Large 3" })).toBe(false);
    expect(isReasoningModel({ model: "Gemini 3.5 Flash-Lite" })).toBe(false);
    expect(isReasoningModel({ model: "Command A+" })).toBe(false);
  });

  it("does NOT misclassify 'non-reasoning' as a reasoner (#28 r2: substring bug fix)", () => {
    // The old `name.includes("reasoning")` heuristic returned TRUE for any name
    // containing the substring "reasoning" — including "non-reasoning". The
    // lookbehind fallback (and the structured field) correctly reject it.
    expect(isReasoningModel({ model: "Acme Non-Reasoning Base" })).toBe(false);
    expect(isReasoningModel({ model: "Non-Reasoning Lite" })).toBe(false);
    // A genuine "(Reasoning)" marker still classifies as a reasoner.
    expect(isReasoningModel({ model: "Acme (Reasoning)" })).toBe(true);
  });
});
