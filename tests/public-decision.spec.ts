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

test("original Decide explains missing measurements and links to the public shortlist", async ({ page }) => {
  await page.goto("/?view=observatory");
  await expect(page.locator("[data-story-line]")).toContainText("No models have measurements for all three axes");
  await expect(page.getByRole("region", { name: "Simple model picker" })
    .getByRole("link", { name: "Compare public model prices" })).toBeVisible();
  await page.locator("[data-decide-toggle]").click();
  await expect(page.locator("[data-decide-chart]")).toContainText("This catalog has no models with both a capability score and a blended price.");
  await page.getByRole("link", { name: "Compare public model prices" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("public Cinema credits the available observatory sources", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?view=observatory");
  await expect(page.locator("html")).toHaveAttribute("data-stage-backend", "r3f");
  await page.waitForFunction(() => typeof (window as any).__viz?.captureCinemaFrame === "function");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Model observatory");
  await page.locator('[data-economy-basis="task"]').click();
  await expect(heading).toHaveText("Model observatory");
  await page.keyboard.press("c");
  const method = page.locator("[data-cinema-method]");
  await expect(method).toContainText("Model observatory · sources Arena");
  const models = JSON.parse(readFileSync(new URL("../data/models.v0.draft.json", import.meta.url), "utf8")) as { data_date?: string }[];
  const latest = models.flatMap(({ data_date }) => data_date ? [data_date] : []).sort().at(-1);
  expect(latest).toBeTruthy();
  await expect(method).toContainText(`catalog ${latest}`);
  await expect(method).not.toContainText(/speed/i);
  await expect(method).not.toContainText(/Artificial Analysis|OpenRouter/);
  await expect.poll(() => method.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const exported = await page.evaluate(() => {
    const credits: string[] = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      credits.push(text);
      original.call(this, text, x, y, maxWidth);
    };
    try {
      const uri = (window as any).__viz.captureCinemaFrame() as string;
      return { createdPng: uri.startsWith("data:image/png"), credits };
    } finally {
      CanvasRenderingContext2D.prototype.fillText = original;
    }
  });
  expect(exported.createdPng).toBe(true);
  expect(exported.credits).toContain("Iolite");
  expect(exported.credits.join(" ")).toContain("Arena");
  expect(exported.credits.join(" ")).not.toMatch(/OpenRouter|speed/i);
});

test("provider filtering keeps the same frontier as the published feed", async ({ page }) => {
  await page.goto("/");
  const feed = await page.request.get("/frontier-watch.json");
  expect(feed.ok()).toBe(true);
  const { frontier } = await feed.json() as { frontier: { model: string; provider: string | null }[] };
  expect(frontier.length).toBeGreaterThan(0);

  await page.getByLabel("Minimum Epoch score").fill("0");
  const badged = page.getByRole("row").filter({ hasText: "On frontier" }).locator("td:first-child");
  await expect(badged).toHaveCount(frontier.length);
  for (const { model } of frontier) {
    await expect(badged.filter({ hasText: model })).toBeVisible();
  }

  await page.getByLabel("Provider").selectOption("Anthropic");
  const anthropic = frontier.filter(({ provider }) => provider === "Anthropic");
  expect(anthropic.length).toBeGreaterThan(0);
  await expect(badged).toHaveCount(anthropic.length);
  for (const { model } of anthropic) {
    await expect(badged.filter({ hasText: model })).toBeVisible();
  }
});

test("clearing the floor hides previous results and asks for a valid value", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("Minimum Epoch score").clear();
  await expect(page.getByRole("status")).toContainText("Enter a minimum Epoch score from 0 to 100.");
  await expect(page.getByRole("table")).toBeHidden();
});

test("a provider with no bundled prices explains the empty results", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Minimum Epoch score").fill("0");
  await page.getByLabel("Provider").selectOption("Microsoft");
  await expect(page.getByRole("status")).toContainText("Models meet this floor but have no bundled price.");
  await expect(page.getByRole("table")).toBeHidden();
});
