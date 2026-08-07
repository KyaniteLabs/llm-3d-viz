# Map — W7 Life Layer (S+ maximal beauty, post-W6)

| Field | Value |
|-------|--------|
| **Status** | **prepared** — execution starts the moment Grok's W0–W6 tree lands clean |
| **Charted** | 2026-08-07 (design-review audit + 10-way life-layer brief, user-approved "wait, then execute") |
| **Base** | Grok W0–W6 train (`.omx/plans/prd-s-plus-maximal-dataviz-beauty.md`) — do not start on dirty tree |
| **Baseline** | design audit 2026-08-07: Design **B−** · Slop **A** · `~/.gstack/projects/simon-llm-3d-viz/designs/design-audit-20260807/design-baseline.json` |
| **Target** | audit re-score ≥ A−· every D1–D14 held · life-layer evidence pack per ticket |
| **Spec law (unchanged)** | spectacle only on user action · no ambient idle motion · no slop patterns · one meaning per channel |

---

## Critical path

```
G0 → L1 → L8 → L10a → L5 → L2 → L6 → L7 → L4 → L3 → L9 → L10b
gate  plotly type  quickwins p3  sweep lockon mobile optics living export CIgate
```

| # | Ticket | Blocked by | Gate |
|---|--------|------------|------|
| G0 | Grok tree lands: `git status` clean, commits past `d7bcec1`, `npm test`+`build` green | — | binary |
| L1 | Plotly text exorcism (audit F-003/F-004) | G0 | binary + capture |
| L8 | Publication type & numeral craft (F-009/F-013) | G0 | binary + computed-style metrics |
| L10a | Quick wins (F-005 focus copper · F-012 color-scheme · F-011 dup token · F-007 sliders un-buried) | G0 | binary |
| L5 | P3/OKLCH palette depth | L1 | golden + capture |
| L2 | Threshold-sweep choreography | L5 | capture strip + reduced-motion test |
| L6 | Lock-on ceremony | L2 | capture strip |
| L7 | Mobile instrument (F-001/F-002/F-008) | L10a | 375px capture + metrics |
| L4 | Cinema optics: bokeh DOF + fog + HDR canvas | L6 | cinema capture |
| L3 | Living stage: data-arrival ignition | L2 | capture + unit (diff detect) |
| L9 | Cinema export artifact (2× frame + method line) | L4 | exported PNG evidence |
| L10b | Permanent gate: tastecheck CI + 3-viewport goldens + CVD sim + audit re-score | all | scorecard |

---

## L1 — Plotly text exorcism

**Files:** `src/viz/projections.ts`, `src/viz/plotly-loader.ts`, `src/viz/stage3d.ts` (integration in `main.ts`)
**Why:** audit F-003 — 656 elements in Open Sans/Arial; F-004 — garbled cost-origin ticks. DS refusal: "Plotly = render engine only."

**Pre-map (2026-08-07, from source read):** `projections.ts:371` and `stage3d.ts:371-379` already set global + tick fonts to the mono token — the live site's Open Sans census was measured on a STALE deploy, so step 1 is re-running the font census against a fresh local build before changing anything. Remaining real work: (a) cost-axis origin crowding — `axisLayout` uses `tickmode: "array"` with uncapped domain ticks and no `tickangle` policy; Plotly auto-rotates under crowding → the rotated "≤ floor" smear (F-004); fix by capping/shortening ticktext at the domain source (`axis-metrics.ts`) and/or pinning `tickangle: 0`; (b) audit the OTHER Plotly surfaces — decide cost×speed chart (`decide-panel.ts`) and task charts (`console.ts` task-charts) — for missing `layout.font`; (c) unstyled native `INPUT`/`button.tree-twist` Arial (font-family: inherit in tokens.css).
- [ ] `layout.font.family` = IBM Plex Mono token on every Plotly layout (2D strip, 2D mode, decide chart, task charts)
- [ ] Log-aware tick placement: explicit `tickvals`/`ticktext` for cost axes; kill rotated-overlap origin smear (tickangle 0 or automargin + nticks cap)
- [ ] Kill duplicated `≤ floor` annotations; single anchored floor label
- [ ] Axis titles mono uppercase ~11px letterspaced (spec: "~50% of the feel")
- [ ] No Arial fallback anywhere: unstyled `INPUT`/twistie buttons get `font-family: inherit`
- [ ] Evidence: `w7-life/l1/` 1440+768 captures; JS font census shows zero Open Sans/Arial

## L8 — Publication type & numeral craft

**Files:** `src/styles/tokens.css`, `src/ui/membership-table.ts`, `src/ui/console.ts`
- [ ] W4 numbers: selection name 22–28px · scores mono 16–18px · wordmark ~11px tracked · h1 > body 17.36px
- [ ] Zero rendered strings < 10px (audit floor was 8px — Atlas fine print, chart annotations)
- [ ] `font-feature-settings: "tnum"` on every numeric run; `text-wrap: pretty` on rail prose; `balance` on headings
- [ ] Evidence: computed-style metrics dump in `w7-life/l8/checklist.md`

## L10a — Quick wins (audit quick-fire)

**Files:** `tokens.css`, `console.ts`, status-bar source in `main.ts`
- [ ] F-005: global `:focus-visible { outline: 2px solid var(--copper); outline-offset: 2px }` — no UA blue anywhere
- [ ] F-012: `html { color-scheme: dark }`
- [ ] F-011: kill `multi-effort · multi-effort` duplicate token
- [ ] F-007: weight sliders promoted to always-visible hairline strip under goal cards (out of Advanced twisty)
- [ ] F-010: Atlas copy — fix orphaned "Daniel", rewrite STT sentence in product voice

## L5 — P3/OKLCH palette depth

**Files:** `src/viz/palette.ts`, `tokens.css`
- [ ] Re-author filament ramp + lab fills as OKLCH with `color(display-p3 …)` values + sRGB fallback (`@supports (color: color(display-p3 1 1 1))`)
- [ ] Golden: every `LAB_BRANDS` entry keeps nameable hue in sRGB fallback (unit: OKLCH→sRGB clamp deltaE report)
- [ ] Preserve W0 paint law constants (trail 0.18 · mid 0.7 · chroma pull 0.22)

## L2 — Threshold-sweep choreography

**Files:** `src/viz/sweep.ts`, `sweep-timing.ts`

**Pre-map (2026-08-07, from source read):** current sweep is BINARY batch ignition — `writeAtProgress` (sweep.ts:393) flips each point base→target at discrete threshold `(index+1)/N` along `ignitionOrder` (ridge order pre-interaction, score-rank after; sweep.ts:28). No per-point easing, no overshoot, no color interpolation. 400ms wall-clock loop (`scheduleSweep`) and reduced-motion settle already correct. Projections already snap in the same pass ("registration" behavior exists). Edit points: (a) replace the lit-set flip with a per-point continuous ramp — local progress `p_i = clamp((progress − delay_i)/ramp, 0, 1)`, easeOutCubic, size overshoot 1.15×→1.0 settle; spread delays over ~60% of the 400ms window, ramp ~40%; (b) OKLCH-lerp colors base→target per ramp step (helper lives with L5 palette work — sequence L2 after L5); (c) keep the `lastBatch` early-return spirit: quantize to ~30 writes or animate stage-only and let projections threshold-snap, else 4× Plotly restyle per frame will jank; (d) optional camera beat hooks through `stage-api.ts` — check its surface at execution (Grok-dirty file); (e) reduced-motion path (`writeAtProgress(states, 1)`) must stay the instant path.
- [ ] Staggered per-point ignition with spring overshoot inside the 400ms budget; ridge "breathes" only during slider drag, dead-calm idle (spec law)
- [ ] Camera ease on `--ease-cinema` 600ms in same beat; 2D projections FLIP-snap to registration synced
- [ ] `prefers-reduced-motion`: instant highlight, no stagger (spec)
- [ ] Evidence: 6-frame capture strip `w7-life/l2/` showing staged propagation

## L6 — Lock-on ceremony

**Files:** `src/viz/stage3d-three.ts`, `src/lib/cinema-focus.ts`, `console.ts`

**Pre-map (2026-08-07):** reuse `computeCinemaFocusIds` (cinema-focus.ts, pure, tested shape: frontier ∪ optimum ∪ selected ∪ shortlist ∪ top-K≤12) as the ignition set — do not invent a second focus authority. Ceremony phases: 0–180ms ring/core ignite on target mark · 0–600ms camera dolly on `--ease-cinema` (three stage: lerp camera position/target; check `stage-api.ts` surface at execution — Grok-dirty) · 300–600ms inspector crossfade + nameplate settle (View Transition where available, FLIP fallback, in console.ts). Reduced-motion: instant select, no dolly.
- [ ] Mark click → 600ms dolly + focus pull + ring/core ignition + inspector crossfade (View Transition where available, FLIP fallback)
- [ ] Optimum nameplate: filament-gold + largest (per W1 law) with settle ease
- [ ] Reduced-motion: instant select

## L7 — Mobile instrument

**Files:** `tokens.css`, `console.ts`, `stage-guide.ts`
- [ ] F-001: left chips hidden ≤640px (goal cards already carry function) or docked in sheet — no severed slivers
- [ ] F-002: STAGE KEY as swipe-up sheet on ≤390px; decoding possible without hover
- [ ] Stage ≥52vh; inspector bottom sheet peek = name+score (W4 AC-I6 parity)
- [ ] F-008: touch targets ≥44px on touch viewports (tabs, chips, unit toggles, slider thumbs)
- [ ] Haptic detents on weight sliders (`navigator.vibrate(4)` on tick, guarded)
- [ ] Evidence: 375×812 + 390×844 captures

## L4 — Cinema optics

**Files:** `src/viz/cinema.ts`, `stage3d-three.ts`
- [ ] Bokeh DOF (focus pull to selected/optimum; MeshBasic-safe surrogate per D9 if real DOF cost is too high)
- [ ] Exponential fog depth falloff (already spec'd; verify density)
- [ ] HDR/wide-gamut canvas path where supported (`configureHighDynamicRange` / float buffers); filament exceeds SDR white on capable displays; SDR fallback visually identical composition
- [ ] Cinema strips chips + tip box (audit F-018); status bar may stay
- [ ] Evidence: `w7-life/l4/cinema.png` + HDR capability note

## L3 — Living stage

**Files:** `main.ts`, `src/lib/url-state.ts`, status bar
- [ ] Catalog diff detect (vs `localStorage` last-seen snapshot): new models enter as ignition pulse, once, then calm
- [ ] Status line: "N new since <date>" mono line when >0
- [ ] First-visit: no pulse (no baseline); never ambient
- [ ] Unit: diff detector pure function test

## L9 — Cinema export artifact

**Files:** `cinema.ts`, `src/lib/share-copy.ts` (extend)

**Pre-map (2026-08-07):** `buildInsightMethodCopy` (share-copy.ts) already produces the method text (title/story/axes/sources/as-of/N/url) — L9 renders it, doesn't rewrite copy. Compositor: offscreen 2880×1800 canvas → ink-field bg → stage capture → wordmark top-left (mono ~11px tracked) → method line bottom → 1px hairline frame → `toBlob` → `a[download]`. Capture risk to check at execution: three renderer needs `preserveDrawingBuffer: true` (or capture synchronously in the same frame as a forced render); Plotly fallback stage via `Plotly.toImage`. Host per AC-D7: cinema export overlay path, NOT re-showing console chrome. Focus-set per `computeCinemaFocusIds` (K≤12).
- [ ] One-key/button export: 2× PNG — density focus-set (K≤12 per AC-I7), fog, ridge, wordmark + as-of + method line composited on-frame
- [ ] Gallery-grade: 1440×900 → 2880×1800; hairline frame; token-true colors
- [ ] Evidence: exported PNG in `w7-life/l9/`

## L10b — Permanent gate

**Files:** CI workflow, `tests/`, tastecheck config
- [ ] tastecheck-pass in CI against DESIGN-SYSTEM.md
- [ ] 3-viewport screenshot goldens (1440/768/375) per PR
- [ ] Deuteranopia simulation check on primary capture (D10 parity)
- [ ] Audit re-score vs `design-baseline.json`: target Design ≥ A−, Slop A held
- [ ] Every scored D1–D14 held ≥90 post-life-layer

---

## Parallelism (binding)

| Allowed | Forbidden |
|---------|-----------|
| L1 ∥ L8 ∥ L10a (disjoint files) | Anything before G0 |
| L5 ∥ L7 after L10a | L2/L6 before L5 palette lock |
| L4 ∥ L9 sequential after L6 | Touching Grok-dirty files pre-commit |

## Fog

Light mode · WebGPU compute particles · n≥20 study · sound design · new Decide features · catalog expansion

## Decisions so far

1. User: "Do all of those things" + "Wait, then I execute" (2026-08-07) — prep now, execute on clean tree
2. Life layer extends, never reopens, W0 paint law + DS refusals
3. Reduced-motion parity is a hard gate on every motion ticket
4. Deploy remains approval-gated (`npm run deploy:pages` refuses without explicit go)
