import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";

/**
 * V01 pixel-level regression: display-P3 whiteout.
 *
 * tokens.css activates `color(display-p3 …)` overrides under
 * `@supports (color: color(display-p3 1 1 1))`, which modern Chrome satisfies.
 * Before the resolveColorToken() fix, the raw P3 strings reached Plotly's
 * legacy colour parser, which couldn't parse them → panels defaulted to white.
 *
 * This test screenshots the projection panels and the 3D stage, then computes
 * the percentage of near-white pixels.  A healthy dark-themed render sits
 * around ~1–3 % specular highlights.  A whiteout pushes it past 50 %.
 */

const WHITE_THRESHOLD = 240; // r,g,b all ≥ this → "white"
const HEALTHY_WHITE_PCT = 5; // upper bound for non-whiteout render

async function whitePct(buf: Buffer): Promise<number> {
  const { data, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  let white = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD) {
      white++;
    }
  }
  return (white / px) * 100;
}

async function waitForStageReady(page: Page, timeoutMs = 20_000): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(
    () => {
      const v = (window as any).__viz;
      return v?.visibleCount != null && v.visibleCount > 0 && v.pointCount > 0;
    },
    { timeout: timeoutMs },
  );
  // Give Plotly + Three extra paint cycles to settle colours.
  await page.waitForTimeout(2000);
}

/** Wait until each projection panel has a Plotly SVG (content actually injected). */
async function waitForProjectionsRendered(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const panels = document.querySelectorAll(".projection.panel");
      if (panels.length < 3) return false;
      for (const p of panels) {
        if (!p.querySelector("svg.main-svg")) return false;
      }
      return true;
    },
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(1000); // extra settle for Plotly animations
}

test.describe("V01 display-P3 whiteout pixel regression", () => {
  test("3D stage is not whiteout", async ({ page }) => {
    test.setTimeout(45_000);
    await waitForStageReady(page);
    const stage = page.locator(".stage-visual");
    const buf = await stage.screenshot();
    const pct = await whitePct(buf);
    // eslint-disable-next-line no-console
    console.log(`[viz-pixel] 3D stage whitePct = ${pct.toFixed(2)}%`);
    expect(pct).toBeLessThan(HEALTHY_WHITE_PCT);
  });

  test("projection panels are not whiteout", async ({ page }) => {
    test.setTimeout(60_000);
    await waitForStageReady(page);
    // Projections are visible in 3D mode (hidden only in table mode).
    await waitForProjectionsRendered(page);

    const panels = page.locator(".projection.panel");
    const count = await panels.count();
    expect(count).toBe(3);

    for (let i = 0; i < count; i++) {
      const buf = await panels.nth(i).screenshot({ timeout: 10_000 });
      const pct = await whitePct(buf);
      // eslint-disable-next-line no-console
      console.log(`[viz-pixel] projection[${i}] whitePct = ${pct.toFixed(2)}%`);
      expect(pct).toBeLessThan(HEALTHY_WHITE_PCT);
    }
  });

  test("Plotly layout colours are sRGB hex, not raw display-p3", async ({ page }) => {
    test.setTimeout(45_000);
    await waitForStageReady(page);
    const colours = await page.evaluate(() => {
      const results: Record<string, string> = {};
      const gd = (window as any).__viz?.gd;
      if (gd?.layout) {
        results.paper_bgcolor = String(gd.layout.paper_bgcolor ?? "");
        results.plot_bgcolor = String(gd.layout.plot_bgcolor ?? "");
      }
      return results;
    });
    // Every Plotly colour must be a plain hex — no "color(display-p3" leak.
    for (const [key, val] of Object.entries(colours)) {
      expect(val, `${key} should be hex`).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(val, `${key} must not contain display-p3`).not.toContain("display-p3");
    }
  });
});
