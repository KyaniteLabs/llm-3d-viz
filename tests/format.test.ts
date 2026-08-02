import { describe, expect, it } from "vitest";
import {
  formatTps,
  formatPricePerM,
  formatIntelligence,
  formatTtftSeconds,
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

describe("ttft caveat (FIX-C #28: multi-minute reasoning models)", () => {
  it("carries the thinking-time caveat at/above the multi-minute threshold", () => {
    expect(ttftCaveat(TTFT_MULTI_MINUTE_MS)).toMatch(/thinking time/);
    expect(ttftCaveat(188060)).toMatch(/long-prompt median/); // Claude Sonnet 5 (~188s)
  });

  it("omits the caveat below the threshold — fast reasoners included", () => {
    expect(ttftCaveat(59_999)).toBe("");
    expect(ttftCaveat(1091)).toBe(""); // Gemma 4 31B (Reasoning), ~1.1s
    expect(ttftCaveat(null)).toBe("");
  });
});
