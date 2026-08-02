# HANDOFF — llm-3d-viz

Last updated: 2026-08-02 (v3 — v0 + Ultra-QA fix program COMPLETE)

## What this is
Interactive 3D web app plotting LLM benchmarks across **SPEED × COST × INTELLIGENCE** — rotatable 3D scatter, Pareto ridge, linked 2D projections, tunable value-score, threshold-sweep, cinema mode. Goal: a publishable product **and** source material for visually beautiful videos.

- **Repo (Forgejo, private):** https://git.kyanitelabs.tech/simon/llm-3d-viz
- **Local clone:** `~/workspaces/llm-3d-viz` · **Namespace:** `simon`
- **Run it:** `npm install && npm run build && npx vite preview` (or `npm run dev`)

## Status: v0.1 READY FOR SIMON'S EYES → publish decision pending (approval-gated)

**Axis mapping (LOCKED by Simon 2026-08-02):** x = COST, y = INTELLIGENCE, z = SPEED. Applies to the 3D stage + ridge; 2D projections keep their named pair views. Cost and speed axes log; intelligence linear 0–100.

### What exists on main (all review-gated)
- **v0 build** (T1–T7, PRs #19–#25): scaffold + validated 35-model dataset, frontier math engine, de-chromed Plotly 3D stage, linked 2D projections, value-score console, threshold-sweep, cinema mode, first-render gate SHIP.
- **Ultra-QA fix program** (#26–#29, PRs #30–#34) — after two independent end-to-end QA agents (GLM 5.2 + Luna xhigh) ruled the first build "makes no sense / FIX-FIRST":
  - **FIX-A**: hover-recursion dead (RangeError), tooltip anchors to cursor ≤24px, click-to-pin works (hovered/pinned as separate states), scrub is rAF-smooth, 60s zero-error soak spec.
  - **FIX-B**: STAGE KEY legend, named frontier models, tighter camera, slider share %, projections co-visible at 1366×768, cinema reclaims its column, and the **class-bounded heat encoding** (continuous value-score luminance — default on, `?heat=0` opts out; dominated < frontier < optimum invariant; Simon's color directive via tastecheck).
  - **FIX-C**: linear intelligence axis (frontier-math §3.3 honored), dominated points visible (4.4:1), per-axis incomplete labels, explicit units, reasoning-gated TTFT caveat, structured `reasoning` field on all 35 rows.
  - **FIX-D**: camera-flip clamp (all payload shapes), marker-appearance hardening, C-key focus fix, de-chromed scrollZoom, mobile axes, chat landing weights.
- **Data**: 35 models, snapshot 2026-08-01, GPT-5.6 trio refreshed 2026-08-02 (Luna/Terra prices verified current vs OpenAI's page).
- **Suites**: `vite build` + `tsc --noEmit` clean, 44 vitest, 35 playwright (incl. 60s zero-error soak). dist free of `__viz`.

### Honest residuals (known, documented, not blockers)
- 375px: 3D tick labels partially occluded (inherent to tiny canvas; 2D projections below carry the info — GLM tastecheck).
- Initial load sweep follows ridge order (cheapest→smartest) by contract (frontier-math §2.4); optimum-last applies after first slider input.
- 320px feed-scale: native 3D axis titles clip (recorded at the v0 gate).
- Multi-minute TTFTs are real AA medians (include reasoning thinking time) — labeled, but they read oddly to newcomers.

### Next — pick one
- **(a) LOOK AT IT** — `npm run build && npx vite preview` → localhost. This is the build Simon hasn't seen since the fix program.
- **(b) Publish** (APPROVAL-GATED): deploy `dist/` to Cloudflare Pages at `viz.kyanitelabs.tech` (wayfinder #8).
- **(c) Videos** — cinema mode is record-ready (self-hosted fonts, time-based motion, heat encoding).
- **(d) v1 planning** — recommender UI, slicing, shareable URLs, backend (SPEC §8 v1). Data refresh cadence: re-pull AA speed/TTFT periodically (rolling medians).

## Ops (validated this session)
- **Worker pool**: `codex exec -m gpt-5.6-luna|gpt-5.6-terra` (coding + review), `claude-glm -p` (GLM 5.2 — sharpest reviewer; no vision), agy/Gemini (search/image-gen/tastecheck-vision ONLY — benched from coding per Simon), gjc/MiniMax (benched — expired key in ~/.gjc).
- **Gate discipline that worked**: reviewer ≠ implementer on every PR; FAIL → fix round → re-review; tastecheck-pass with render evidence for aesthetic calls; real-mouse/real-event tests only (synthetic events proved nothing).
- **Parallel work**: per-ticket git worktrees (two collisions learned the hard way); watch for port contention on playwright (`reuseExistingServer` trap — isolate ports per worktree); machine-load kills happen (exit 137) — workers resume from uncommitted state cleanly.
- **Forgejo auth**: write-scoped token = the `git.kyanitelabs.tech` line in `~/.git-credentials` (browser UA required). Keychain entries are read-scoped.
- **Tracker hygiene**: deleting a branch before its merge lands auto-closes the PR — merge first, delete after (recovered via successor PR #32).

## Key pointers
- `SPEC.md` / `DESIGN-SYSTEM.md` — locked authority. `docs/research/` — frontier-math, plotly-dechrome, dataset sources. `.omx/` — ralplan consensus artifacts. `docs/gate/t7/` — first-render gate evidence. `HANDOFF.md` (this file).
- Memory entries (claude-glm recall): `llm-3d-viz-project`, `llm-3d-benchmark-plots-research`, `skill-roles-design-vs-gstack` — update `llm-3d-viz-project` to "v0.1 ready" next session.
