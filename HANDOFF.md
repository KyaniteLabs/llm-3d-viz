# HANDOFF — llm-3d-viz

Last updated: 2026-08-01 (v2 — v0 BUILD COMPLETE)

## What this is
Interactive 3D web app plotting LLM benchmarks across **SPEED × COST × INTELLIGENCE** — a rotatable 3D scatter with a Pareto ridge, linked 2D projections, and a tunable value-score. Goal: a publishable product **and** source material for visually beautiful videos.

- **Repo (Forgejo, private):** https://git.kyanitelabs.tech/simon/llm-3d-viz
- **Local clone:** `~/workspaces/llm-3d-viz`
- **Namespace:** `simon` on `git.kyanitelabs.tech`

## Status: v0 BUILT + GATE PASSED → publish decision pending (approval-gated)

### Done (2026-08-01, single orchestrated session)
- **Wayfinder map #2 COMPLETE** — all 8 tickets resolved (#3–#9 decisions, #10 first-render gate SHIP).
- **Ralplan consensus** — Architect SOUND-WITH-CHANGES → Critic APPROVE; 16 revisions applied. Artifacts in `.omx/`.
- **SPEC #11 + tickets #12–#18** — all 7 implementation tickets merged via PRs #19–#25, each behind an independent cross-model review gate (Terra/Luna/GLM rotation; gjc/MiniMax benched — expired credential; agy/Gemini benched from coding per Simon — search/image-gen only).
- **v0 on main**: de-chromed Plotly 3D stage (33 shape-coded models + filament Pareto ridge, log³ axes, ε-floor, single-writer camera), three linked 2D projections (model-ID hover coupling, zoom persistence), value-score console (A1 store, sliders + 5 presets, instant fixed-frontier re-rank, click-to-pin tooltip, incomplete-data disclosure), threshold-sweep (visible dim→lit staging, optimum payoff, time-based, cancel-on-input), cinema mode (orbit + detune), reduced-motion collapse.
- **Gate #10 SHIP**: filament-white confirmed over mineral-gold (A/B evidence); contrast muted 6.31:1 / filament 17:1; feed-scale accepted w/ axis-clip nit. Cinema appearance-persistence defect caught at the gate and fixed (value-level regression spec).
- **Suites**: `vite build` + `tsc --noEmit` clean, 20 vitest, 18 playwright, dist free of `__viz`.

### Next — pick one at resume
- **(a) Publish** (APPROVAL-GATED — Simon must approve): deploy `dist/` to Cloudflare Pages at `viz.kyanitelabs.tech` (wayfinder #8). DNS + Pages project + first deploy.
- **(b) Make videos** — the dry-run take (`docs/gate/t7/dry-run.webm`) is the proof; cinematic mode is record-ready (fonts self-hosted, time-based motion).
- **(c) v1 planning** — new wayfinder map: workload recommender UI, provider/modality slicing, shareable URLs, backend (SPEC §8 v1).

## Key pointers
- `SPEC.md` — locked decisions D1–D8 + roadmap. `DESIGN-SYSTEM.md` — approved visual system.
- `docs/research/` — frontier-math, plotly-dechrome, dataset-v0-sources (the three contracts).
- `docs/gate/t7/` — first-render gate evidence package.
- `.omx/` — ralplan context/PRD/test-spec/handoff. `AGENTS.md` + `docs/agents/` — agent-ops config (Forgejo REST tracker, triage labels, domain docs).
- **Auth**: write-scoped Forgejo token = the `git.kyanitelabs.tech` line in `~/.git-credentials` (browser UA required; keychain entries are read-scoped).

## Worker pool (validated this session)
- Coding: `codex exec -m gpt-5.6-luna|gpt-5.6-terra`, `claude-glm -p` (GLM 5.2 — sharpest reviewer; no vision), gjc/MiniMax (needs key refresh).
- Review rule that worked: reviewer ≠ implementer, every PR gated, FAIL→fix-round→re-review.
- Parallel work needs per-ticket git worktrees (learned the hard way).

## Memory entries (claude-glm recall)
- `llm-3d-viz-project`, `llm-3d-benchmark-plots-research`, `skill-roles-design-vs-gstack` — update `llm-3d-viz-project` on next session (status: v0 built).
