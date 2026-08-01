# SPEC — 3-variable LLM benchmark viz (SPEED × COST × INTELLIGENCE)

Living spec. Compressed from research (2026-08-01) + user brainstorm. Updated in real time.

## §0 Context (from verified research — high confidence)
- LLM benchmarking = 3 vars: **SPEED** (tokens/sec, TTFT, latency), **COST** ($/token, $/M), **INTELLIGENCE** (MMLU/GPQA/Arena ELO/SWE-bench/Aider %). Canonical per [Artificial Analysis methodology](https://artificialanalysis.ai/methodology).
- **True 3D barely exists:** ONLY [AI IQ (aiiq.org)](https://www.aiiq.org/charts/) — an indie aggregator — has a real X/Y/Z interactive 3D (speed × IQ × cost, color=provider, drag-to-rotate). Every major org (Artificial Analysis, LMArena, Aider, Epoch AI, Vellum) = **2D-only** (AA uses Recharts; grep for 3D signatures = 0 real hits).
- **Perception canon:** STATIC 3D is inferior ([Cleveland & McGill 1984](http://euclid.psych.yorku.ca/www/psy6135/papers/ClevelandMcGill1984.pdf); isometric projection "removes a dimension," [Papaphilippou 2024](https://arxiv.org/html/2406.06146v2)). BUT interactive/rotatable 3D is **UNTESTED** ([Wiederich & VanderPlas 2024](https://jds-online.org/journal/JDS/article/1367/info)) — the wedge.
- **Tooling confirmed:** [Plotly scatter_3d / Scatter3d](https://plotly.com/python/3d-scatter-plots/). **Alternatives:** parallel coordinates, bubble (size=3rd var), small multiples (Tufte), ternary.

## §1 Problem
- Everyone shows 2-of-3 at a time. The full 3-way tradeoff ("cheap + fast + smart — find the frontier") is invisible in any single 2D chart; AA needs ~15 charts to cover it.
- Goal: make the complete 3-way tradeoff legible in **one** view, better than AI IQ's bare 3D and better than AA's chart sprawl.

## §2 Goals / Non-goals
- **Goals (all three, unified — ambitious):** (1) *Decision tool* — surface the speed/cost/intelligence frontier so a user can pick a model; (2) *Showcase* — a striking, shareable hero view of the whole tradeoff; (3) *Research artifact* — a defensible demonstration that interactive 3D can work for LLM comprehension (addresses the Wiederich & VanderPlas 2024 gap).
- **Known tension:** precision (decision), drama (showcase), and rigor (research) usually pull apart. The hybrid encoding (§6) is the one design that threads all three — at the cost of more build than any single-use version.
- **Non-goals:** running our own evaluations; full leaderboard parity with AA; (production backend — pending §3 scope decision).

## §3 Open forks (decision agenda)
1. [x] RESOLVED → hybrid: best-encoding-wins criterion, literal 3D kept as first-class hero view (see §4 D1).
2. [x] RESOLVED → all three uses (decision + showcase + research); ambitious unified target (§4 D2).
3. [x] RESOLVED → curated static dataset, ~20-40 models, reproducible, no scraping (§4 D3).
4. [x] RESOLVED → full web app (framework + backend, persistent URLs, room for live data) — BUT shipped in phases (§8); beautiful video-ready core first.
5. [x] RESOLVED → all differentiators in scope: tunable value-score + 3D Pareto surface + workload recommender + provider/modality slicing, atop the locked linked-2D projections (§4 D4).
6. [x] RESOLVED (proposed defaults) → schema in §5: speed = TPS + TTFT; cost = $/M in/out + blended (AA 7:2:1); intelligence = AA Intelligence Index primary, with Arena ELO / GPQA / SWE-bench / Aider % switchable.

## §4 Locked decisions
- **D1 — Encoding = hybrid (interactive 3D + linked 2D projections).** "Best encoding wins" is the criterion; literal 3D is preserved as a first-class hero view (per user: "don't forget #2"). The linked 2D projections are what neutralize 3D's perception problem. Pure-2D-only and pure-3D-only are both rejected.
- **D2 — Uses = decision tool + showcase + research artifact (all three).** Hybrid is the only encoding satisfying all three simultaneously.
- **D3 — Data = curated static dataset.** ~20-40 notable models, published specs from AA / HuggingFace / provider docs. Reproducible, versionable, no scraping, no TOS exposure.
- **D4 — Differentiators (all in scope, phased per §8):** (a) tunable value-score (weight sliders → live composite + frontier re-rank); (b) 3D Pareto *surface*; (c) workload recommender (task type → auto-weights); (d) provider/modality/openness/context-length slicing — all on top of the locked linked-2D projections.
- **D5 — Scope = full web app.** Framework + backend, persistent shareable URLs, room for live data later. Deliberately phased (§8) to avoid build-everything-ship-nothing.
- **D6 — Publish + video-ready aesthetic is FIRST-CLASS.** The tool is a publishable product AND source material for visually beautiful videos. Visual quality is a core requirement from day one, not polish-after-the-fact. (Driver: user wants to publish and "start making videos that are visually beautiful.")
- **D7 — v0 stack = Plotly-first; Three.js/R3F cinematic upgrade deferred to v1+.** Plotly gets a real, shareable, video-recordable v0 in days to validate "does this work for me." Caveat: default Plotly chrome reads as slop — v0 Plotly must be elevated to tastecheck-grade styling (no out-of-the-box look). Three.js/R3F rebuild of the 3D hero is the planned cinematic upgrade once the concept proves out.
- **D8 — Design process = tastecheck-driven, NOT gstack.** gstack is reserved for product/exec/planning/engineering/review. Visual direction is resolved via the `tastecheck` skills + sharp questions. Hard bar: **no slop** — no generic AI-template aesthetic. (See §7.) **[RESOLVED 2026-08-01]** Direction locked: *Observatory-after-dark*, filament-white accent, threshold-sweep signature — full system in `DESIGN-SYSTEM.md`; status `approved` (pixel sign-off at first render via `tastecheck-pass`).

## §5 Candidate components
- **Data layer (curated, static for v0/v1):** normalized per-model schema —
  - identity: `model`, `provider`, `openness` (open/closed), `modality` (text/vision/audio), `context_length`, `release_date`, `source_url`
  - speed: `tps` (output tokens/sec), `ttft` (time-to-first-token, ms)
  - cost: `price_in_per_M`, `price_out_per_M`, `blended_price_per_M` (AA 7:2:1)
  - intelligence: `aa_intelligence_index` (primary) + switchable `arena_elo`, `gpqa`, `swe_bench`, `aider_pct`
  - workload→weight presets: coding / chat / vision / RAG / long-context → default speed/cost/intel weights
  - meta: `data_date`, `source` (AA / HF / provider docs)
- **Views:** (1) 3D hero scatter — x=speed, y=intelligence, z=cost (log axes) — with Pareto surface; (2) linked 2D projections (the perception aids); (3) value-score panel (sliders → live composite + frontier re-highlight); (4) workload recommender; (5) filter/slice controls.
- **Interaction:** orbit/rotate 3D, hover detail, click-to-pin, filter, frontier highlight, smooth eased transitions (camera + data tweens — video-friendly).
- **Cinematic mode:** clean chrome, slow auto-orbit, large typography — screen-record friendly.
- **Backend (full app, v1+):** serve dataset, persistent/shareable URLs (filters + weights encoded in URL), room for live provider-API data later.

## §6 Protect-worthy idea (the wedge)
- **Interactive 3D + linked 2D focus/context projections** ([Piringer/Kosara/Hauser 2004](https://www.researchgate.net/publication/4085227)): keep a rotatable 3D view synced with 2D projections so depth is always cross-checkable. This neutralizes the static-3D perception problem, exploits the untested interactive-3D gap, and is the concrete differentiator vs AI IQ's isolated 3D plot.

## §7 Visual direction — LOCKED → `DESIGN-SYSTEM.md` is the source of truth
- **Direction:** *Observatory-after-dark* — calm chrome, dramatic canvas; the Pareto frontier burns white-hot as a filament, dominated points dim by subtraction; spectacle fires only on user action.
- **Accent:** filament-white `#E8F1E4` on cool-green ink `#070C0B` (mineral-gold `#D6A84B` documented as warm alternative).
- **Signature:** the *threshold-sweep* — staged filament ignition on every re-weight, synced to the 2D projections snapping into registration.
- **Resolved via:** `design-system-interview` (tastecheck-routed) + second opinions from **codex-sol** + **kimi-k3-cli** (Pushing Dispatch). NOT gstack (per D8).
- **Key corrections adopted from the consults:** kill ambient orbit / idle glow; frontier = ridge not surface; DOF + slow orbit only in "cinema mode"; de-chrome Plotly to render-engine-only; differentiate points by shape, not color.
- Full tokens, motion curves, refusals, structure/rhythm, build order → `DESIGN-SYSTEM.md`.

## §8 Phased roadmap (ship beautiful core fast, layer the rest)
- **v0 — core, video-ready (ship static first):** curated dataset + 3D hero scatter + linked 2D projections + tunable value-score + 3D Pareto surface + cinematic mode. → enough to start making videos and validate "does this work for me."
- **v1 — product:** + workload recommender + provider/modality slicing + shareable URLs + backend deploy.
- **v2 — live + research:** + live provider-API data + optional mini comprehension study (closes Wiederich & VanderPlas gap for real → research artifact).
- Rationale: front-load the beautiful, publishable, video-ready core; defer backend/slicing/live-data/research until the concept is validated. Avoids the build-everything-ship-nothing trap.
