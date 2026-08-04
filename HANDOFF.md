# HANDOFF — llm-3d-viz

Last updated: 2026-08-03 (v4 — #42 landed; Plotly freeze; R3F stage is critical path)

## What this is
Interactive 3D web app plotting LLM benchmarks across **SPEED × COST × INTELLIGENCE** — rotatable 3D scatter, Pareto ridge, linked 2D projections, tunable value-score, threshold-sweep, cinema mode. Goal: a publishable product **and** source material for visually beautiful videos.

- **Repo (Forgejo, private):** https://git.kyanitelabs.tech/simon/llm-3d-viz
- **Local clone:** `~/workspaces/llm-3d-viz` · **Namespace:** `simon`
- **Run it:** `npm install && npm run build && npx vite preview` (or `npm run dev`)

## Status: Plotly v0 frozen after #42 — R3F stage is the product critical path

**Do not publish** until Simon re-approves after looking. Suites green ≠ product ready.

**Plotly is not the end-state renderer** (SPEC D7). It was the v0 prototype. Further Plotly stage "depth / volume / chrome" work is **out of scope** unless P0 crash or explicit publish blocker.

### Landed 2026-08-03
- PR [#38](https://git.kyanitelabs.tech/simon/llm-3d-viz/pulls/38) comprehension pass: landing optimum + top-3, collapsed incomplete, short names, mobile guide, taller projections, token sliders.
- PR [#40](https://git.kyanitelabs.tech/simon/llm-3d-viz/pulls/40) residual closeout: h1, guide state, heat note — **and a bad showbackground "depth" that painted a solid cream stage**.
- PR [#42](https://git.kyanitelabs.tech/simon/llm-3d-viz/pulls/42) **cream plane kill + axis camera orientation**: `showbackground: false`; default eye in −cost/−intelligence octant so floor axes read high-up, not reversed; cinema guide hide; explicit ascending log ranges.

**Look:** `npm run build && npx vite preview`

**Axis mapping (LOCKED by Simon 2026-08-02):** x = COST, y = INTELLIGENCE, z = SPEED. Cost and speed log; intelligence linear 0–100.

### Critical path (do this next)
1. ~~Merge #42~~ **done**
2. **Freeze Plotly stage polish** (active)
3. **R3F / Three stage spike** per contract: `docs/v1/r3f-stage-contract.md`
4. Go/kill on spike → production stage swap if go
5. Then v1 product features + high-quality video; publish only with Simon go

**Do not:** keep polishing Plotly; rewrite console/math/2D in the same train as the stage; add Three.js demo slop (particles, bloom soup, starfields).

### What exists on main
- **v0 build** (T1–T7 + Ultra-QA FIX-A–D + #38/#40/#42): de-chromed Plotly stage (frozen), 35 models, frontier math, linked 2D, value console, sweep, cinema.
- **Suites:** vitest 45, tsc, build clean at last #42 verify.

### Honest residuals (known)
- Plotly still is a chart engine: no reliable 3D data→pixel labels (HTML stage guide stays).
- 375px / 320px: native 3D ticks/titles tight on small canvases.
- Multi-minute TTFTs are real AA medians (reasoning) — labeled, still surprising.
- Showcase / cinema quality ceiling = **R3F stage**, not more gl3d knobs.

### Next — Simon
- Optional **honest v0 publish** after look (concept instrument, not final cinema).
- **Videos** that need hero quality → wait for R3F stage or accept Plotly look.
- **Work mode:** branch → PR → independent review; real-mouse tests; visual proof before "done."

## Ops
- **Workers:** codex luna/terra (implement), claude-glm (review ≠ implementer), vision models only for screenshots/taste.
- **Forgejo:** write token = `git.kyanitelabs.tech` line in `~/.git-credentials` + browser UA.
- **Tracker:** merge before delete branch.

## Key pointers
- `SPEC.md` / `DESIGN-SYSTEM.md` — locked product + visual authority
- `docs/v1/r3f-stage-contract.md` — **stage rewrite contract + spike plan**
- `docs/research/` — frontier-math, plotly-dechrome, dataset
- `docs/deploy/cloudflare-pages.md` — publish runbook (gated)
- `HANDOFF.md` (this file)
