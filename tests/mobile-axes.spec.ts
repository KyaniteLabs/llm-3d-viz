import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/measured-observatory";

async function axisLayout(page: Page) {
  await page.goto("/?stage=plotly&age=0");
  await page.waitForFunction(() => {
    const graph = (window as any).__viz?.gd;
    return graph?.data?.[0]?.x?.length > 0 && !!graph?.layout?.scene;
  });
  return page.evaluate(() => {
    const graph = (window as any).__viz.gd;
    return {
      width: graph.parentElement.clientWidth,
      axes: ["xaxis", "yaxis", "zaxis"].map((name) => {
        const axis = graph.layout.scene[name];
        return { title: axis.title.text, scale: axis.type, ticks: axis.tickvals as number[] };
      }),
    };
  });
}

test("Plotly shortens labels and thins ticks on a narrow stage", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const desktop = await axisLayout(page);
  expect(desktop.width).toBeGreaterThanOrEqual(460);
  expect(desktop.axes.map((axis) => axis.title)).toEqual([
    "COST ($/M) · log", "INTELLIGENCE", "SPEED (TPS) · log",
  ]);
  expect(desktop.axes.map((axis) => axis.scale)).toEqual(["log", "linear", "log"]);

  await page.setViewportSize({ width: 375, height: 760 });
  const mobile = await axisLayout(page);
  expect(mobile.width).toBeLessThan(460);
  expect(mobile.axes.map((axis) => axis.title)).toEqual(["COST", "INTELLIGENCE", "SPEED"]);
  for (const [index, axis] of mobile.axes.entries()) {
    expect(axis.scale).toBe(desktop.axes[index].scale);
    expect(axis.ticks.length).toBeGreaterThan(1);
    expect(axis.ticks.length).toBeLessThanOrEqual(3);
    expect(axis.ticks.length).toBeLessThanOrEqual(desktop.axes[index].ticks.length);
    expect(axis.ticks.every((value, i) => Number.isFinite(value) && (i === 0 || value > axis.ticks[i - 1]))).toBe(true);
  }
});
