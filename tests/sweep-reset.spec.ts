import { test, expect, type Page } from "@playwright/test";

/**
 * FIX-D (#29): marker-reset hardening regression spec.
 *
 * Root cause: the sweep scheduler re-asserts its marker appearance only on store
 * ticks. On any weight-UNCHANGED tick, main.ts's render subscriber re-applies the
 * stage trace via Plotly.react with a trace that OMITS marker.color/size (the
 * `isInitialized ? {} : {color,size}` shape), and the scheduler then fires a
 * single synchronous reassert restyle. Both are async Plotly ops — if the react
 * redraw lands AFTER that restyle, the color-less trace wins and markers revert to
 * Plotly's default palette until the next weight change (which self-heals because
 * the sweep's ongoing writes dominate). Intermittent because Plotly op scheduling
 * is timing/load-dependent.
 *
 * This spec isolates the recovery invariant: after the sweep settles, a
 * styling-dropping Plotly.react is fired OUTSIDE any store tick (so the store-tick
 * reassert cannot rescue it). Only a plotly_afterplot listener can restore the
 * appearance. Fails (markers stay Plotly default) without the afterplot hardening.
 */
async function waitForSweepSettled(page: Page, timeoutMs = 5000): Promise<void> {
  await page.waitForFunction(
    () => ((window as any).__viz?.gd?.data?.[0]?.marker?.size ?? []).includes(16),
    null,
    { timeout: timeoutMs },
  );
}

test.describe("FIX-D #29 marker-reset hardening", () => {
  test("plotly_afterplot restores sweep-owned marker appearance after a styling-dropping react", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz);
    await waitForSweepSettled(page);

    // Snapshot the settled appearance the sweep owns.
    const settled = await page.evaluate(() => {
      const m = (window as any).__viz.gd.data[0].marker;
      return { colors: [...m.color], sizes: [...m.size] };
    });
    expect(settled.colors).toContain("#E8F1E4"); // filament optimum present
    expect(settled.colors).not.toContain("#636efa"); // not Plotly default

    // Simulate the race outcome: a Plotly.react that re-applies the stage trace
    // WITHOUT marker.color/size — exactly the shape stage.render() supplies on
    // every post-init re-render. Fired with no store tick, so the store-tick
    // reassert cannot intervene; only an afterplot listener can recover it.
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

    // After the listened plotly_afterplot, the appearance is restored to exactly
    // the settled sweep state — not Plotly default. (Without the afterplot
    // listener the react's color-less trace wins and this times out — verified
    // RED pre-fix.) The restore lands within the react's own resolution, so we
    // simply assert the terminal state here.
    await page.waitForFunction(
      () => ((window as any).__viz.gd.data[0].marker.color ?? []).includes("#E8F1E4"),
      null,
      { timeout: 3000 },
    );
    const restored = await page.evaluate(() => {
      const m = (window as any).__viz.gd.data[0].marker;
      return { colors: [...m.color], sizes: [...m.size] };
    });
    expect(restored.colors).not.toContain("#636efa");
    expect(restored.colors).toEqual(settled.colors);
    expect(restored.sizes).toEqual(settled.sizes);
  });
});
