import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("public decision view shows priced candidates and explains missing data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Choose a model by price and capability" })).toBeVisible();
  await expect(page.getByText(/No public speed measurements/)).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const provider = page.getByLabel("Provider");
  const floor = page.getByLabel("Minimum Epoch score");
  await provider.selectOption("Anthropic");
  await floor.fill("0");
  await expect(page.locator("tbody tr").first()).toContainText("Anthropic");
  await expect(page.getByRole("status")).toContainText(/without a price/i);
  await provider.selectOption("Alibaba");
  await floor.fill("100");
  await expect(page.getByRole("status")).toContainText(/lower the score floor/i);
  await expect(page.locator("tbody tr")).toHaveCount(0);
});

test("public view fits a mobile viewport and credits the data", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?utm_source=example");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("On frontier").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Data sources, method and licences" }))
    .toHaveAttribute("href", "/sources/#decision-data");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const results = page.getByRole("region", { name: "Model prices" });
  expect(await results.evaluate((element) => element.scrollWidth)).toBe(
    await results.evaluate((element) => element.clientWidth),
  );
  const loadedResources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  expect(loadedResources.filter((url) => /plotly|kokoro|onnxruntime|ort-wasm/i.test(url))).toEqual([]);
});

test("newly scored releases show the date from the Epoch row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const gpt = page.getByRole("row").filter({ hasText: "GPT-6.2 Astra" });
  await expect(gpt.locator("time")).toHaveAttribute("datetime", "2026-11-17");
  await page.getByLabel("Provider").selectOption("Google DeepMind");
  await page.getByLabel("Minimum Epoch score").fill("94");
  const hydrogen = page.getByRole("row").filter({ hasText: "Gemini 4 Hydrogen" });
  const releaseDate = hydrogen.locator("time");
  await expect(releaseDate).toHaveText("2026-11-12");
  expect(await releaseDate.evaluate((element) => element.getClientRects().length)).toBe(1);
  const catalog = new URL("../plugins/iolite-hermes/data/catalog.json", import.meta.url);
  const { generated } = JSON.parse(readFileSync(catalog, "utf8")) as { generated: string };
  await expect(page.getByText(`Snapshot ${generated}`, { exact: false })).toBeVisible();
});
