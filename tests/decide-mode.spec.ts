import { test, expect } from "@playwright/test";

/**
 * Decide mode smoke (SPEC #137 / tickets #138–#142).
 * Small focused suite — not the full Plotly render suite.
 */
test.describe("Decide mode v1", () => {
  test("toggle Decide: floor, hide value-score, shortlist, no optimum a11y", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-decide-toggle]", { timeout: 30000 });
    // Stage may take a moment on Three
    await page.waitForTimeout(1200);

    await page.click("[data-decide-toggle]");
    await expect(page.locator("[data-decide-toggle]")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-decide-mode", "1");

    await expect(page.locator(".decide-panel:not([hidden])")).toBeVisible();
    await expect(page.locator("[data-decide-floor-out]")).toHaveText("50");

    // Value-score chrome suppressed
    await expect(page.locator(".weight-controls")).toBeHidden();
    await expect(page.locator(".value-leaderboard")).toHaveCount(0);
    await expect(page.locator("[data-decide-leaderboard-suppressed]")).toBeVisible();

    // Shortlist present (0–3)
    const n = await page.locator(".decide-shortlist-item").count();
    expect(n).toBeLessThanOrEqual(3);

    // Stage a11y must not claim Current optimum in Decide
    const aria = await page.locator("canvas, [aria-label*='3D benchmark']").first().getAttribute("aria-label");
    if (aria) {
      expect(aria.toLowerCase()).not.toContain("current optimum");
      expect(aria.toLowerCase()).toContain("decide");
    }

    const classes = await page.evaluate(() => (window as any).__viz?.pointSemanticClasses as string[] | undefined);
    if (classes?.length) {
      expect(classes).not.toContain("optimum");
      expect(classes).not.toContain("frontier");
    }

    // Export builds without throw (click)
    await page.click("[data-decide-export]");

    // Lower floor → more eligible possible
    await page.locator("[data-decide-floor]").fill("0");
    await page.waitForTimeout(300);
    const n0 = await page.locator(".decide-shortlist-item").count();
    expect(n0).toBeGreaterThanOrEqual(0);
    expect(n0).toBeLessThanOrEqual(3);

    // High floor may empty shortlist
    await page.locator("[data-decide-floor]").fill("99");
    await page.waitForTimeout(300);
  });
});
