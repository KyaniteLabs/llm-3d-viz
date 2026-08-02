import { test, expect } from "@playwright/test";

/**
 * FIX-D (#29): mobile-axis responsive titles/ticks regression spec.
 *
 * At narrow plot widths (< NARROW_PX ≈ 460, i.e. a 375px phone) the 3D axis
 * titles are WebGL textures fixed at the axis ends; the long defaults
 * ("INTELLIGENCE (INDEX)") overflow the canvas and clip, and the three axes'
 * lowest ticks stack into an illegible cluster at the origin corner. So at narrow
 * widths the stage shortens titles to the metric name, thins the ticks, and drops
 * the origin tick on each axis. Desktop (>= NARROW_PX) keeps the full titles and
 * full tick set. This spec pins both branches so neither can silently regress.
 */
test.describe("FIX-D #29 mobile axes (responsive titles/ticks)", () => {
  test("narrow (375px): shortened titles, thinned ticks, origin ticks dropped", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz);

    const s = await page.evaluate(() => {
      const sc = (window as any).__viz.gd.layout.scene;
      return {
        containerWidth: (window as any).__viz.gd.parentElement.clientWidth,
        xTitle: sc.xaxis.title.text,
        yTitle: sc.yaxis.title.text,
        zTitle: sc.zaxis.title.text,
        xTicks: sc.xaxis.tickvals as number[],
        yTicks: sc.yaxis.tickvals as number[],
        zTicks: sc.zaxis.tickvals as number[],
      };
    });

    expect(s.containerWidth).toBeLessThan(460); // genuinely narrow
    // Titles shortened to the metric name (units live in ticks + tooltip).
    expect(s.xTitle).toBe("SPEED");
    expect(s.yTitle).toBe("INTEL");
    expect(s.zTitle).toBe("COST");
    // Origin ticks dropped on every axis (they labelled one convergent corner).
    expect(s.xTicks).not.toContain(10);
    expect(s.yTicks).not.toContain(0);
    expect(s.zTicks).toEqual([1, 100]);
  });

  test("desktop (1280px): full titles + full tick set unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz);

    const s = await page.evaluate(() => {
      const sc = (window as any).__viz.gd.layout.scene;
      return {
        xTitle: sc.xaxis.title.text,
        yTitle: sc.yaxis.title.text,
        zTitle: sc.zaxis.title.text,
        xTicks: sc.xaxis.tickvals as number[],
        yTicks: sc.yaxis.tickvals as number[],
      };
    });

    expect(s.xTitle).toBe("SPEED (TPS)");
    expect(s.yTitle).toBe("INTELLIGENCE (INDEX)");
    expect(s.zTitle).toBe("COST ($/M)");
    expect(s.xTicks).toEqual([10, 100, 1000]);
    expect(s.yTicks).toEqual([0, 20, 40, 60, 80, 100]);
  });
});
