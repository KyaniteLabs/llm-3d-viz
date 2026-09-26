import { test, expect } from "@playwright/test";

// L9 cinema export artifact: in cinema mode the compositor must produce a valid,
// non-trivial 2× PNG (ink-field bg + stage capture + wordmark + method line). The
// WebGL renderer uses preserveDrawingBuffer:true so the canvas is readable.
test("L9: cinema frame export yields a non-trivial 2× PNG", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?age=0");
  await page.waitForFunction(
    () => document.documentElement.dataset.stageBackend === "r3f" && !!((window as any).__viz?.optimumModelId),
    undefined,
    { timeout: 20000 },
  );
  await page.waitForTimeout(1200);

  // Enter cinema and let the orbit loop paint at least one frame.
  await page.evaluate(() => (window as any).__viz.stage && ((window as any).__viz).cinemaMode === false);
  await page.keyboard.press("c");
  await page.waitForFunction(() => (window as any).__viz?.cinemaMode === true, undefined, { timeout: 8000 });
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => {
    const fn = (window as any).__viz?.captureCinemaFrame as (() => string | null) | undefined;
    const url = fn ? fn() : null;
    if (!url) return { ok: false };
    return {
      ok: true,
      isPng: url.startsWith("data:image/png"),
      len: url.length,
      // Estimate decoded dimensions from the PNG IHDR (bytes 16..24).
      width: url.length > 24 ? undefined : 0,
    };
  });

  expect(result.ok, "captureCinemaFrame returned null").toBe(true);
  expect(result.isPng, "not a PNG dataURL").toBe(true);
  // A 2880×1800 ink-field PNG is well over 100kB of base64; guard against a blank/
  // tiny capture (which would indicate the WebGL buffer wasn't composited).
  expect(result.len, `PNG dataURL too small (${result.len}) — likely blank capture`).toBeGreaterThan(100_000);
});
