# Catalog refresh (Artificial Analysis)

## Source of truth

Rows in `data/models.v0.draft.json` come from the **public** Artificial Analysis leaderboard HTML scrape:

```bash
node scripts/refresh-catalog.mjs
# same as:
node scripts/expand-aa-multi-effort.mjs
```

Only models **already published on artificialanalysis.ai** with Intelligence Index + output speed + blended price are ingested. No invented metrics.

## Same-hour freshness

The tool does **not** auto-poll from the browser. Freshness is a **host-side scrape → rebuild → private deploy** loop:

```bash
# Example hourly cron on a machine with Tailscale + this repo:
# 7 * * * *
cd ~/workspaces/llm-3d-viz \
  && node scripts/refresh-catalog.mjs \
  && npm test \
  && npm run build \
  && rsync -az --delete dist/ vps:~/sites/llm-3d-viz/dist/ \
  && ssh vps 'docker restart llm-3d-viz'
```

Product filters still apply after scrape:

- release date ≥ `2026-01-01` (`RELEASE_FLOOR_ISO`)
- default cloud lab allowlist (`CLOUD_LABS`) unless `?catalog=all`

## Why a release can be “missing”

1. AA has not published the model / effort tier yet  
2. AA published it without all three required metrics  
3. It fails the release floor or cloud-lab filter  

Example (2026-08-05): **Qwen 3.8** is not present on the public AA models/leaderboard payload; newest Qwen rows are **Qwen3.7 Max / Plus**. When AA ships 3.8, the next refresh picks it up automatically.

## Snapshot fields

Each row’s `data_date` is set to the scrape day. Prefer re-running the script over hand-editing JSON.
