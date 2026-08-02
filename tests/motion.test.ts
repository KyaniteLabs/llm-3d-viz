import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleSweep, timingProgress } from "../src/viz/sweep-timing";

describe("motion timing", () => {
  it("uses elapsed wall-clock time rather than frame count", () => {
    expect(timingProgress(1000, 1100, 400)).toBeCloseTo(0.25);
    expect(timingProgress(1000, 1300, 400)).toBeCloseTo(0.75);
    expect(timingProgress(1000, 1400, 400)).toBe(1);
  });

  it("advances the production scheduler from performance.now() under fake timers", () => {
    vi.useFakeTimers();
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    let nextFrame = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      callbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));

    const progress: number[] = [];
    const cancel = scheduleSweep((value) => progress.push(value));
    const deliver = (elapsed: number) => {
      now = 1_000 + elapsed;
      const [id, callback] = callbacks.entries().next().value as [number, FrameRequestCallback];
      callbacks.delete(id);
      callback(now);
    };

    deliver(16);
    deliver(200);
    deliver(400);

    expect(progress).toEqual([0.04, 0.5, 1]);
    cancel();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
