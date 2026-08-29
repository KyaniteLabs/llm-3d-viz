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
describe("plotly loader retry (V13)", () => {
  it("resets the cached import on rejection so a later call retries", async () => {
    vi.resetModules();
    const { loadPlotly } = await import("../src/viz/plotly-loader");
    const fakeModule = {
      newPlot() {},
      react() {},
      restyle() {},
      purge() {},
      relayout() {},
      Fx: { hover() {} },
    };
    let shouldReject = true;
    const importFn = async () => {
      if (shouldReject) throw new Error("offline");
      return fakeModule;
    };
    // First call rejects; the loader's rejection handler must reset the cache.
    await expect(loadPlotly(importFn)).rejects.toThrow("offline");
    // After reset, the next call retries instead of returning the cached
    // rejection (the V13 defect cached one failure for the whole session).
    shouldReject = false;
    const mod = await loadPlotly(importFn);
    expect(mod).toBe(fakeModule);
    vi.resetModules();
  });
});
