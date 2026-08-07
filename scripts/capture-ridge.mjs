// One-off: capture the new tube Pareto ridge from the default r3f stage.
// Usage: node scripts/capture-ridge.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173/";
const OUT = ".omx/artifacts/visual-ralph/ridge-tube";

const shots = [
  { name: "ridge-default", url: BASE, wait: 3500 },
  { name: "ridge-decide", url: `${BASE}?decide=1&floor=30`, wait: 3500 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const s of shots) {
  await page.goto(s.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(s.wait);
  await page.screenshot({ path: `${OUT}-${s.name}.png` });
  console.log(`captured ${OUT}-${s.name}.png`);
}
await browser.close();
