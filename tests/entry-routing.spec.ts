import { expect, test } from "@playwright/test";

test("an old observatory link stays in the observatory after resetting its last filter", async ({ page }) => {
  await page.goto("/?age=0#stage-title");
  await page.waitForFunction(() => (window as any).__viz?.filters?.ageEnabled === false);
  await page.locator("[data-scope-edit]").click();
  await page.getByRole("checkbox", { name: /Age ≤/ }).check();
  await page.getByRole("button", { name: "Apply scope" }).click();
  await expect(page).toHaveURL(/\/\?view=observatory#stage-title$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Speed × cost × intelligence" })).toBeVisible();
});

test("the product edition opens the observatory at the root", async ({ page }) => {
  await page.route((url) => url.pathname === "/src/config/edition.ts", (route) => route.fulfill({
    contentType: "application/javascript",
    body: 'export const EDITION = "product"; export const isOssEdition = false;',
  }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Speed × cost × intelligence" })).toBeVisible();
});

for (const { view, path, chunk, heading } of [
  { view: "public decision", path: "/", chunk: "/src/ui/public-decision.ts", heading: "Choose a model by price and capability" },
  { view: "observatory", path: "/?view=observatory", chunk: "/src/main.ts", heading: "Speed × cost × intelligence" },
]) {
  test(`a failed ${view} download shows a reload control`, async ({ page }) => {
    const matchesChunk = (url: URL) => url.pathname === chunk;
    await page.route(matchesChunk, (route) => route.abort());
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Iolite could not load" })).toBeVisible();
    await expect(page.locator("#app-shell")).toBeHidden();
    await page.unroute(matchesChunk);
    await page.getByRole("button", { name: "Reload" }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  });
}
