import { test as publicTest, expect } from "@playwright/test";
import { test as measuredTest } from "./helpers/measured-observatory";

publicTest.describe("Public catalog captures", () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    publicTest(`public decision at ${viewport.width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Choose a model by price and capability" })).toBeVisible();
      await expect(page.getByRole("table")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("public-decision.png"), animations: "disabled" });
    });
  }
});

measuredTest.describe("Measured Observatory captures", () => {
  measuredTest.use({ viewport: { width: 1440, height: 900 } });

  measuredTest("Decide share link", async ({ page }, testInfo) => {
    await page.goto("/?decide=1&age=0&floor=52&families=Fixture%20Family%2003");
    await expect(page.locator(".decide-panel")).toBeVisible();
    await expect(page.getByRole("img", { name: "Cost versus speed scatter of eligible models" })).toBeVisible();
    await expect(page.locator("[data-shortlist-pin]").first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("observatory-decide.png"), animations: "disabled" });
  });

  measuredTest("Cinema keyboard control", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/?age=0&me=1");
    await page.waitForFunction(() => (window as any).__viz?.pointCount > 0 && (window as any).__viz?.projectionsInstance);
    await page.keyboard.press("c");
    await expect(page.locator("[data-cinema-method]")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("observatory-cinema.png"), animations: "disabled" });
  });
});
