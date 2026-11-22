import { expect } from "@playwright/test";
import { test } from "./helpers/renderer-fixture";

test("Decide labels the cost and intelligence view when an eligible model lacks speed", async ({ page }) => {
  await page.goto("/?age=0&me=0&decide=1&floor=0");
  await expect(page.locator("[data-decide-title]")).toHaveText("Intelligence floor → cost × intelligence");
  await expect(page.locator("[data-decide-bias-label]")).toContainText("Prefer higher intelligence");
  const chart = page.locator("[data-decide-chart]");
  await expect(chart).toContainText("Some eligible models lack speed measurements");
  await expect(chart.getByRole("img")).toHaveAccessibleName("Cost versus intelligence scatter of eligible models");
  await expect(chart.locator(".decide-axis-label").last()).toHaveText("intelligence");
  await expect(chart.locator(".decide-chart-legend")).toContainText("log cost · linear intelligence");

  await page.locator("[data-decide-floor]").fill("100");
  await expect(page.locator("[data-decide-bias]")).toBeDisabled();
  await expect(page.locator("[data-decide-shortlist]")).toContainText("0 eligible");
});
