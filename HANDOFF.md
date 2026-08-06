# HANDOFF — llm-3d-viz

Last updated: 2026-08-03 (v7 — **Simon: not doing Plotly for 3D hero**; Three is the path)

## What this is
Interactive 3D web app plotting LLM benchmarks across **SPEED × COST × INTELLIGENCE** — rotatable 3D scatter, Pareto ridge, linked 2D projections, tunable value-score, threshold-sweep, cinema mode. Goal: a publishable product **and** source material for visually beautiful videos.

- **Repo (Forgejo SoT):** https://git.kyanitelabs.tech/simon/llm-3d-viz
- **Local clone:** workspace `llm-3d-viz` · **Namespace:** `simon`
- **Run it:** `npm install && npm run build && npx vite preview` (or `npm run dev`)
- **Three stage:** default hero on this branch; `?stage=plotly` is debug-only / kill-path, not product

## Status: Three is the 3D hero — Plotly stage is out (Simon 2026-08-03)

**Decision (Simon, explicit):** we are **not** shipping/polishing Plotly as the 3D hero. Path is **Three.js stage** (`Stage3DThree`) → visual go → production default.

- Plotly may remain **only** for linked **2D projections** until those are replaced (spike contract: do not port 2D in the same train).
- No more “freeze Plotly v0 and film that instead.”
- **Do not publish** until Simon visual go on the **Three** hero. Suites green ≠ product ready.

### Landed
- PR #38 comprehension pass, #40 residual closeout, #42 cream plane kill + axis camera orientation.
- **Spike (this branch):** `Stage3DSurface` API, `Stage3DThree` (vanilla Three — Y-up scene, MeshBasic points, floor/grid, STAGE·THREE badge), cinema/sweep/hover by model id, Plotly default + WebGL fail-soft fallback.

### Critical path
1. ~~Merge #42~~ done
2. ~~Freeze Plotly stage polish~~ active
3. **R3F / Three stage spike** — implement + wire (`spike/r3f-stage`); **Simon go/kill after visual look**
4. If go → production stage swap PR train (default r3f, optional `?stage=plotly` one release)
5. Then v1 product features + high-quality video; publish only with Simon go

**Do not:** keep polishing Plotly; rewrite console/math/2D in the same train; add Three demo slop (particles, bloom soup, starfields).

### Spike analysis (2026-08-03)
- Full best-practice + TasteCheck ledger: `docs/v1/three-stage-deep-analysis-and-tastecheck-2026-08.md`
- Verdict: **HOLD** (visual veto + a11y table + Plotly code-split + occlusion)
- Evidence PNGs: `docs/v1/tastecheck-evidence/`

### Spike verify
```bash
npm test          # 45 vitest
npx tsc --noEmit
npm run build
npm run preview   # http://127.0.0.1:4200/  (Safari-safe; Three default)
```

**Look at:** first paint axes (high up/away, no cream plane), ridge + heat, cinema (`C` / button), console hover by model id, threshold sweep markers.

### Honest residuals
- Spike still ships Plotly for 2D projections + default 3D path (bundle still Plotly-heavy).
- Three axis labels are HTML overlays (not perfect data→pixel labels yet).
- Playwright render suite still Plotly-centric; not updated for non-Plotly pick in this spike.
- Product encoding gaps (effort levels, class contrast, filters) remain **after** stage go/kill — separate from renderer critical path.

### Next — Simon
- **Visual go/kill on Three only** (http://127.0.0.1:4200/).
- If go → production: default Three, delete or bury Plotly stage path; keep 2D Plotly only until replaced.
- Videos = Three cinema path, not Plotly gl3d.

### Local preview (Safari)
- **Do not use `vite preview` on :4190** — Vite hangs WebKit; port 4190 is blocked for Safari on this Mac.
- **Use:** `npm run build && npm run preview` → **http://127.0.0.1:4200/** (Python static server; Safari + Chrome).
- Chrome-only emergency: `npx vite preview --host 127.0.0.1 --port 5173`

## Ops
- **Workers:** implementer + independent GLM review on PRs; vision models only for screenshots/taste.
- **Forgejo:** REST API with browser UA; credentials stay in the local credential helper (never commit tokens).
- **Tracker:** merge before delete branch.

## Key pointers
- `SPEC.md` / `DESIGN-SYSTEM.md` — locked product + visual authority
- `docs/v1/r3f-stage-contract.md` — **stage rewrite contract + spike plan**
- `src/viz/stage-api.ts` · `src/viz/stage3d-three.ts` · `src/viz/stage3d.ts`
- `docs/research/` — frontier-math, plotly-dechrome, dataset
- `docs/deploy/cloudflare-pages.md` — publish runbook (gated)
- `HANDOFF.md` (this file)
