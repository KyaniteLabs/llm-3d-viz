#!/usr/bin/env node
/**
 * Refresh models.v0.draft.json from Artificial Analysis public leaderboard.
 *
 * Run manually:  node scripts/refresh-catalog.mjs
 * Cron example (hourly on a host with network):
 *   7 * * * * cd /path/to/llm-3d-viz && node scripts/refresh-catalog.mjs && npm run build && rsync -az --delete dist/ vps:~/sites/llm-3d-viz/dist/ && ssh vps 'docker restart llm-3d-viz'
 *
 * Honest scrape only — rows appear when AA publishes them. If a release is not
 * on artificialanalysis.ai yet, it will not appear here.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expand = path.join(root, "scripts/expand-aa-multi-effort.mjs");
const r = spawnSync(process.execPath, [expand], { cwd: root, stdio: "inherit" });
process.exit(r.status ?? 1);
