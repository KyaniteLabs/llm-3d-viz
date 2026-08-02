import { chromium } from "playwright";
import { copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseURL = process.env.T7_BASE_URL ?? "http://127.0.0.1:5173";
const outputDir = resolve("docs/gate/t7");
const viewport = { width: 1440, height: 900 };

function rgb(value) {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((part) => part + part).join("") : hex;
    return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
  }
  const channels = value.match(/^rgba?\(([^)]+)\)$/i)?.[1].split(",").slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Unsupported color token: ${value}`);
  return channels;
}

function luminance(channels) {
  return channels.map((channel) => {
    const unit = channel / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(rgb(foreground)), luminance(rgb(background))].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

async function ready(page) {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__viz !== undefined);
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function codingPreset(page) {
  await page.locator('[data-preset="coding"]').click();
  await page.waitForTimeout(550);
}

async function captureAccent(browser, filename, accent) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await ready(page);
  if (accent) await page.evaluate(({ filament, filamentDim }) => {
    document.documentElement.style.setProperty("--filament", filament);
    document.documentElement.style.setProperty("--filament-dim", filamentDim);
  }, accent);
  await codingPreset(page);
  // The app's current sweep palette is literal; recolor only this rendered
  // capture from the token values, leaving source tokens and code untouched.
  await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const filament = style.getPropertyValue("--filament").trim();
    const filamentDim = style.getPropertyValue("--filament-dim").trim();
    const plots = [window.__viz.gd, ...window.__viz.projections.gds];
    return Promise.all(plots.flatMap((gd) => {
      const colors = [...gd.data[0].marker.color].map((color, index) =>
        gd.data[0].marker.size[index] === 16 ? filament : color === "#C9D4C4" ? filamentDim : color,
      );
      const updates = [window.__viz.Plotly.restyle(gd, { "marker.color": [colors] }, [0])];
      if (gd.data[1]?.line) updates.push(window.__viz.Plotly.restyle(gd, { "line.color": filament }, [1]));
      return updates;
    }));
  });
  await page.screenshot({ path: resolve(outputDir, filename) });
  await context.close();
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await ready(page);
  await page.waitForTimeout(550);
  await page.screenshot({ path: resolve(outputDir, "stage-full.png") });

  await page.locator("#weight-cost").fill("9");
  await page.waitForTimeout(100);
  await page.screenshot({ path: resolve(outputDir, "sweep-mid.png") });
  await page.waitForTimeout(350);

  await page.locator("[data-cinema-toggle]").click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: resolve(outputDir, "cinema.png") });

  const contrastTokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      ink: style.getPropertyValue("--ink-field").trim(),
      muted: style.getPropertyValue("--text-muted").trim(),
      filament: style.getPropertyValue("--filament").trim(),
    };
  });
  await writeFile(resolve(outputDir, "contrast.txt"), [
    `--text-muted (${contrastTokens.muted}) on --ink-field (${contrastTokens.ink}): ${contrast(contrastTokens.muted, contrastTokens.ink).toFixed(2)}:1`,
    `--filament (${contrastTokens.filament}) on --ink-field (${contrastTokens.ink}): ${contrast(contrastTokens.filament, contrastTokens.ink).toFixed(2)}:1`,
  ].join("\n") + "\n");
  await context.close();

  const feed = await browser.newContext({ viewport: { width: 320, height: 400 } });
  const feedPage = await feed.newPage();
  await ready(feedPage);
  await feedPage.screenshot({ path: resolve(outputDir, "feed-320.png") });
  await feed.close();

  await captureAccent(browser, "accent-white.png");
  await captureAccent(browser, "accent-gold.png", { filament: "#D6A84B", filamentDim: "#D6A84B" });

  const videoContext = await browser.newContext({ viewport, recordVideo: { dir: outputDir, size: viewport } });
  const videoPage = await videoContext.newPage();
  await ready(videoPage);
  await videoPage.locator("#weight-cost").fill("9");
  await videoPage.waitForTimeout(550);
  await videoPage.locator("[data-cinema-toggle]").click();
  await videoPage.waitForTimeout(10_000);
  const videoPath = await videoPage.video().path();
  await videoContext.close();
  await rename(videoPath, resolve(outputDir, "dry-run.webm"));
} finally {
  await browser.close();
}
