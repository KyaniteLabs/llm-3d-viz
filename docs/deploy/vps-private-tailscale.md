# Private deploy — Tailscale-only (VPS `srv1542844`)

**Status:** live for Simon-only use (not public internet).

**URL (Tailscale):** http://100.92.68.103:4242/  
**Host:** `vps` / `srv1542844` · bind `100.92.68.103:4242` only (not `0.0.0.0`)

## Privacy model

- Docker publishes nginx **only** on the Tailscale IP.
- Public NIC / `:80` / `:443` do **not** expose this app.
- Reachable from devices on Simon’s tailnet (Mac, phone with Tailscale, etc.).
- Not Cloudflare Pages; no public DNS for this instance.

## Layout on VPS

```
~/sites/llm-3d-viz/dist/     # static build
~/sites/llm-3d-viz/nginx.conf
docker: llm-3d-viz  (nginx:alpine, restart unless-stopped)
```

## Redeploy from laptop

```bash
cd ~/workspaces/llm-3d-viz
git checkout main && git pull --ff-only
npm run build
rsync -az --delete dist/ vps:~/sites/llm-3d-viz/dist/
ssh vps 'docker restart llm-3d-viz'
```

## Catalog self-update (≥3×/day)

New AA models/benchmarks are pulled automatically — not one-off fetches.

```bash
# install once (cron 06:07 / 14:07 / 22:07 local)
bash scripts/install-catalog-cron.sh

# or full pipeline now
bash scripts/catalog-auto-update.sh
```

See `docs/research/catalog-refresh.md`. Logs: `logs/catalog-auto-update.log`.

## First-time (already done 2026-08-04)

```bash
# bind only Tailscale IP
docker run -d --name llm-3d-viz --restart unless-stopped \
  -p 100.92.68.103:4242:80 \
  -v "$HOME/sites/llm-3d-viz/dist:/usr/share/nginx/html:ro" \
  -v "$HOME/sites/llm-3d-viz/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine
```

## Stop / remove

```bash
ssh vps 'docker rm -f llm-3d-viz'
```

## Relation to public publish

Public `viz.kyanitelabs.tech` remains **approval-gated** (`docs/deploy/cloudflare-pages.md`).  
This private instance is for instrumenting tastecheck and daily use while the product is unfinished.
