// Fresh tastecheck capture: multiple viewports + states
import { chromium } from "@playwright/test";

const BASE = process.env.CAPTURE_URL ?? "http://localhost:5173/";
const OUT = ".omx/artifacts/visual-ralph/s-plus-w5/tc-fresh";

const shots = [
  { name: "01-landing-default", url: BASE, viewport: { width: 1440, height: 900 }, wait: 4000 },
  { name: "02-stage-crop", url: BASE, viewport: { width: 1440, height: 900 }, wait: 4000, clip: { x: 0, y: 60, width: 900, height: 600 } },
  { name: "03-decide-open", url: `${BASE}?decide=1`, viewport: { width: 1440, height: 900 }, wait: 4000 },
  { name: "04-cinema-on", url: `${BASE}?cinema=1`, viewport: { width: 1440, height: 900 }, wait: 4500 },
  { name: "05-phone-390", url: BASE, viewport: { width: 390, height: 844 }, wait: 4000 },
  { name: "06-narrow-320", url: BASE, viewport: { width: 320, height: 568 }, wait: 4000 },
  { name: "07-solo-sol", url: `${BASE}?solo=sol`, viewport: { width: 1440, height: 900 }, wait: 4000 },
];

const browser = await chromium.launch();
for (const s of shots) {
  const page = await browser.newPage({ viewport: s.viewport });
  await page.goto(s.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(s.wait);
  if (s.clip) {
    await page.screenshot({ path: `${OUT}-${s.name}.png`, clip: s.clip });
  } else {
    await page.screenshot({ path: `${OUT}-${s.name}.png`, fullPage: false });
  }
  // Capture numeric state
  const state = await page.evaluate(() => ({
    visibleCount: window.__viz?.visibleCount ?? null,
    pointCount: window.__viz?.pointCount ?? null,
    hasDisplayP3: window.__viz?.hasDisplayP3 ?? null,
  })).catch(() => null);
  console.log(`captured ${OUT}-${s.name}.png ${JSON.stringify(state)}`);
  await page.close();
}
await browser.close();
console.log("done");
