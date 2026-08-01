# PRD / Plan — v0 build, llm-3d-viz

Status: REVISED after Architect (SOUND-WITH-CHANGES) + Critic (ITERATE) reviews. Changes A1–A6 / C7–C16 applied; see Changelog.
Context: `.omx/context/v0-build-20260801T213109Z.md` · SPEC.md (D1–D8) · DESIGN-SYSTEM.md · docs/research/{frontier-math,plotly-dechrome,dataset-v0-sources}.md · Forgejo MAP #2.

## Requirements summary

Ship v0 (SPEC §8): a static Vite+TS app rendering the full SPEED × COST × INTELLIGENCE tradeoff as a de-chromed Plotly 3D scatter with Pareto ridge, three linked 2D projections, a tunable value-score console, the threshold-sweep signature animation, and a cinematic mode — all in Observatory-after-dark. Video-ready and tastecheck-gated.

In scope (v0): 3D stage + ridge · linked 2D projections · value-score sliders + 5 workload presets · threshold-sweep · cinema mode · model readout + cursor-anchored tooltip with click-to-pin · provider-shape glyphs · incomplete-data disclosure · reduced-motion path · unit + render verification · first-render tuning pass · tastecheck-pass gate (#10).
Out of scope (v0): workload recommender auto-weights UI beyond presets, shareable URLs, backend, slicing filters, live data, publish/deploy, light mode, paid fonts.

## RALPLAN-DR summary (short mode)

**Principles**
1. DESIGN-SYSTEM.md is law — Plotly is a render engine, chrome is ours; no slop, no defaults.
2. Math before paint — `frontier-math.md` is the contract; the render layer never re-decides dominance or normalization.
3. Data honesty — nulls are shown as gaps, never imputed; every number traces to `dataset-v0-sources.md`.
4. Spectacle on user action only — sweep fires on re-weight; cinema mode detunes on pointer entry; idle is dead calm.
5. Video-ready from day one (D6) — every frame must be recordable; camera and sweep are deterministic and repeatable. **All sweep and orbit interpolation is time-based (`performance.now` deltas), never frame-counted** (A5).

**Decision drivers (top 3)**
1. D7/D6: Plotly v0 must reach tastecheck-grade visuals fast enough to validate "does this work for me" and feed videos.
2. The Wiederich & VanderPlas wedge: linked 2D projections are what make interactive 3D defensible — they are core, not decoration.
3. n ≈ 35: simplicity wins over generality everywhere (O(n²) frontier, no WebGL perf work, no framework).

**Viable options**
- **A — Single-lane sequential build (chosen).** One owner builds data → math → stage → projections → console → motion → tuning → gates in dependency order. Pros: zero integration seams in a ~11-file app; the threshold-sweep spans every layer and wants one head. Cons: wall-clock slower; single point of failure.
- **B — Parallel lanes via team.** Pros: faster wall-clock. Cons: integration tax on a tiny surface; sweep + projections couple viz and ui tightly; three agents on one `main.ts` invites merge friction. Rejected for v0; revisit for v1 (backend + slicing genuinely parallelize).
- **C — Skip Plotly, build R3F directly.** Invalidated: violates locked D7 and the map's never-re-litigate rule.

## Architecture

```
index.html                  stage + console + projection-row layout (stage+console motif)
src/styles/tokens.css       DESIGN-SYSTEM token block verbatim + fluid type scale
src/fonts/                  Inter Tight + IBM Plex Mono, self-hosted (OFL) — no CDN (C12)
src/state.ts                minimal store: weights, hovered/pinned model id, cinema mode,
                            camera; single state object, immutable replace, subscribe/emit (A1)
src/data/models.ts          typed dataset: import draft JSON, validate rows, export Model[]
                            + provider→shape mapping + incomplete-data list
src/lib/pareto.ts           dominance, frontier, ridge order (frontier-math §1–2)
src/lib/score.ts            normalization, composite, presets, visible-set min/max (§3–4)
src/viz/stage3d.ts          de-chromed Scatter3d + ridge trace + camera control (single
                            writer: all camera mutations flow through this module)
src/viz/projections.ts      3× 2D Plotly scatter, hover coupling via pointNumber
src/viz/sweep.ts            threshold-sweep scheduler: rAF + Plotly.restyle, staged order,
                            time-based; STRUCTURAL single writer of sweep batches,
                            cancel-on-new-input (A1, A5)
src/viz/cinema.ts           cinema mode: per-frame relayout camera orbit via stage3d's
                            camera API, pointer-enter detune, time-based (A5)
src/ui/console.ts           sliders, presets, model readout, cursor-anchored tooltip
                            with click-to-pin, incomplete-data disclosure
src/main.ts                 bootstrap only: construct store, wire subscriptions, first render
tests/                      vitest unit tests (pareto, score) + playwright render spec
```

**State discipline (A1).** `state.ts` owns weights, hovered/pinned id, cinema mode, camera. Every renderer subscribes; updates are immutable replaces with a `datarevision` bump (Plotly.react silent-skip guard). `sweep.ts` is the *structural* single writer of sweep batches: new slider input cancels any in-flight sweep (cancel-on-new-input, stated here as architecture, not aspiration). `stage3d.ts` exposes the only camera-write API; user drags are read back via `plotly_relayout` into the store rather than treated as a second writer. A `plotly_webglcontextlost` listener surfaces a reload prompt (A6).

**Data flow.** `models.ts` → `pareto.ts` (frontier, ridge — computed once; weight-independent) + `score.ts` (scores, optimum — recomputed on weight change) → immutable view-model in `state.ts` → renderers. Slider input re-computes scores/optimum/sweep-order only; frontier geometry is fixed. v0 has no filters, so visible set = full valid set.

**3D axis labels (A3 — pre-decided).** Restyled native `scene` axis titles for v0: they track orbit (honesty + video determinism), and mono/uppercase/letterspaced styling is achievable on axis titles. Static HTML labels would lie during orbit; self-computed projection is research-flagged post-v0. If the first render shows native titles breaking the type system, evidence goes on #10 and the decision reopens.

**Optimum marker (C13).** The user's weighted optimum gets a non-color distinctness channel (larger size + distinct symbol) in addition to filament luminance — DESIGN-SYSTEM color-blind-safety line.

## Implementation steps

1. **Scaffold** — package.json (vite, typescript, plotly.js-dist-min vendored, vitest, playwright), `vite.config.ts`, `tsconfig`, `index.html` stage+console+projection-row layout, `tokens.css` verbatim from the DESIGN-SYSTEM token block (+ fluid type scale), self-hosted Inter Tight + IBM Plex Mono woff2 under `src/fonts/` with `@font-face` (OFL; no CDN).
2. **Dataset module** — first patch `data/models.v0.draft.json`: add `null_reason` to the two excluded rows (GPT-5.5 Pro (xhigh) → `"not_measured"`; DeepSeek V4 Flash 0731 → `"not_measured"`) per dataset-v0-sources.md (C8). Then `src/data/models.ts`: TS interface per SPEC §5, import + `validateModels()` — fails `vite build` on missing identity fields AND on any excluded row lacking `null_reason`; provider→shape mapping table (**17 providers**, 8 Plotly symbols, long-tail grouped into other-open/other-closed variants, documented in code) (C14); incomplete-data list export: any model with null `tps`, `blended_price_per_M`, OR `aa_intelligence_index`, with `null_reason` (frontier-math §5.2 rule, C7).
3. **Math** — `src/lib/pareto.ts` (linear-space dominance; frontier; ridge order cost↑/intel↑/speed↓; tie dedupe with aliases) and `src/lib/score.ts` (log-min-max speed+cost, linear min-max intel, direction flip, composite Σwx̂/Σw with equal-weight fallback, 5 presets, ε-clamp on ≤$0 prices with negative-quarantine, min/max over visible set, degenerate-axis denominator → 1.0). **Unit tests first** (red-green), including a null-intel-only fixture row so the exclusion rule is tested independently of today's data overlap (C7).
4. **3D stage** — `src/viz/stage3d.ts`: Scatter3d points (per-point shape/size, pearl base, filament-dim frontier, filament optimum with size+symbol channel, slate-cyan 40–60% dominated, rgba strings for per-point alpha), ridge polyline trace (unsmoothed chords), log axes all three with restyled native axis titles (mono uppercase ~11px), ε-floor "≤ floor" tick on the cost axis, full de-chrome config per `plotly-dechrome.md`, camera API (set/orbit; `uirevision` pinned; single-writer), `plotly_webglcontextlost` listener.
5a. **Projections + hover coupling** — `src/viz/projections.ts`: three 2D scatters (TPS×Intel, TPS×Cost, Cost×Intel), frontier highlighted, bidirectional hover coupling with the stage via pointNumber + `Plotly.Fx.hover`, 2D `uirevision` zoom-reset discipline.
5b. **Console + readout + tooltip** — `src/ui/console.ts`: three weight sliders + five preset chips + model readout panel (TTFT labeled "TTFT incl. reasoning (long prompt)" for reasoner models, C15) + cursor-anchored HTML tooltip with click-to-pin + incomplete-data section listing each excluded model with its missing-axis reason label (C10).
6. **Motion** — `src/viz/sweep.ts` (staged ignition per frontier-math §2: cheapest→smartest pre-interaction, score-rank order ending on the optimum after slider input, ~400ms total, rAF-scheduled restyle batches, time-based interpolation, cancel-on-new-input) and `src/viz/cinema.ts` (cinema toggle: clean chrome, slow time-based orbit via the stage camera API, large readout type; pointer-enter detunes). `prefers-reduced-motion`: sweep collapses to instant highlight, orbit disabled.
7. **First-render tuning pass (C16)** — decoupled from the gate: tune sweep stagger/camera feel, capture filament-white vs mineral-gold evidence, verify native axis titles carry the type system, check optimum-marker channel. Small adjustments land here, not inside the gate.
8. **Verification + gate** — vitest + playwright suites, then `tastecheck-pass` + `deslop-ui` against DESIGN-SYSTEM.md; screenshots (full stage, mid-sweep, cinema, 320px feed-scale); receipts + filament/gold + field-tint + type sign-offs posted to Forgejo #10; #10 closes only on SHIP/CLEAN.

## Acceptance criteria

See `.omx/plans/test-spec-v0-build.md` (revised). Headline: math unit tests green; playwright render spec green; zero default Plotly chrome verifiable; sweep ≤400ms, cancel-on-input, and reduced-motion collapse observable; `vite build` clean; tastecheck-pass verdict recorded on #10.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Default Plotly look leaks through (slop) | De-chrome matrix is row-by-row config; deslop-ui gate; HTML tooltip/legend only |
| Restyle storm: slider drag mid-sweep | `sweep.ts` structural single writer + cancel-on-new-input; interruption test (A6) |
| Camera feedback loop (orbit vs user drag) | Single-writer camera API in stage3d; user drags read back via `plotly_relayout` into the store; camera-persistence test (A6) |
| $0 / null data distorts axes | ε-clamp with "≤ floor" tick (render-tested); incomplete-data list visible with reason labels; never impute |
| `Plotly.react` stale renders | Immutable updates + `datarevision` — codified in `state.ts`; regression test for silent-skip |
| 8 symbol limit vs **17 providers** (C14) | Mapping table in `models.ts`, long-tail grouped other-open/other-closed; asserted by test 20; direct labels carry identity |
| Cursor-anchored tooltip drifts | Click-to-pin per SPEC §5; hover tooltip transient by design; pin test (A6) |
| Video take ruined by font swap | Self-hosted OFL fonts; `document.fonts.ready` confirmed before recording (C12) |
| Frame-rate-dependent recordings | All interpolation time-based (`performance.now`), stated as architecture (A5) |
| Tuning discovered inside the closure gate | First-render tuning pass is its own step before the gate (C16) |

## Verification steps

1. `npm run test` (vitest) — math unit suite.
2. `npm run build` — clean TS + vite build; dataset validation included.
3. `npm run test:render` (playwright) — chrome assertions, pinned point counts, ridge trace, sweep timing + interruption, reduced-motion, hover coupling (instrumented), camera persistence, click-to-pin, ε-floor marker, contrast ≥4.5:1 / ≥7:1 (test 18 — the single contrast check), webglcontextlost smoke.
4. `tastecheck-pass` + `deslop-ui` against DESIGN-SYSTEM.md → receipts + verdict posted to Forgejo #10; #10 closes only on SHIP/CLEAN.
5. Manual video-dry-run: confirm `document.fonts.ready` resolved, then 10s screen recording of sweep + cinema orbit, eyeballed for D6 worthiness.

## Available-agent-types roster (this environment)

- `coder` — implementation lanes, test writing, gate running.
- `explore` — bounded read-only lookups (docs verification, repo state).
- `plan` — read-only planning/design passes.

## Follow-up staffing guidance

- Execution lane: **single `coder` owner, sequential** (Option A). Reasoning: deep for steps 3–6 (math + motion), moderate for scaffold/verification.
- `$ultragoal` is the default durable goal-mode follow-up for tracking the steps as sequential goals with ledger checkpoints.
- `$team` is **not recommended for v0** (coupling overhead); first-class candidate for v1 (backend / slicing / recommender split cleanly).
- `$ralph` fallback only if a persistent single-owner verification loop is wanted after the build (e.g. iterating sweep feel); not the default.
- Goal-mode suggestions: `$ultragoal` (default). Not `$autoresearch-goal` (research done); not `$performance-goal` (no perf targets at n=35).

## ADR

- **Decision:** Build v0 as a single-lane sequential Vite+TS static app: typed+patched dataset → frontier math (test-first) → de-chromed Plotly stage (native restyled axis titles) → projections → console → sweep+cinema (time-based, store-mediated) → first-render tuning → verification + tastecheck gate on #10. State lives in a minimal hand-rolled store; sweep and camera are structural single-writers.
- **Drivers:** D6/D7 (beautiful Plotly v0 fast); W&V wedge (linked projections are core); n≈35 simplicity; planning/execution boundary (no code in ralplan).
- **Alternatives considered:** parallel team lanes (rejected — coupling overhead at this size); direct R3F (invalidated by locked D7); zero-build single-file (rejected in wayfinder #7); framework state management (rejected — 20-line store suffices, driver 3).
- **Why chosen:** smallest path that satisfies every locked decision with one head owning the cross-layer sweep; every layer verifiable at its own gate; event-coupling owned by an explicit store rather than implicit wiring.
- **Consequences:** v0 ships without filters/URLs/backend (deliberate, per SPEC §8); sweep feel and filament-vs-gold resolve at the tuning pass + #10 with render evidence; single-owner pace; dataset gains a `null_reason` contract enforced at build time.
- **Follow-ups:** #10 gate receipts; v1 planning (recommender, slicing, URLs, backend) after v0 validates "does this work for me"; font-licensing revisit only with render evidence to Simon; 3D axis-title evidence on #10 may reopen A3.

## Changelog (consensus revisions applied)

- **A1** Added `src/state.ts` minimal store; sweep = structural single writer of sweep batches; camera single-writer API; cancel-on-new-input as architecture.
- **A2** Tests 14 & 17 rewritten for WebGL reality (instrumented restyle/Fx.hover spies; no DOM-attribute assertions on 3D points).
- **A3** Pre-decided 3D axis labels: restyled native `scene` axis titles for v0; reopen only with render evidence on #10.
- **A4** Step 5 split into 5a (projections + hover coupling) and 5b (console + readout + tooltip + incomplete-data).
- **A5** Time-based interpolation mandated for sweep + orbit (principle 5 + steps 6).
- **A6** Five tests added (camera persistence, sweep interruption, click-to-pin, ε-floor render marker, degenerate-axis) + `plotly_webglcontextlost` listener + smoke test.
- **C7** Exclusion rule restated per frontier-math §5.2 (any null axis excludes); null-intel-only fixture row added to unit tests.
- **C8** `null_reason` patched into the dataset's two excluded rows (step 2); validator fails build if an excluded row lacks it.
- **C9** Point counts pinned: exactly 33 glyphs + 2 incomplete-data entries, named.
- **C10** Incomplete-data UI "done" defined (name + missing-axis reason label; render-asserted).
- **C11** Log-tick test amended for the single ε "≤ floor" exception.
- **C12** Fonts self-hosted (OFL), no CDN; `document.fonts.ready` check added to the video dry-run.
- **C13** Optimum marker gains non-color channel (size + symbol); asserted via restyle spy.
- **C14** Provider count corrected to 17; mapping table + test 20 assertion.
- **C15** TTFT readout label: "TTFT incl. reasoning (long prompt)".
- **C16** First-render tuning pass inserted as step 7, decoupled from the closure gate.
- Fold: contrast verification lives only in the render spec (test 18).
