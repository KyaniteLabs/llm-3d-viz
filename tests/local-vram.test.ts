import { describe, expect, it } from "vitest";
import {
  LOCAL_VRAM_TIERS,
  fitsLocalVram,
  parseParamsBillions,
} from "../src/lib/local-vram";

describe("LOCAL_VRAM_TIERS", () => {
  it("exposes the top-3 popular consumer VRAM buckets", () => {
    expect(LOCAL_VRAM_TIERS.map((t) => t.vramMaxGb)).toEqual([8, 12, 24]);
    expect(LOCAL_VRAM_TIERS.map((t) => t.maxParamsB)).toEqual([9, 14, 34]);
  });
});

describe("parseParamsBillions", () => {
  it("parses dense parameter counts from names", () => {
    expect(parseParamsBillions("Qwen3-8B")).toBe(8);
    expect(parseParamsBillions("Llama-3.1-70B-Instruct")).toBe(70);
    expect(parseParamsBillions("Gemma-2-9B")).toBe(9);
    expect(parseParamsBillions("Seed-OSS-36B")).toBe(36);
    expect(parseParamsBillions("Phi-3.5-mini")).toBeNull();
  });

  it("prefers MoE active size (AxxB) over total B", () => {
    expect(parseParamsBillions("DeepSeek-V3 671B A37B")).toBe(37);
    expect(parseParamsBillions("Qwen3-235B-A22B")).toBe(22);
  });

  it("uses known specials when param tags are absent", () => {
    expect(parseParamsBillions("Llama 4 Scout")).toBe(17);
    expect(parseParamsBillions("Llama 4 Maverick")).toBe(17);
    expect(parseParamsBillions("Mistral Large 3")).toBe(123);
    expect(parseParamsBillions("Mistral Small 4 (Reasoning)")).toBe(24);
    expect(parseParamsBillions("Mistral Medium 3.5")).toBe(123);
    expect(parseParamsBillions("gpt-oss-20b (high)")).toBe(20);
  });
});

describe("fitsLocalVram", () => {
  it("gates 8 / 12 / 24 GB by Q4-class param caps", () => {
    expect(fitsLocalVram("Qwen3-8B", 8)).toBe(true);
    expect(fitsLocalVram("Gemma-2-9B", 8)).toBe(true);
    expect(fitsLocalVram("Qwen2.5-14B", 8)).toBe(false);
    expect(fitsLocalVram("Qwen2.5-14B", 12)).toBe(true);
    expect(fitsLocalVram("Qwen2.5-32B", 12)).toBe(false);
    expect(fitsLocalVram("Qwen2.5-32B", 24)).toBe(true);
    expect(fitsLocalVram("Llama-3.1-70B", 24)).toBe(false);
  });

  it("uses MoE active params for fit", () => {
    // 22B active fits 24GB, not 12GB
    expect(fitsLocalVram("Qwen3-235B-A22B", 24)).toBe(true);
    expect(fitsLocalVram("Qwen3-235B-A22B", 12)).toBe(false);
  });

  it("fail-closes when size cannot be parsed", () => {
    expect(fitsLocalVram("Claude Opus 4.1", 24)).toBe(false);
    expect(fitsLocalVram("gpt-oss-something", 8)).toBe(false);
  });
});
