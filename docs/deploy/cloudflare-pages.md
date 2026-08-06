# Deploy — Cloudflare Pages (`viz.kyanitelabs.tech`)

**Status:** prep only. Live publish is **approval-gated** (Simon must say so in-session).

**Target:** static `dist/` → Cloudflare Pages → custom domain `viz.kyanitelabs.tech`.

## Preconditions (verified 2026-08-03)

| Check | State |
|-------|--------|
| App | v0.1 complete on `main`; axis lock x=cost, y=intelligence, z=speed |
| Suites | `npm run build` + `tsc --noEmit` + 44 vitest green (re-run before ship) |
| Auth | Cloudflare account with Pages write (`npx wrangler whoami`) |
| Pages scope | OAuth / API token with `pages (write)` |
| DNS | Optional custom domain on your zone (example product host: `viz.kyanitelabs.tech`) |
| Cost | Pages free tier for static assets; **do not** enable paid add-ons unless intended |

## What ships

- Single-page app (no path router). Query only: `?heat=0` opt-out for class-bounded heat encoding.
- Self-hosted fonts (Inter Tight + IBM Plex Mono woff2 under `/assets/`).
- Plotly bundle (~4.9 MB JS / ~1.5 MB gzip) — acceptable for Pages; first load is the cost.

## Gate checklist (before any `pages deploy`)

1. Simon **explicitly** approves live publish in the current session.
2. Clean tree on the intended commit (`git status`).
3. Fresh verify:

```bash
npm run build
npx tsc --noEmit
npm test
# optional, slower: npm run test:render
```

4. Confirm `dist/` has `index.html`, `favicon.svg`, `assets/*`, and **`_headers`** (copied from `public/`).
5. Confirm `rg '__viz' dist/` is empty.

## One-shot publish (run only after gate)

```bash
cd ~/workspaces/llm-3d-viz
git checkout main && git pull --ff-only

npm run build
npx tsc --noEmit && npm test

# Create project once (idempotent fail if exists):
npx wrangler pages project create llm-3d-viz --production-branch main

# Deploy production build:
npx wrangler pages deploy dist \
  --project-name=llm-3d-viz \
  --branch=main \
  --commit-dirty=true

# Attach custom domain (Pages will ask CF DNS for CNAME):
# Prefer Dashboard → Pages → llm-3d-viz → Custom domains → viz.kyanitelabs.tech
# Equivalent API/CLI path if available in your wrangler version; otherwise Dashboard.
```

After first deploy, note the `*.pages.dev` URL from wrangler output and smoke it before relying on the custom domain (DNS can lag minutes).

## Post-deploy smoke (must pass)

| Check | Expect |
|-------|--------|
| `https://llm-3d-viz.pages.dev/` (or project URL) | 200, dark observatory chrome |
| `https://viz.kyanitelabs.tech/` | 200 once DNS is attached |
| Console | no uncaught errors on load + one rotate + one slider move |
| `?heat=0` | heat encoding off |
| Cinema (`C`) | enters cinema mode; fonts still self-hosted (no fonts.googleapis.com) |
| Network | no third-party font/CDN leaks for type |

## Rollback

```bash
npx wrangler pages deployment list --project-name=llm-3d-viz
# Redeploy a prior known-good commit's dist, or use Dashboard → Deployments → Retry / Rollback
```

If the custom domain must go dark: remove the custom domain in Pages (or delete the CNAME in CF DNS for `viz`).

## Non-goals for this deploy

- CI auto-deploy from Forgejo (can follow after first manual success)
- Backend / shareable URL state (v1 — SPEC §8)
- Spending Workers AI / paid plans
- Synthetic load / credit-burn traffic

## Local look (no publish)

```bash
npm run build && npx vite preview --host 127.0.0.1 --port 4173
# open http://127.0.0.1:4173/
```
