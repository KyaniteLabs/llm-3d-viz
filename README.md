# llm-3d-viz

Interactive 3D LLM benchmark visualization — **SPEED × COST × INTELLIGENCE**.

Observatory-after-dark Plotly stage (de-chromed), 35 curated models, Pareto ridge, linked 2D projections, value-score console, threshold-sweep, cinema mode.

## Status

**v0.1 complete** on `main` (2026-08-02). Publish to `viz.kyanitelabs.tech` is **approval-gated** — see [`docs/deploy/cloudflare-pages.md`](docs/deploy/cloudflare-pages.md).

**Axis mapping (locked):** x = COST · y = INTELLIGENCE · z = SPEED.

## Authority

| Doc | Role |
|-----|------|
| [`SPEC.md`](SPEC.md) | Product spec, locked decisions D1–D8, phased roadmap |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | Visual system: *Observatory-after-dark* |
| [`HANDOFF.md`](HANDOFF.md) | Session resume / current ops truth |
| [`docs/research/frontier-math.md`](docs/research/frontier-math.md) | Math contract |
| [`docs/deploy/cloudflare-pages.md`](docs/deploy/cloudflare-pages.md) | Cloudflare Pages publish runbook |

## Local

```bash
npm install
npm run build
npx vite preview   # or: npm run dev
npm test           # 44 vitest
npm run test:render  # playwright (ports: isolate per worktree)
```

## Repo

Private Forgejo: https://git.kyanitelabs.tech/simon/llm-3d-viz
