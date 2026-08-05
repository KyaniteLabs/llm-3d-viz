# Catalog auto-update (Artificial Analysis)

## Requirement

The instrument **self-updates** whenever Artificial Analysis publishes new models or
benchmark rows. It must **check at least three times per day**, scrape the public
leaderboard, and if the catalog changed: rebuild and redeploy the private Tailscale
instance (`http://100.92.68.103:4242/`).

This is **not** a one-off “add Qwen 3.8” fetch. Every release AA publishes (with
Intelligence Index + speed + blended price) lands on the next successful run.

## How it works

```
cron (3×/day) → scripts/catalog-auto-update.sh
  1. node scripts/expand-aa-multi-effort.mjs   # honest public scrape
  2. if data/models.v0.draft.json hash changed:
       npm run build
       rsync dist/ → vps:~/sites/llm-3d-viz/dist/
       docker restart llm-3d-viz
       health-check :4242
  3. write .cache/catalog-sync/last-status.json + logs/
```

Product filters still apply after scrape:

- release date ≥ `2026-01-01` (`RELEASE_FLOOR_ISO`)
- default cloud lab allowlist (`CLOUD_LABS`) unless `?catalog=all`

## Install (laptop / always-on Mac with Tailscale + ssh `vps`)

```bash
cd ~/workspaces/llm-3d-viz
bash scripts/install-catalog-cron.sh
```

Default schedule (**local time**): **06:07, 14:07, 22:07** (three checks every day).

Manual run:

```bash
bash scripts/catalog-auto-update.sh
# scrape only:
SKIP_BUILD=1 SKIP_DEPLOY=1 bash scripts/catalog-auto-update.sh
# force rebuild/deploy even if hash unchanged:
FORCE=1 bash scripts/catalog-auto-update.sh
```

## Logs & status

| Path | Purpose |
|------|---------|
| `logs/catalog-auto-update.log` | Structured run log |
| `logs/catalog-cron.stdout` | Cron wrapper stdout/stderr |
| `.cache/catalog-sync/last-status.json` | Last result (`ok`, `changed`, `rows`, `hash`) |
| `.cache/catalog-sync/last-data.sha256` | Last successful data hash |

```bash
tail -50 logs/catalog-auto-update.log
cat .cache/catalog-sync/last-status.json
```

## Why a model can still be “missing”

1. AA has not published the model / effort tier yet  
2. AA published it without all three required metrics  
3. It fails the release floor or cloud-lab filter  

Example: if “Qwen 3.8” is not on the AA public leaderboard payload, no scrape can invent it.
When AA ships it, the next of the three daily runs picks it up automatically.

## Uninstall cron

```bash
crontab -l | awk '/# BEGIN llm-3d-viz-catalog-sync/{s=1;next}/# END llm-3d-viz-catalog-sync/{s=0;next}!s' | crontab -
```

## Relation to git

Cron updates **local** `data/models.v0.draft.json` + the **private VPS dist**.
Committing refreshed data to Forgejo is optional and left for a human/agent session
(`git add data/models.v0.draft.json && git commit …`) so main does not get noisy
auto-commits without review. The live private app does not wait for that commit.
