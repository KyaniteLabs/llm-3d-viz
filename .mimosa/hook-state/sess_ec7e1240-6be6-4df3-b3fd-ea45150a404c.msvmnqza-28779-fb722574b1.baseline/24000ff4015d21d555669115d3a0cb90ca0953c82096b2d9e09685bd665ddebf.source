import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173/";
const OUT = ".omx/artifacts/visual-ralph/s-plus-w5/tc-fresh";

test.describe("Visual quality captures", () => {
  test("01-landing-default @1440", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForFunction(() => (window as any).__viz?.visibleCount > 0, { timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}-01-landing-default.png` });
    expect((await page.evaluate(() => (window as any).__viz?.visibleCount))).toBeGreaterThan(0);
  });

  test("03-decide-open @1440", async ({ page }) => {
    await page.goto(`${BASE}?decide=1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => (window as any).__viz?.visibleCount > 0, { timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}-03-decide-open.png` });
  });

  test("04-cinema-on via keyboard c", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForFunction(() => (window as any).__viz?.visibleCount > 0, { timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.keyboard.press("c");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}-04-cinema-on.png` });
  });

  test("05-phone-390", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForFunction(() => (window as any).__viz?.visibleCount > 0, { timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}-05-phone-390.png` });
    await ctx.close();
  });
});
