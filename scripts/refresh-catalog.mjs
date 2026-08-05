#!/usr/bin/env node
/**
 * Refresh models.v0.draft.json from Artificial Analysis public leaderboard.
 *
 * Scrape-only. For the self-updating loop (scrape → build-if-changed → private
 * deploy, ≥3×/day), use:
 *   bash scripts/install-catalog-cron.sh   # once
 *   bash scripts/catalog-auto-update.sh    # manual full run
 *
 * Honest scrape only — rows appear when AA publishes them.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expand = path.join(root, "scripts/expand-aa-multi-effort.mjs");
const r = spawnSync(process.execPath, [expand], { cwd: root, stdio: "inherit" });
process.exit(r.status ?? 1);
