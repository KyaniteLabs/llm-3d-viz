import { test, expect } from "@playwright/test";

// Audit F-001/F-002 (W7 L7): at ≤390px, left chips must not sever into slivers
// and the stage must hold ≥52vh. Verify against current build (audit was on a
// stale deploy).
test("mobile 390: no severed chips + stage holds ≥52vh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?age=0");
  await page.waitForFunction(
    () => document.documentElement.dataset.stageBackend === "r3f",
    { timeout: 20000 },
  );
  await page.waitForTimeout(1000);

  const report = await page.evaluate(() => {
    const vh = window.innerHeight;
    const stage = document.querySelector(".stage-visual, .stage") as HTMLElement | null;
    const stageH = stage?.getBoundingClientRect().height ?? 0;
    // Family chip row + left rail elements that "sever" when clipped.
    const chips = [...document.querySelectorAll<HTMLElement>(
      ".family-chip, .family-chip-row, .nav-stepper, .value-leaderboard",
    )];
    const vw = window.innerWidth;
    const severed = chips
      .map((el) => {
        const r = el.getBoundingClientRect();
        // Severed = partially off the viewport edge (sliver) while still rendered.
        // Viewport frame only (F7) — offsetParent is the offset ancestor, not the clip.
        const offLeft = r.left < -4 || r.right < 8;
        const offRight = r.left > vw - 8;
        const clippedWidth = r.width > 0 && r.width < 24 && r.height > 8;
        return {
          cls: el.className.slice(0, 40),
          visible: r.width > 0 && r.height > 0,
          offLeft,
          offRight,
          clippedWidth,
          w: Math.round(r.width),
        };
      })
      .filter((c) => c.visible && (c.offLeft || c.offRight || c.clippedWidth));
    return { vh, stageVh: stageH / vh, stageH, severed };
  });

  expect(report.stageVh, `stage only ${report.stageVh.toFixed(2)}vh (<0.52)`).toBeGreaterThanOrEqual(0.52);
  expect(report.severed, `severed/clipped chips: ${JSON.stringify(report.severed)}`).toEqual([]);
});
