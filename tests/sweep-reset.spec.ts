import { expect } from "@playwright/test";
import { RENDERER_POINT_COUNT, test, waitForSweepSettled } from "./helpers/renderer-fixture";

test.describe("FIX-D #29 marker-reset hardening", () => {
  test("plotly_afterplot restores sweep-owned marker appearance after a styling-dropping react", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/?stage=plotly&heat=1&age=0");
    await waitForSweepSettled(page);

    const settled = await page.evaluate(() => {
      const viz = (window as any).__viz;
      return {
        colors: (viz.markerColors as string[]).slice(),
        sizes: (viz.markerSizes as number[]).slice(),
      };
    });
    expect(settled.colors).toHaveLength(RENDERER_POINT_COUNT);
    expect(settled.sizes).toContain(16);
    expect(settled.colors).not.toContain("#636efa");

    // Remove styles through the real Plotly API. The scheduler has to restore
    // the live trace via afterplot without another application store update.
    await page.evaluate(async () => {
      const { gd, Plotly } = (window as any).__viz;
      const points = gd.data[0];
      const stripped = { ...points, marker: { symbol: points.marker.symbol, line: points.marker.line } };
      await Plotly.react(gd, [stripped, gd.data[1]], gd.layout, gd._context);
    });

    await expect.poll(() => page.evaluate(() => {
      const marker = (window as any).__viz.gd.data[0].marker;
      return { colors: marker.color, sizes: marker.size };
    })).toEqual(settled);
  });
});
