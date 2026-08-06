# Private origin deploy (optional, operator-local)

**Status:** pattern only — no hostnames or private IPs in this public tree.

For day-to-day instrumenting before or beside a public Pages deploy, operators may host
`dist/` on a private network (VPN / Tailscale / LAN) with nginx or any static server.

## Privacy model

- Bind the static server only to a private interface (not public `0.0.0.0` on the open internet).
- Do not commit private IPs, SSH aliases that encode infrastructure, or credentials into this repo.
- Prefer env vars in local shells / cron (`DEPLOY_HOST`, `HEALTH_URL`) for automation.

## Typical layout (example names only)

```
~/sites/llm-3d-viz/dist/     # static build
docker/nginx serving that volume on a private bind
```

## Redeploy from a laptop (generic)

```bash
cd /path/to/llm-3d-viz
git checkout main && git pull --ff-only
npm run build
# rsync/scp dist/ to your private host; restart your static container/service
```

## Catalog self-update (≥3×/day)

```bash
# optional local install
bash scripts/install-catalog-cron.sh

# full pipeline (scrape → build → optional deploy)
SKIP_DEPLOY=1 bash scripts/catalog-auto-update.sh   # scrape+build only
# or set DEPLOY_HOST / HEALTH_URL in the environment for private redeploy
bash scripts/catalog-auto-update.sh
```

See `docs/research/catalog-refresh.md`. Logs default to `logs/catalog-auto-update.log` (gitignored).

## Relation to public publish

Public product hosting (e.g. Cloudflare Pages + optional custom domain) is documented in
`docs/deploy/cloudflare-pages.md`. Private origins are operator-specific and not required to
fork or run the app.
