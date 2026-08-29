import { test, expect } from "@playwright/test";

// L3 living stage: catalog-arrival diff. First visit = no pulse; a returning visit
// with new ids shows "N new since <date>". Verifies the localStorage I/O path the
// unit suite (no DOM) cannot cover.
const KEY = "llm3d:lastCatalog";
test.describe.configure({ mode: "serial" });

test("first visit: no new-since line (no baseline → suppress)", async ({ page }) => {
  await page.addInitScript((k) => localStorage.removeItem(k), KEY);
  await page.goto("/?age=0");
  await page.waitForFunction(() => document.documentElement.dataset.stageBackend === "r3f", undefined, {
    timeout: 20000,
  });
  await page.waitForTimeout(600);
  await expect(page.locator("[data-new-since]")).toBeHidden();
  // Baseline is written on first visit so the next visit has something to diff.
  const saved = await page.evaluate((k) => localStorage.getItem(k), KEY);
  expect(saved, "baseline snapshot written on first visit").toBeTruthy();
});

test("returning visit with new ids: shows N new since <date>", async ({ page }) => {
  // Load once so the app writes the full-catalog baseline, then truncate it to ~1/3
  // with an old date so the rest register as new on the next visit.
  await page.goto("/?age=0");
  await page.waitForFunction(() => document.documentElement.dataset.stageBackend === "r3f", undefined, {
    timeout: 20000,
  });
  await page.waitForTimeout(500);
  const realIds = (await page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw).ids as string[]) : [];
  }, KEY)) as string[];
  const oldBaseline = realIds.slice(0, Math.max(1, Math.floor(realIds.length / 3)));
  await page.evaluate(
    ({ k, ids }) => localStorage.setItem(k, JSON.stringify({ ids, date: "2026-01-01" })),
    { k: KEY, ids: oldBaseline },
  );

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.stageBackend === "r3f", undefined, {
    timeout: 20000,
  });
  await page.waitForTimeout(800);

  const newSince = page.locator("[data-new-since]");
  await expect(newSince).toBeVisible();
  await expect(newSince).toContainText(/new since 2026-01-01/);
  const newCount = await page.evaluate(
    () => ((window as any).__viz?.newModelIds as string[])?.length ?? -1,
  );
  expect(newCount, "newModelIds populated on __viz").toBeGreaterThan(0);
});
