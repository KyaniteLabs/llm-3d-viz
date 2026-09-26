#!/usr/bin/env node
/**
 * Red-capable smoke for "site is blank / broken".
 * Exit 0 = stage paint healthy. Exit 1 = blank/broken.
 *
 * Usage:
 *   node scripts/qa-blank-stage.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] || `https://viz.kyanitelabs.tech/?qa=${Date.now()}`;
const FAIL = [];
const WARN = [];

function fail(msg) {
  FAIL.push(msg);
}
function warn(msg) {
  WARN.push(msg);
}

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--no-sandbox", "--disable-http-cache", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
const reqFails = [];
page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
page.on("requestfailed", (r) => {
  const u = r.url();
  if (u.includes("/assets/") || u.endsWith(".js") || u.endsWith(".css")) {
    reqFails.push(`${u} :: ${r.failure()?.errorText || "fail"}`);
  }
});

let status = 0;
try {
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  status = resp?.status() || 0;
  if (status !== 200) fail(`HTTP ${status}`);
} catch (e) {
  fail(`goto: ${e.message}`);
}

await page.waitForTimeout(4500);

const d = await page.evaluate(() => {
  const canvas = document.querySelector(".stage-visual canvas, canvas");
  const ph = document.querySelector(".stage-placeholder");
  const visual = document.querySelector(".stage-visual");
  const boot = document.querySelector("[data-boot-fail]");
  let lit = 0;
  let mean = 0;
  let readOk = false;
  if (canvas && canvas.width > 2 && canvas.height > 2) {
    try {
      const off = document.createElement("canvas");
      off.width = 120;
      off.height = 120;
      const ctx = off.getContext("2d");
      ctx.drawImage(canvas, 0, 0, 120, 120);
      const data = ctx.getImageData(0, 0, 120, 120).data;
      let sum = 0;
      const n = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const v = data[i] + data[i + 1] + data[i + 2];
        sum += v;
        if (v > 40) lit++;
      }
      mean = sum / n;
      readOk = true;
    } catch (e) {
      return { readError: String(e) };
    }
  }
  const phStyle = ph ? getComputedStyle(ph) : null;
  const phBlocking =
    ph &&
    phStyle &&
    phStyle.display !== "none" &&
    phStyle.visibility !== "hidden" &&
    Number(phStyle.opacity || "1") > 0.05 &&
    !ph.hasAttribute("hidden");

  return {
    title: document.title,
    bodyLen: (document.body?.innerText || "").length,
    hasAppShell: !!document.querySelector(".app-shell"),
    js: document.querySelector('script[type="module"]')?.src || "",
    canvas: canvas
      ? {
          w: canvas.width,
          h: canvas.height,
          clientW: canvas.clientWidth,
          clientH: canvas.clientHeight,
        }
      : null,
    visual: visual
      ? {
          w: visual.clientWidth,
          h: visual.clientHeight,
          ready: visual.classList.contains("is-ready"),
        }
      : null,
    mean,
    lit,
    readOk,
    phBlocking,
    phText: ph?.textContent?.trim()?.slice(0, 80) || null,
    bootFail: !!boot,
    vizN: window.__viz?.visibleCount ?? null,
    vizStage: !!window.__viz?.stage,
    cinema: !!window.__viz?.cinemaMode,
    story: document.querySelector("[data-story-line]")?.textContent?.slice(0, 60) || null,
  };
});

// Assertions — user symptom: blank / broken
if (!d.hasAppShell) fail("no .app-shell");
if ((d.bodyLen || 0) < 200) fail(`body text too short (${d.bodyLen}) — looks empty`);
if (!d.canvas) fail("no canvas element");
if (d.canvas && (d.canvas.clientW < 100 || d.canvas.clientH < 100)) {
  fail(`canvas CSS size too small ${d.canvas.clientW}x${d.canvas.clientH}`);
}
if (d.canvas && (d.canvas.w < 32 || d.canvas.h < 32)) {
  fail(`canvas buffer too small ${d.canvas.w}x${d.canvas.h}`);
}
if (d.visual && d.visual.h < 100) fail(`stage-visual height ${d.visual.h} — collapsed`);
if (d.phBlocking) fail(`placeholder still covering stage: "${d.phText}"`);
if (d.bootFail) fail("boot-fail banner visible");
if (d.vizN == null) fail("__viz.visibleCount missing — app did not boot instrument state");
if (typeof d.vizN === "number" && d.vizN < 1) fail(`zero models visible (${d.vizN})`);
if (d.readOk && d.lit < 50) fail(`canvas nearly black: lit=${d.lit} mean=${d.mean?.toFixed?.(1)}`);
if (d.readOk && d.mean < 8) fail(`canvas mean luminance too low (${d.mean}) — blank black`);
if (pageErrors.length) fail(`pageerror: ${pageErrors.slice(0, 3).join(" | ")}`);
if (reqFails.length) fail(`asset request failed: ${reqFails.slice(0, 3).join(" | ")}`);
if (!d.vizStage) warn("no __viz.stage");
if (d.visual && !d.visual.ready) warn("stage-visual missing is-ready class");

const out = {
  url,
  status,
  pass: FAIL.length === 0,
  FAIL,
  WARN,
  pageErrors,
  reqFails,
  d,
};
console.log(JSON.stringify(out, null, 2));
await page.screenshot({
  path: new URL("../docs/v1/wayfinder/qa-blank-stage.png", import.meta.url).pathname,
  fullPage: false,
});
await browser.close();
process.exit(FAIL.length ? 1 : 0);
