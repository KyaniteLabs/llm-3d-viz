import { describe, expect, it } from "vitest";
import { timingProgress } from "../src/viz/sweep-timing";

describe("motion timing", () => {
  it("uses elapsed wall-clock time rather than frame count", () => {
    expect(timingProgress(1000, 1100, 400)).toBeCloseTo(0.25);
    expect(timingProgress(1000, 1300, 400)).toBeCloseTo(0.75);
    expect(timingProgress(1000, 1400, 400)).toBe(1);
  });
});
