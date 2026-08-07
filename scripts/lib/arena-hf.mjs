/**
 * Arena leaderboard Elo via official Hugging Face dataset (CC BY 4.0).
 *
 * Dataset: https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset
 * Config: text_style_control · split: latest
 * License: CC BY 4.0 — attribute Arena / LM Arena when displaying Elo.
 *
 * Does NOT scrape arena.ai HTML (ToS forbids programmatic page scrape).
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const ARENA_HF_DATASET = "lmarena-ai/leaderboard-dataset";
export const ARENA_HF_CONFIG = "text_style_control";
/** Direct parquet URL for latest text style-control board (HF datasets server). */
export const ARENA_HF_PARQUET_URL =
  "https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset/parquet/text_style_control/latest/0.parquet";

export const ARENA_UA = "llm-3d-viz-catalog/0.1 (+https://viz.kyanitelabs.tech; HF parquet CC-BY-4.0)";

/**
 * Convert HF leaderboard row → shape expected by parseArenaIdentity / applyArenaElo.
 * @param {object} row
 */
export function hfRowToArenaEntry(row) {
  const name = String(row.model_name || "").trim();
  if (!name) return null;
  const category = String(row.category || "overall").toLowerCase();
  // Style-control overall is the product Elo surface we historically used.
  if (category && category !== "overall") return null;
  const rating = Number(row.rating);
  if (!Number.isFinite(rating)) return null;
  return {
    modelDisplayName: name,
    modelKey: name,
    modelOrganization: row.organization || "",
    rating,
    _source: "hf-leaderboard-dataset",
    _publish_date: row.leaderboard_publish_date || null,
  };
}

/**
 * Download parquet and parse rows via pyarrow if available, else duckdb-free path with parquet-wasm not assumed.
 * Prefer Node + optional `parquetjs` / fall back to spawning python if pyarrow present.
 *
 * @returns {Promise<{ ok: boolean, entries: object[], error?: string, path?: string }>}
 */
export async function fetchArenaEntriesFromHf(options = {}) {
  if (process.env.SKIP_ARENA === "1") {
    return { ok: true, skipped: true, entries: [], error: null };
  }

  const fixture = options.fixturePath || process.env.ARENA_HF_FIXTURE;
  if (fixture && fs.existsSync(fixture)) {
    const raw = JSON.parse(fs.readFileSync(fixture, "utf8"));
    const rows = Array.isArray(raw) ? raw : raw.rows || raw.data || [];
    const entries = rows.map(hfRowToArenaEntry).filter(Boolean);
    return { ok: true, skipped: false, entries, path: fixture };
  }

  const url = options.url || ARENA_HF_PARQUET_URL;
  const cacheDir = options.cacheDir || path.join(process.cwd(), "data");
  const cachePath = path.join(cacheDir, "arena-text-style-control-latest.parquet");

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ARENA_UA, Accept: "application/octet-stream,*/*" },
    });
    if (!res.ok) {
      return { ok: false, entries: [], error: `${url} → ${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, buf);

    const rows = await readParquetRows(cachePath);
    const entries = rows.map(hfRowToArenaEntry).filter(Boolean);
    return { ok: true, skipped: false, entries, path: cachePath, rowCount: rows.length };
  } catch (err) {
    return { ok: false, entries: [], error: String(err) };
  }
}

/**
 * Read parquet into array of plain objects.
 * Uses python+pyarrow (available on this host); pure-node fallback tries parquetjs if installed.
 */
async function readParquetRows(filePath) {
  // Try dynamic import of parquet-wasm / hyparquet not assumed — use python helper.
  const { spawnSync } = await import("node:child_process");
  const py = `
import json, sys
try:
  import pyarrow.parquet as pq
  t = pq.read_table(${JSON.stringify(filePath)})
  print(json.dumps(t.to_pylist()))
except Exception as e:
  print(json.dumps({"__error__": str(e)}))
  sys.exit(1)
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    // last resort: empty
    throw new Error(r.stderr || r.stdout || "parquet read failed");
  }
  const data = JSON.parse(r.stdout);
  if (data && data.__error__) throw new Error(data.__error__);
  if (!Array.isArray(data)) throw new Error("parquet json not array");
  return data;
}
