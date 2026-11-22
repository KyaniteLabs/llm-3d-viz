import { expect } from "@playwright/test";
import { RENDERER_POINT_COUNT, test } from "./helpers/renderer-fixture";

test.describe("FIX-D #29 marker-reset hardening", () => {
  test("plotly_afterplot restores sweep-owned marker appearance after a styling-dropping react", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/?stage=plotly&heat=1&age=0");
    // The optimum can light up before the sweep ends. The final frame is the
    // first to restore score-scaled heat to the dominated points.
    await page.waitForFunction(() => {
      const viz = (window as any).__viz;
      if (!viz?.projectionsInstance || viz.gd.getAttribute("aria-busy") === "true") return false;
      const points = viz.gd.data?.[0];
      const colors: string[] = points?.marker?.color;
      if (!Array.isArray(colors) || !Array.isArray(points.marker.size)) return false;
      const frontier = new Set(viz.frontierModelIds);
      const dominatedColors = colors.filter((_, index) => {
        const id = points.text[index];
        return id !== viz.optimumModelId && !frontier.has(id);
      });
      return new Set(dominatedColors).size > 1;
    }, undefined, { timeout: 15000 });

    const settled = await page.evaluate(() => {
      const marker = (window as any).__viz.gd.data[0].marker;
      return {
        colors: marker.color as string[],
        sizes: marker.size as number[],
      };
    });
    expect(settled.colors).toHaveLength(RENDERER_POINT_COUNT);
    expect(settled.sizes).toContain(16);
    expect(settled.colors).not.toContain("#636efa");

    // Remove styles through the real Plotly API. The scheduler has to restore
    // the live trace via afterplot without another application store update.
    const dropped = await page.evaluate(async () => {
      const { gd, Plotly } = (window as any).__viz;
      const points = gd.data[0];
      const stripped = { ...points, marker: { symbol: points.marker.symbol, line: points.marker.line } };
      let sawDroppedStyles = false;
      const onAfterPlot = () => {
        const marker = gd.data[0].marker;
        sawDroppedStyles ||= !Array.isArray(marker?.color) && !Array.isArray(marker?.size);
      };
      gd.on("plotly_afterplot", onAfterPlot);
      try {
        await Plotly.react(gd, [stripped, gd.data[1]], gd.layout, gd._context);
      } finally {
        gd.removeListener("plotly_afterplot", onAfterPlot);
      }
      return sawDroppedStyles;
    });
    expect(dropped).toBe(true);

    await expect.poll(() => page.evaluate(() => {
      const marker = (window as any).__viz.gd.data[0].marker;
      return { colors: marker.color, sizes: marker.size };
    })).toEqual(settled);
  });
});
