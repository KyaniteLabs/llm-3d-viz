#!/usr/bin/env node
/**
 * Public-page scrape of AA Intelligence Index cost/time per task into models.v0.draft.json.
 * Honest extraction only — no synthesis from $/M.
 *
 * Usage: node scripts/scrape-aa-task-metrics.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data/models.v0.draft.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

function extractCurrentModel(html) {
  const marker = '\\"currentModel\\":{';
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  let i = idx + marker.length - 1; // at {
  let depth = 0;
  let inStr = false;
  let j = i;
  while (j < html.length) {
    if (html.slice(j, j + 2) === '\\"') {
      inStr = !inStr;
      j += 2;
      continue;
    }
    if (!inStr) {
      if (html[j] === "{") depth += 1;
      else if (html[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    j += 1;
  }
  const unescaped = html.slice(i, j).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return JSON.parse(unescaped);
}

function costTotal(cm) {
  const block = cm.intelligenceIndexCostPerTask ?? cm.costPerIntelligenceIndexTask;
  if (typeof block === "number") return block;
  if (block && typeof block === "object") {
    if (typeof block.total === "number") return block.total;
    if (block.cost && typeof block.cost.total === "number") return block.cost.total;
  }
  return null;
}

function timePerTask(cm) {
  const t = cm.intelligenceIndexTimePerTask ?? cm.timePerTask;
  return typeof t === "number" ? t : null;
}

const models = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const today = new Date().toISOString().slice(0, 10);
let withCost = 0;
let withTime = 0;

for (const row of models) {
  process.stdout.write(`scrape ${row.model.slice(0, 40)}… `);
  try {
    const html = await fetchHtml(row.source_url);
    const cm = extractCurrentModel(html);
    if (!cm) {
      console.log("no currentModel");
      continue;
    }
    const cost = costTotal(cm);
    const time = timePerTask(cm);
    row.cost_per_index_task_usd = cost != null && cost > 0 ? Number(cost.toFixed(6)) : null;
    row.time_per_index_task_s = time != null && time > 0 ? Number(time.toFixed(3)) : null;
    row.data_date = today;
    if (row.cost_per_index_task_usd != null) withCost += 1;
    if (row.time_per_index_task_s != null) withTime += 1;
    console.log(`cost=${row.cost_per_index_task_usd} time=${row.time_per_index_task_s}`);
  } catch (err) {
    console.log("ERR", err.message);
  }
}

fs.writeFileSync(dataPath, `${JSON.stringify(models, null, 2)}\n`);
console.log(`done · cost ${withCost}/${models.length} · time ${withTime}/${models.length}`);
