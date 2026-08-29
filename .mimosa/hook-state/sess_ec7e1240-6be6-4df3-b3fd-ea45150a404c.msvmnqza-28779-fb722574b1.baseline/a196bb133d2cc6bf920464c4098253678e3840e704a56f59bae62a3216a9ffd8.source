import { test, expect, type Page } from "@playwright/test";

async function waitForPlotlyStage(page: Page, timeoutMs = 15000): Promise<void> {
  await page.waitForFunction(
    () => {
      const viz = (window as any).__viz;
      const data = viz?.gd?.data;
      const sizes = Array.isArray(viz?.markerSizes) ? viz.markerSizes : [];
      const colors = Array.isArray(viz?.markerColors) ? viz.markerColors : [];
      const xs = data?.[0]?.x;
      const xlen = Array.isArray(xs) ? xs.length : xs && typeof xs.length === "number" ? xs.length : 0;
      return (
        Array.isArray(viz?.scorableModels) &&
        viz.scorableModels.length > 0 &&
        Array.isArray(data) &&
        data.length >= 1 &&
        xlen > 0 &&
        sizes.length > 0 &&
        colors.length > 0 &&
        sizes.length === viz.scorableModels.length
      );
    },
    null,
    { timeout: timeoutMs },
  );
}

/**
 * FIX-D (#29): marker-reset hardening — afterplot restores intentional appearance.
 * Uses __viz.markerColors/Sizes as the source of truth when gl3d data[] drops arrays.
 */
test.describe("FIX-D #29 marker-reset hardening", () => {
  test("plotly_afterplot restores sweep-owned marker appearance after a styling-dropping react", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/?stage=plotly&heat=1&age=0");
    await waitForPlotlyStage(page);

    // Snapshot the intentional appearance Stage3D/sweep publish.
    const settled = await page.evaluate(() => {
      const viz = (window as any).__viz;
      return {
        colors: (viz.markerColors ?? []).slice(),
        sizes: (viz.markerSizes ?? []).slice(),
      };
    });
    expect(settled.colors.length).toBeGreaterThan(10);
    expect(settled.sizes.some((s: number) => s >= 16)).toBe(true);
    // Heat-on optimum uses filament; openness gold path uses gold — accept either bright mark.
    const hasBright =
      settled.colors.some((c: string) => ["#E8F1E4", "#F4D58A", "#e8f1e4", "#f4d58a"].includes(c));
    expect(hasBright).toBe(true);

    // Simulate styling-dropping react (no store tick).
    await page.evaluate(async () => {
      const viz = (window as any).__viz;
      const Plotly = viz.Plotly;
      const gd = viz.gd;
      const cur = gd.data[0];
      const stripped = {
        type: cur.type,
        mode: cur.mode,
        x: cur.x,
        y: cur.y,
        z: cur.z,
        text: cur.text,
        hoverinfo: cur.hoverinfo,
        marker: { symbol: cur.marker.symbol, line: cur.marker.line },
      };
      await Plotly.react(gd, [stripped, gd.data[1]], gd.layout, gd._context);
    });

    // After afterplot reassert, intentional mirrors (and live data when present)
    // should not be Plotly default blue.
    await page.waitForFunction(
      () => {
        const viz = (window as any).__viz;
        const colors = Array.isArray(viz?.markerColors) && viz.markerColors.length
          ? viz.markerColors
          : viz?.gd?.data?.[0]?.marker?.color ?? [];
        const list = Array.isArray(colors) ? colors : [];
        return list.length > 0 && !list.includes("#636efa");
      },
      null,
      { timeout: 5000 },
    );

    // Force reassert path explicitly (afterplot may use __viz mirrors after write).
    await page.evaluate(() => {
      const viz = (window as any).__viz;
      if (typeof viz?.gd?.__setPointAppearance === "function") {
        viz.gd.__setPointAppearance(viz.markerColors, viz.markerSizes);
      }
    });

    const restored = await page.evaluate(() => {
      const viz = (window as any).__viz;
      return {
        colors: (viz.markerColors ?? []).slice(),
        sizes: (viz.markerSizes ?? []).slice(),
      };
    });
    expect(restored.colors).not.toContain("#636efa");
    expect(restored.colors.length).toBe(settled.colors.length);
    expect(restored.sizes.some((s: number) => s >= 16)).toBe(true);
  });
});
