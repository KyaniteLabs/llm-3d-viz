# HANDOFF — llm-3d-viz

Last updated: 2026-08-03 (v5 — R3F/Three stage spike wired behind `?stage=r3f`)

## What this is
Interactive 3D web app plotting LLM benchmarks across **SPEED × COST × INTELLIGENCE** — rotatable 3D scatter, Pareto ridge, linked 2D projections, tunable value-score, threshold-sweep, cinema mode. Goal: a publishable product **and** source material for visually beautiful videos.

- **Repo (Forgejo, private):** https://git.kyanitelabs.tech/simon/llm-3d-viz
- **Local clone:** `~/workspaces/llm-3d-viz` · **Namespace:** `simon`
- **Run it:** `npm install && npm run build && npx vite preview` (or `npm run dev`)
- **Three stage spike:** add `?stage=r3f` (default remains frozen Plotly)

## Status: Plotly v0 frozen — R3F/Three spike on `spike/r3f-stage`

**Do not publish** until Simon re-approves after looking. Suites green ≠ product ready.

**Plotly is not the end-state renderer** (SPEC D7). Further Plotly stage polish is **out of scope** unless P0 crash or explicit publish blocker.

### Landed
- PR #38 comprehension pass, #40 residual closeout, #42 cream plane kill + axis camera orientation.
- **Spike (this branch):** `Stage3DSurface` API, `Stage3DThree` (vanilla Three.js — no React/R3F), `?stage=r3f` wire into main/cinema/sweep/projections hover.

### Critical path
1. ~~Merge #42~~ done
2. ~~Freeze Plotly stage polish~~ active
3. **R3F / Three stage spike** — implement + wire (`spike/r3f-stage`); **Simon go/kill after visual look**
4. If go → production stage swap PR train (default r3f, optional `?stage=plotly` one release)
5. Then v1 product features + high-quality video; publish only with Simon go

**Do not:** keep polishing Plotly; rewrite console/math/2D in the same train; add Three demo slop (particles, bloom soup, starfields).

### Spike verify
```bash
npm test          # 45 vitest
npx tsc --noEmit
npm run build
npx vite preview  # open /?stage=r3f  and / (plotly default)
```

**Look at:** first paint axes (high up/away, no cream plane), ridge + heat, cinema (`C` / button), console hover by model id, threshold sweep markers.

### Honest residuals
- Spike still ships Plotly for 2D projections + default 3D path (bundle still Plotly-heavy).
- Three axis labels are HTML overlays (not perfect data→pixel labels yet).
- Playwright render suite still Plotly-centric; not updated for non-Plotly pick in this spike.
- Product encoding gaps (effort levels, class contrast, filters) remain **after** stage go/kill — separate from renderer critical path.

### Next — Simon
- **Visual go/kill** on `?stage=r3f` vs default Plotly.
- Optional honest v0 publish of Plotly concept after look.
- Videos needing hero quality → wait for go + production swap, or accept Plotly.

## Ops
- **Workers:** codex luna/terra (implement), claude-glm (review ≠ implementer), vision models only for screenshots/taste.
- **Forgejo:** write token = `git.kyanitelabs.tech` line in `~/.git-credentials` + browser UA.
- **Tracker:** merge before delete branch.

## Key pointers
- `SPEC.md` / `DESIGN-SYSTEM.md` — locked product + visual authority
- `docs/v1/r3f-stage-contract.md` — **stage rewrite contract + spike plan**
- `src/viz/stage-api.ts` · `src/viz/stage3d-three.ts` · `src/viz/stage3d.ts`
- `docs/research/` — frontier-math, plotly-dechrome, dataset
- `docs/deploy/cloudflare-pages.md` — publish runbook (gated)
- `HANDOFF.md` (this file)
