# Catalog auto-update (Artificial Analysis)

## Requirement

The instrument **self-updates** whenever Artificial Analysis publishes new models or
benchmark rows. It must **check at least three times per day**, scrape the public
leaderboard, and if the catalog changed: rebuild and optionally redeploy a private
origin (operator-configured `DEPLOY_HOST` / `HEALTH_URL` — no private IPs in-repo).

This is **not** a one-off “add Qwen 3.8” fetch. Every release AA publishes (with
Intelligence Index + speed + blended price) lands on the next successful run.

## Sources (multi-source, honest)

Two-layer join (see `docs/adr/0001-multi-source-catalog-join.md`):

1. **Enrich** partial AA rows + overlays in memory  
2. **Admit** only scorable triples to `data/models.v0.draft.json`

| Priority | Source | Contributes |
|----------|--------|-------------|
| 1 | AA public leaderboard / cards HTML | IQ + TPS + blended $/M (and partials for gap discovery) |
| 2 | Arena text style-control board | `arena_elo` only (effort-safe match; soft-fail) |
| 3 | OpenRouter public models API | List price overlay if AA price missing — never invents IQ/speed; derived blend labeled `derived_list_blend` |
| 4 | `data/expected-effort-ladders.json` | Expected ladders → `data/effort-gaps.generated.json` |

### Column priority (v1)

| Axis | Priority | Forbidden writers |
|------|----------|-------------------|
| `aa_intelligence_index` | AA only | Arena, OpenRouter |
| `tps` / `ttft` | AA only | Arena, OpenRouter |
| prices | AA blended → OpenRouter list/derived (labeled) | — |
| `arena_elo` | Arena only | AA invent, OpenRouter |

### Arena env flags

- `ARENA_FIXTURE=1` — use `scripts/fixtures/arena-text-style-control.snippet.html`
- `SKIP_ARENA=1` — skip Arena scrape

**Claude Fable 5:** product supports low/medium/high/xhigh/max. AA public data only scores **max** (with Opus 4.8 fallback). Missing tiers are tracked as an effort gap and shown when you solo Fable — we do **not** invent scores. When AA publishes them, the thrice-daily job ingests them automatically.

Optional paid AA API (`AA_API_KEY`) can be wired later; not configured. Join contract stays the same.

## How it works

```
cron (3×/day) → scripts/catalog-auto-update.sh
  1. node --experimental-strip-types scripts/expand-aa-multi-effort.mjs   # honest public scrape
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

## Why a model / effort can still be “missing”

1. **No scored source has published that effort tier yet** (Fable low/medium/high/xhigh on AA public as of 2026-08)  
2. Published without all three required metrics (IQ + TPS + blended $/M)  
3. Fails release floor or cloud-lab filter  
4. Product supports multi-effort, but independent benchmarks only ran one setting  

Example: **Claude Fable 5** has a full product effort ladder; AA public data only scores **max** (with Opus 4.8 fallback). The gap is tracked in `data/effort-gaps.generated.json` and shown when you solo Fable. We do **not** invent the other tiers.

Check gaps anytime:

```bash
node -e 'console.log(JSON.stringify(require("./data/effort-gaps.generated.json").fable,null,2))'
```

## Uninstall cron

```bash
crontab -l | awk '/# BEGIN llm-3d-viz-catalog-sync/{s=1;next}/# END llm-3d-viz-catalog-sync/{s=0;next}!s' | crontab -
```

## Relation to git

Cron updates **local** `data/models.v0.draft.json` + the **private VPS dist**.
Committing refreshed data to Forgejo is optional and left for a human/agent session
(`git add data/models.v0.draft.json && git commit …`) so main does not get noisy
auto-commits without review. The live private app does not wait for that commit.
