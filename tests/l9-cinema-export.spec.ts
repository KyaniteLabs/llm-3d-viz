import { test, expect } from "./helpers/measured-observatory";

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

  const image = await page.evaluate(() => (window as any).__viz.captureCinemaFrame() as string);
  expect(image).toMatch(/^data:image\/png;base64,/);
  const png = Buffer.from(image.split(",")[1], "base64");
  expect(png.byteLength).toBeGreaterThan(100_000);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2880, 1800]);
});
