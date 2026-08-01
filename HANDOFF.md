# HANDOFF — llm-3d-viz

Last updated: 2026-08-01

## What this is
Interactive 3D web app plotting LLM benchmarks across **SPEED × COST × INTELLIGENCE** — a rotatable 3D scatter with a Pareto frontier, linked 2D projections, and a tunable value-score. Goal: a publishable product **and** source material for visually beautiful videos.

- **Repo (Forgejo, private):** https://git.kyanitelabs.tech/simon/llm-3d-viz
- **Local clone:** `~/workspaces/llm-3d-viz`
- **Namespace:** `simon` on `git.kyanitelabs.tech`

## Status: design APPROVED → build pending

### Done
- **Research** — true-3D LLM plots barely exist; only [AI IQ](https://www.aiiq.org/charts/) has one; all majors (Artificial Analysis, LMArena, Aider, Epoch AI, Vellum) are 2D-only. The interactive-3D perception gap (Wiederich & VanderPlas 2024 — the evidence against 3D is all on *static* projections; interactive 3D is untested) is the wedge.
- **Design** — *Observatory-after-dark*: filament-white accent (`#E8F1E4`) on cool-green ink (`#070C0B`); **threshold-sweep** signature (staged filament ignition on re-weight, synced to the 2D projections); calm chrome + dramatic canvas. Pressure-tested by GPT-5.6 Sol + Kimi K3 consults. Full system in `DESIGN-SYSTEM.md`.
- **Spec** — 8 locked decisions (D1–D8) + phased roadmap (v0→v1→v2→publish). See `SPEC.md`.
- **Repo** — initialized on Forgejo; SPEC + DESIGN-SYSTEM + README on `main`.

### Next — pick one at resume
- **(a) Wayfinder build map** — run `setup-matt-pocock-skills` (configure Forgejo issues as the tracker), then chart the build as decision tickets on this repo's issues. Best for a multi-session build.
- **(b) Start v0 directly** — curated ~20–40-model dataset + de-chromed Plotly stage + threshold-sweep, styled to `DESIGN-SYSTEM.md`.

## v0 scope (first build)
- **Data:** curated static dataset, ~20–40 notable models — identity (model/provider/openness/modality/context_length), speed (tps, ttft), cost ($/M in/out/blended), intelligence (AA Intelligence Index primary + Arena ELO/GPQA/SWE-bench/Aider%), workload→weight presets. Reproducible, no scraping.
- **Views:** 3D hero scatter (x=speed, y=intelligence, z=cost, log axes) + Pareto ridge + linked 2D projections + value-score panel.
- **Aesthetic:** `DESIGN-SYSTEM.md` (Observatory-after-dark). **No slop.**
- **Stack:** v0 = Plotly, brutally de-chromed (render-engine-only); v1+ = Three.js/R3F cinematic.

## How to resume (fresh session)
> **"resume work on llm-3d-viz — chart the wayfinder build map"**  (or: **"start v0"**)

Memory entries + this repo carry full context; no re-briefing needed.

## Key pointers
- `SPEC.md` — product spec + locked decisions D1–D8 + phased roadmap (§8).
- `DESIGN-SYSTEM.md` — visual system (tokens, motion, refusals, structure, build order). Status approved; pixel sign-off at first render via `tastecheck-pass`.
- **Skill roles:** gstack = product/exec/eng (**not** design); design via `tastecheck` + questions; **no slop**.

## Auth note
Repo creation needs a `write:user`-scope Forgejo token — stored in a *named* keychain generic-password entry (the default git-push credential lacks that scope). Git push/pull uses the standard host credential helper.

## Open decisions (deferred to build)
- Plotly v0 scope: typographic-signature v0 (recommended) vs cut-scope static.
- Accent sign-off: filament-white primary; mineral-gold (`#D6A84B`) is the documented warm alternative — confirm at first render.
- Type licensing: Söhne / Neue Haas Grotesk (paid) vs Inter Tight / Geist (free).

## Memory entries (claude-glm recall)
- `llm-3d-viz-project` — project status (condensed handoff).
- `llm-3d-benchmark-plots-research` — research findings + sources.
- `skill-roles-design-vs-gstack` — gstack ≠ design; tastecheck + questions; no slop.
