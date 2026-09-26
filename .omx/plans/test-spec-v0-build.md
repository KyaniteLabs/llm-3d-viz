# Test spec — v0 build, llm-3d-viz

Pairs with `.omx/plans/prd-v0-build.md` (revised per Architect A1–A6 + Critic C7–C16). Items 1–28 are automatable; 29–31 are the manual gate, honestly declared. WebGL reality rule (A2): Scatter3d points have no DOM nodes, computed styles, or attributes — 3D assertions go through instrumented `Plotly.restyle`/`Fx.hover` spies or a dev-only `window.__viz` index mapping, never the DOM.

## Unit (vitest) — `tests/pareto.test.ts`, `tests/score.test.ts`

1. Dominance: `a ≻ b` iff speed≥ ∧ cost≤ ∧ intel≥ with ≥1 strict; equality on all three ⇒ mutually non-dominating.
2. Frontier on a 6-model hand-computed fixture returns exactly the expected 3 frontier models; ridge order is (cost↑, intel↑, speed↓), total and deterministic.
3. Tied triples dedupe to one ridge vertex preserving aliases.
4. ε-clamp: $0.00 price → ε = half the smallest positive price, flagged `price_floor: true`; negative price ⇒ row quarantined with `data_error`.
5. Exclusion rule (C7): a model is excluded if **any** of `tps`, `blended_price_per_M`, `aa_intelligence_index` is null — fixture includes a **null-intel-only** row (valid tps + price) proving exclusion independent of today's data overlap. Excluded rows appear in the incomplete-data list with their `null_reason`.
6. Normalization: log-min-max on speed+cost, linear min-max on intelligence; cost direction flipped; min/max over the visible set only; **degenerate axis (max==min) ⇒ normalized value 1.0** (A6).
7. Composite: `score = Σ(wᵢ·x̂ᵢ)/Σw`; sliders 0–10 raw; Σw=0 ⇒ equal weights; presets exactly: coding (.25/.15/.60), chat (.35/.30/.35), vision (.15/.25/.60), RAG (.20/.55/.25), long-context (.25/.45/.30).
8. Optimum: argmax score recomputes on weight change; frontier set is invariant across weight changes (fixed-geometry rule).

## Dataset validation (build-time)

9. `validateModels()` fails the build on: missing model/provider strings, missing context_length, tps < 0, intelligence index outside 0–100, **or any excluded row lacking `null_reason`** (C8). Nulls permitted only in optional metric fields.

## Render (playwright) — `tests/render.spec.ts`

10. Page loads with **zero** console/page/request errors; `document.fonts.ready` resolved (self-hosted woff2, no CDN) before assertions.
11. Stage shows exactly **33** point glyphs and the incomplete-data section lists exactly **2** entries — GPT-5.5 Pro (xhigh) and DeepSeek V4 Flash 0731 — each with its missing-axis reason label visible (C9, C10). Exactly 1 ridge polyline trace.
12. No default Plotly chrome: no `.modebar`, no default grid/tick styling, `.hoverlayer` stays empty (tooltip is our HTML node).
13. All three axes log scale: tick values are powers of 10, **plus** the single ε "≤ floor" tick on the cost axis (C11).
    > **CORRECTED 2026-08-02 (FIX-C / Forgejo #28):** this line was wrong. Per `docs/research/frontier-math.md` §3.3, the **intelligence** axis is **LINEAR** on its native 0–100 index — "the intelligence index is already a bounded, roughly uniform 0–100-style index; logging it would distort" — and the score layer (`src/lib/score.ts`) already normalizes intelligence with linear min-max, so the display must match. Only **speed** and **cost** are log (heavy-tailed: price >10³×, tps ~10²×). The original log `[1,10,100]` intelligence axis crushed the top ~8 models (IQ 50–61) into ~4% of the axis. The render test now asserts: speed + cost `type:"log"`; intelligence `type:"linear"`, ticks `[0,20,40,60,80,100]`, range `[0,100]`; plus the single ε "≤ floor" tick on cost. (History preserved per instruction; this note appended, not retroactive.)
14. Sweep (A2): moving the cost slider 1→9 fires the sweep — assert via instrumented `Plotly.restyle` spy that staged per-point `marker.color` batches are written, the optimum changes to the expected model, and the sweep settles within 400ms±100ms.
15. `prefers-reduced-motion` emulation: slider change highlights instantly (no staged restyle batches); cinema orbit disabled.
16. Cinema mode: toggle hides the console and the camera `eye` changes over a 2s observation window (time-based orbit); pointer-enter on the stage restores the console and halts the orbit.
17. Hover coupling (A2): hovering projection point i triggers `Plotly.Fx.hover` on the stage with the same `pointNumber` (spy-asserted), and stage hover updates the model readout to model i.
18. Contrast: computed `--text-muted` on `--ink-field` ≥ 4.5:1; filament on ink ≥ 7:1. (The single contrast check — no separate script.)
19. Tooltip: hovering a stage point shows the HTML tooltip within 24px of the cursor containing model name + TPS + blended price + AA index; reasoner models with a multi-minute TTFT show the "incl. thinking time (long-prompt median)" caveat (C15). **Click pins the tooltip; a second click elsewhere unpins/moves it** (A6).
20. Provider glyphs: ≥4 distinct marker symbols; the 17-provider mapping table in `models.ts` is honored — no two providers share shape + openness-variant unintentionally (C14).
21. Optimum marker (C13): the weighted optimum carries a larger size AND distinct symbol vs other frontier points (asserted via the restyle spy channel), in addition to filament luminance.
22. Camera persistence (A6): drag the stage to orbit, then move a slider — `scene.camera.eye` is unchanged after re-render (`uirevision` pinned).
23. Sweep interruption (A6): fire a sweep, move another slider mid-sweep — the in-flight sweep cancels (no interleaved restyle batches for the old weight set) and the new sweep settles within budget.
24. ε-floor render marker (A6): the two $0.00 models (Gemma 4 31B, Command A+) render at the ε position with the "≤ floor" tick visible on the cost axis.
25. 2D zoom-reset discipline (A6): re-render after slider change does not reset a user's 2D projection zoom (`uirevision` on projections).
26. `plotly_webglcontextlost` (A6): listener registered; forced context loss shows the reload prompt (smoke test via CDP or manual step documented in the spec run notes).
27. Time-based interpolation (A5): sweep/orbit schedulers derive progress from `performance.now` deltas — assert by code inspection marker (exported timing helper unit-tested: fake timers advance progress by wall-clock, not frame count).
28. Incomplete-data UI (C10): the disclosure section renders each excluded model's name + reason label; entries are not clickable into the stage (they have no point).

## Gate (manual + skill)

29. `tastecheck-pass` against DESIGN-SYSTEM.md: verdict + evidence saved; `deslop-ui` sweep clean of banned patterns (no gradient backgrounds, no glassmorphism, no default Plotly chrome, no emoji, no ambient idle motion).
30. Screenshots captured: full stage, mid-sweep frame, cinema frame, 320px feed-scale. Attached to Forgejo #10.
31. #10 sign-offs recorded with render evidence: filament-white vs mineral-gold, field tint, type carry (incl. native axis titles, A3), sweep feel (post-tuning-pass). #10 closes only on SHIP/CLEAN.

## Non-goals for this spec

Filters/URLs, backend, slicing, recommender auto-weights UI, live data, light mode, publish/deploy (approval-gated separately).
