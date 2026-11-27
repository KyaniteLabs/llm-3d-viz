import { expect } from "@playwright/test";
import { test } from "./helpers/renderer-fixture";

test.beforeEach(async ({ page }) => {
  await page.route("**/stage-render-test", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }),
  );
  // Only replace Plotly, so the test controls when asynchronous graph operations settle.
  await page.route("**/src/viz/plotly-loader.ts", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `
      const fixture = window.plotlyFixture = { calls: [], listeners: [] };
      async function run(name) {
        fixture.calls.push(name);
        if (fixture.fail === name) {
          fixture.fail = null;
          throw new Error(name + " failed");
        }
        await fixture.hold?.(name);
      }
      const plotly = {
        async newPlot(gd) {
          await run("newPlot");
          gd.on = (event) => fixture.listeners.push(event);
        },
        react: () => run("react"),
        restyle: () => run("restyle"),
      };
      export async function loadPlotly() {
        await run("loadPlotly");
        return plotly;
      }
    `,
  }));
  await page.goto("/stage-render-test");
  await page.evaluate(async () => {
    const stageModule = "/src/viz/stage3d.ts";
    const { Stage3D } = await import(stageModule);
    const stage = new Stage3D(document.body);
    let completed = 0;
    stage.gd.addEventListener("stage:rendered", () => { completed += 1; });
    (window as any).renderFixture = {
      render: () => stage.render({ cost: 1, intelligence: 1, speed: 1 }, []),
      completed: () => completed,
    };
  });
});

for (const operation of ["loadPlotly", "newPlot", "react", "restyle"]) {
  test(`clears busy after ${operation} rejects and can render again`, async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    const completed = () => page.evaluate(() => (window as any).renderFixture.completed());
    const previousRenders = operation === "react" ? 1 : 0;

    if (previousRenders) {
      await page.evaluate(() => (window as any).renderFixture.render());
      await expect.poll(completed).toBe(previousRenders);
    }

    await page.evaluate((failedOperation) => {
      (window as any).plotlyFixture.fail = failedOperation;
      (window as any).renderFixture.render();
    }, operation);
    await expect(page.locator(".stage-3d-canvas")).not.toHaveAttribute("aria-busy", "true");
    expect(await completed()).toBe(previousRenders);

    await page.evaluate(() => (window as any).renderFixture.render());
    await expect.poll(completed).toBe(previousRenders + 1);
    expect(await page.evaluate(() => (window as any).plotlyFixture.listeners)).toContain("plotly_hover");
    expect(errors).toEqual([]);
  });
}

test("waits for a superseded initial plot and keeps the newer render busy", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  const calls = () => page.evaluate(() => (window as any).plotlyFixture.calls);
  const busyStage = page.locator(".stage-3d-canvas");

  await page.evaluate(() => {
    const { renderFixture, plotlyFixture } = window as any;
    plotlyFixture.hold = (operation: string) => {
      if (operation === "newPlot" || operation === "react") {
        return new Promise<void>((resolve) => { plotlyFixture.release = resolve; });
      }
    };
    renderFixture.render();
  });
  await expect.poll(calls).toEqual(["loadPlotly", "newPlot"]);
  const concurrentCalls = await page.evaluate(async () => {
    const { renderFixture, plotlyFixture } = window as any;
    renderFixture.render();
    await new Promise(requestAnimationFrame);
    return plotlyFixture.calls;
  });
  expect(concurrentCalls).toEqual(["loadPlotly", "newPlot"]);

  await page.evaluate(() => (window as any).plotlyFixture.release());
  await expect.poll(calls).toEqual(["loadPlotly", "newPlot", "loadPlotly", "react"]);
  await expect(busyStage).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => (window as any).renderFixture.completed())).toBe(0);

  await page.evaluate(() => (window as any).plotlyFixture.release());
  await expect(busyStage).not.toHaveAttribute("aria-busy", "true");
  const result = await page.evaluate(() => ({
    hoverListeners: (window as any).plotlyFixture.listeners.filter((name: string) => name === "plotly_hover"),
    completed: (window as any).renderFixture.completed(),
  }));
  expect(result).toEqual({ hoverListeners: ["plotly_hover"], completed: 1 });
  expect(errors).toEqual([]);
});
