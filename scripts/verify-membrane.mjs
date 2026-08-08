// Verify the Pareto membrane renders: structural (mesh geometry populated) +
// whiteout regression guard (canvas pixel luminance) + screenshot for vision.
// Usage: node scripts/verify-membrane.mjs   (preview server on :5173)
import { chromium } from "@playwright/test";

const BASE = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173/";
const OUT = ".omx/artifacts/visual-ralph/membrane";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);

// Structural: locate the stage surface (object with .scene under window.__viz)
// and confirm membrane + skirt meshes have populated geometry.
const probe = await page.evaluate(() => {
  const findStage = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && typeof v === "object" && v.scene && v.membraneMesh) return v;
      const nested = findStage(v);
      if (nested) return nested;
    }
    return null;
  };
  let stage = null;
  if (window.__viz) stage = findStage(window.__viz);
  if (!stage) {
    for (const k of Object.keys(window)) {
      stage = findStage(window[k]);
      if (stage) break;
    }
  }
  if (!stage) return { found: false };
  const stats = (m) => {
    if (!m) return null;
    const g = m.geometry;
    return {
      tris: g?.index ? g.index.count / 3 : 0,
      verts: g?.attributes?.position?.count ?? 0,
      visible: m.visible,
    };
  };
  return {
    found: true,
    backend: stage.__stageBackend ?? null,
    membrane: stats(stage.membraneMesh),
    skirt: stats(stage.skirtMesh),
    ridge: stats(stage.ridgeMesh),
  };
});

// Whiteout guard: read the WebGL canvas pixels, count near-white (lum > 220).
const whitePct = await page.evaluate(() => {
  let stage = null;
  const find = (o) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === "object" && v.renderer && v.scene) return v;
      if (v && typeof v === "object") { const r = find(v); if (r) return r; }
    }
    return null;
  };
  stage = find(window.__viz ?? {});
  if (!stage) for (const k of Object.keys(window)) { stage = find(window[k] ?? {}); if (stage) break; }
  if (!stage) return -1;
  const { renderer, scene, camera } = stage;
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let white = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > 220 && px[i + 1] > 220 && px[i + 2] > 220) white++;
  }
  return (white / (w * h)) * 100;
});

await page.screenshot({ path: `${OUT}-default.png` });
console.log(JSON.stringify({ probe, whitePct }, null, 2));
await browser.close();
