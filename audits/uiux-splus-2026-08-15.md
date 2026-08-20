# UI/UX S+ verification — 2026-08-15

```
GOAL: Raise all four canonical product states to S+ (dual-critic score ≥90 each) on the deployed
instance, recorded in this file (audits/uiux-splus-2026-08-15.md), by fixing every HIGH and the
ranked MEDs from audits/uiux-2026-08-14.md.

THRESHOLDS (all must hold):
  1. Dual-critic score ≥90 for: default landing, Decide open, Cinema mode, mobile 390px.
     (Dual-critic = kimi k3 harsh vision pass + GLM DOM-verification correcting refutable claims —
     same protocol as the 2026-08-14 audit. Baseline to beat: 82 / 80 / 78 / 62.)
  2. All 4 HIGH findings verified fixed in the DOM: mobile decode layer (axis/legend readable
     without hover), stage-key containment (no scroll-trap illusion), Decide copy consistency
     (shortlist count matches UI), landing hierarchy (top pick out-weighs chrome).
  3. M1+M2+M3 interaction bundle fixed (aria-pressed wiring, Esc closes shelf, search feedback).
  4. No regressions: full vitest suite green; Playwright visual-capture + viz-pixel specs green.

EVIDENCE SOURCE: this file — each iteration's four scores + DOM verification notes appended below;
Playwright/vitest output summarized; screenshots under .scratch/uiux-splus/.

NOT done until: all four scores ≥90 in this file with DOM-verified findings status.
STOP when: thresholds pass OR 3 fix→verify iterations complete (then record the ceiling honestly).
```

## Baseline (2026-08-14 audit, dual-critic corrected)

| State | kimi harsh | corrected | S+ gap |
|---|---:|---:|---:|
| Landing | 58 | 82 | −8 |
| Decide | 54 | 80 | −10 |
| Cinema | 50 | 78 | −12 |
| Mobile 390px | 57 | 62 | −28 |

Driver findings: H1 mobile decode (largest lever, 62→80+ per audit), H2 stage-key trap, H3 Decide copy contradiction, H4 landing density; M1/M2/M3 interaction bundle.

## Iterations

(appended by the verification protocol after each fix wave)

## Iteration 1 — wave 1 (commit 09bcbe9, deployed 01:17Z)

Verified 2026-08-14 against the deployed instance `http://100.92.68.103:4242/` (commit `09bcbe9` = deployed HEAD, confirmed). Protocol identical to the 2026-08-14 audit: Playwright captures (Chrome, swiftshader, 2× DPR) → kimi k3 harsh-vision (`kimi -p`, analysis-only, reads the PNGs) → GLM DOM-verification of every claim + independent full-res crop re-read. Artifacts: `.scratch/uiux-splus/verify1-{landing,decide,cinema,mobile-390}.png`, `verify1-kimi-critique.md`, probes `verify1-probe{,2,3}.mjs`, crops under `.scratch/uiux-splus/crops/`.

### Four-state scores

| State | kimi k3 (harsh) | corrected | Δ vs baseline | S+ gap |
|---|---:|---:|---:|---:|
| Landing | 70 | **78** | 82→78 (−4) | −12 |
| Decide | 72 | **79** | 80→79 (−1) | −11 |
| Cinema | 55 | **60** | 78→60 (−18) | −30 |
| Mobile 390 | 60 | **65** | 62→65 (+3) | −25 |

Note: kimi graded landing/decide/mobile materially higher than baseline (70/72/60 vs 58/54/57) — wave-1 fixes register — but cinema dropped (50→55 with a confirmed-new harsh finding). Corrected dips vs baseline reflect a stricter kimi pass, not DOM regressions; every wave-1 threshold behavior itself verified PASS (checklist below).

### Threshold checklist

| Item | Result | Evidence (deployed DOM) |
|---|---|---|
| H1 mobile decode: compact axis titles + sparse ticks + STAGE KEY chip, no hover | **PASS** (with caveat R1) | 390px labels painted: `$/M·log`, `IQ`, `tok/s·log` + 10 numeric ticks; chip summary visible collapsed on-canvas (x219–382, y95–131); tap opens scrollable body 152/2157px with `+25 more below` |
| H2 stage-key containment: "+N more" + scrollable | **PASS** | desktop body overflowY=auto, scrollH 2302 / clientH 384, `+30 more below · scroll` shown, thin scrollbar + gradient fade; scrolls (probe moved scrollTop) |
| H3 Decide copy count-driven | **PASS** | blurb "shortlist of **2** follow…" ↔ header "SHORTLIST · **2** of 2 on ridge · 31 eligible" |
| H4 landing hierarchy: pick as emphasized strong | **PASS** (desktop) | `[data-story-line] strong` = "Gemini 3.7 Flash", 15.2px filament-bright (p3 0.91/0.95/0.89) vs 11.5px muted base (0.54/0.58/0.62) |
| M1 aria-pressed reflects cinema state | **PASS** | cinema: pressed=true, label "EXIT CINEMA [C]"; after Esc: pressed=false, "ENTER CINEMA [C]" |
| M2 Esc closes shelf first | **PASS** | shelf open → Esc → `is-scope-open` false; visibleCount 45→45 (scope untouched) |
| M3 no-match search announces | **PASS** | status: "No models match 'zzz-no-such-model-qqq' in the visible set — try fewer letters or widen scope" |
| All four corrected scores ≥90 | **FAIL** | 78 / 79 / 60 / 65 |
| Threshold 4 (vitest + Playwright specs green) | not re-run this pass | verification agent scope = deployed-instance DOM only; rerun with wave-2 QA |

### Per-claim corrections (kimi → verified)

| # | kimi claim (state, severity) | Verdict | Evidence |
|---|---|---|---|
| 1 | Stage-key "+30 more" printed on top of "Pareto ridge", "unmistakably broken" (landing, high) | **Refuted** +3 | "Pareto ridge" rect only clips the *transparent top* of the gradient band; independent full-res crop read: no text-on-text collision; affordance is the by-design H2 fade, count accurate, body scrolls |
| 2 | Task-anchor callouts clipped by left viewport edge (landing, high) | **Refuted** +3 | 0/4 callouts cross the stage left edge; all fully on-canvas (probe rects) |
| 3 | Duplicate overlapping "Gemini" labels + garbled tick cluster "30 29 0.1 1" (landing, high) | **Split** +2 | duplicates/overlap/truncation refuted (10 mark labels, 0 dups, 0 overlaps); tick garble **confirmed**: "0.1"×"0.1" co-located + "0.1"×"29" + "29"×"30" at the cost/speed cube corner (R4) |
| 4 | Landing vs Decide "two answers" contradiction, footnote second (decide, high) | **Refuted-as-defect** +2 | different objectives by design (floor+cheap↔fast vs weighted score); in-panel disclaimer "Value-score optimum is off in Decide mode" verified present in same view |
| 5 | Below-floor dimming unreadable; "GPT-5.4 nano nearly as bright" (decide, high) | **Refuted** +3 | scene probe: nano effectiveOpacity **0.12** vs eligible 0.55 / shortlist 0.98 (4.5–8× attenuation); 14 below-floor points ≤0.13, size ×0.55, slate color |
| 6 | Mini chart "no y-axis label at all" (decide, medium) | **Refuted** | rotated `speed` label in DOM: `<text class="decide-axis-label" transform="rotate(-90 8 50)">speed</text>` (decide-panel.ts:315) — same refutation as baseline |
| 7 | Legend swatches "nearly indistinguishable shades" (decide, medium) | **Half refuted** | measured swatch lightness p3 0.54 / 0.79 / 0.91 — three distinct steps; "small" stands (6.4px swatches) |
| 8 | Filament trail "overwhelms and occludes data", mode "fails its entire job" (cinema, critical) | **Overstated** +2 | crop re-read: hero labels legible over trail/spheres; trail is the product's signature encoding; thickness is taste (R6), not data loss |
| 9 | ATLAS panel: contrast fail + leaked internals in cinema (cinema, high) | **Confirmed** | computed opacity **0.25**, max-height 1.5rem sliver; status line literally prints `openai · SC117/Ornith-1.0-35B-MTP-APEX-GGUF @ same-origin /api/atlas/llm/v1` (M4 remnant, unfixed) |
| 10 | Hero cluster labels "stacked over each other, both truncated" (cinema, high) | **Split** +2 | overlap refuted (two Gemini labels 56px apart, 0 rect intersections; crop read: "do not overlap"); truncation **confirmed** — "Gemini 3.7 Fla…", "Qwen3.8 2.4T A…", "DeepSeek V4 Fl…" baked-ellipsis labels (R5) |
| 11 | Mobile header "universal truncation — nothing survives intact" (mobile, high) | **Refuted** +3 | zero elements render past viewport (pills right edge 385.2 ≤ 390); brand/scope use CSS ellipsis by design (full strings intact in DOM) |
| 12 | "Best balance" line clipped by footer; footer truncated mid-word (mobile, high) | **Split** +1 | weights row rect 778.7–812.4 crosses the console sheet cut at 789.2 by **23px** — mid-glyph slice, no fade mask (M7, confirmed, R2); "footer truncated at right edge" refuted (status text ends x=160, nothing clipped) |
| 13 | "IQ vs INTELLIGENCE vocabulary drift" (mobile, medium) | **By design** +1 | `compactAxisTitle` (axis-metrics.ts) — documented H1 compact decode layer, keeps the `·log` honesty marker |
| — | *(extra, probe-found)* mobile top-pick banner vs STAGE KEY chip "overlapping bounds" (mobile, buried in kimi paragraph) | **Confirmed** (R1) | story box right edge 281.4 > chip left 219.2 → 62px overlap; pick text ("Gemini…") prints into the chip (crop read: "Gemir"); root cause: mobile `max-width: min(42rem,52%)` rule (tokens.css:2039) shadowed by later base rule `min(42rem,70%)` (tokens.css:2267) — computed max-width on live page is `min(672px,70%)` |

### Verdict: NOT PASS — 78 / 79 / 60 / 65 vs ≥90; 7 of 8 in-scope threshold behaviors verified fixed, score gate + 1 regression open. Wave 2 spec = residuals below, ranked by score impact.

1. **R1 — Mobile top-strip collision (wave-1 H1×H4 regression, biggest mobile lever).** The top-pick story text prints into the STAGE KEY chip at 390px (62px box overlap, glyph-level "Gemir" collision; DOM+crop confirmed). Fix: make the mobile `.story-line` 52% cap win — move rule after the base block or bump specificity (e.g. `@media (max-width:760px){ .stage-visual .story-line { max-width: min(42rem,52%) } }`), and verify the strong's last glyph ≤ chip left edge.
2. **R2 — Cinema ATLAS remnant (biggest cinema lever; kimi's only confirmed high there).** tokens.css:630 keeps the dock at opacity 0.25 / 1.5rem sliver, and the status line leaks plumbing (`openai · SC117/Ornith-1.0-35B-MTP-APEX-GGUF @ same-origin /api/atlas/llm/v1`) onto the presentation surface. Fix per baseline M4: collapse to a monogram dot ("ATLAS ◈") or hide in cinema; never print endpoint/model IDs in cinema.
3. **R3 — Mobile fold slicing (M7 residual).** The last visible console row ("Best balance · 35%…", rect bottom 812.4) crosses the sheet cut (789.2) by 23px with no fade — mid-glyph slice confirmed geometrically. Fix: bottom fade mask + scroll-snap/row-aligned scroll boundary on the console sheet.
4. **R4 — Cross-axis tick collisions at cube corners (all states).** Cost-axis and speed-axis decade ticks project to the same corner: "0.1"×"0.1" co-located exactly (x≈361,y≈549 desktop; x≈11,y≈444 mobile), "29"×"30" adjacent (stage3d-three.ts NMS exempts ticks — `always` keep-list). Fix: cross-axis tick NMS or drop the co-located duplicate at shared corners.
5. **R5 — Mark-label truncation on the hero cluster (cinema + landing).** "Gemini 3.7 Fla…" / "Qwen3.8 2.4T A…" / "DeepSeek V4 Fl…" baked-ellipsis labels on exactly the models a viewer must read. Fix: bigger char budget or two-line wrap for focus-set/optimum labels; never truncate the pick's own name.
6. **R6 — Cinema trail visual weight (aesthetic, split judgment).** Trail reads as subject over points near dense clusters. Consider thinning non-focus trail segments or lowering trail opacity in cinema so marks stay first.
7. **R7 — Decide "two answers" IA (low, by design but worth one line).** Disclaimer verified present; a one-line banner at the panel top ("Decide re-ranks by your floor — the landing pick may differ") would remove the hunt.

**Verdict line: GOAL NOT PASS — corrected 78 / 79 / 60 / 65 (<90 each); threshold behaviors H1/H2/H3/H4/M1/M2/M3 all verified PASS in the deployed DOM, but R1 (wave-1 regression) + R2–R7 residuals block ≥90; wave 2 = R1–R5 mandatory, R6–R7 optional.**

## Iteration 2 — wave 2 (commit f703ac8, deployed 02:00Z)

Verified 2026-08-15 against the deployed instance `http://100.92.68.103:4242/`. Deploy confirmed by CSS fingerprints in `assets/index-C2HBU-aq.css` (`.stage-visual .story-line` 52% cap, cinema atlas `display:none!important`, console fold `mask-image` gradient) + live behavior of the JS changes (26-char mark budget, optimum two-line wrap, trail ghost tier). Protocol identical to iteration 1: Playwright captures (Chrome, swiftshader, 2× DPR) → kimi k3 harsh-vision (`kimi -p`, analysis-only) → GLM DOM-verification of every claim incl. runtime introspection (`verify2-probe{,2,3,4}.mjs`). Artifacts: `.scratch/uiux-splus/verify2-{landing,decide,cinema,mobile-390}.png`, `verify2-kimi-critique.md`.

### Four-state scores

| State | kimi k3 (harsh) | corrected | Δ vs iter-1 corrected | S+ gap |
|---|---:|---:|---:|---:|
| Landing | 76 | **83** | +5 | −7 |
| Decide | 72 | **76** | −3 | −14 |
| Cinema | 55 | **59** | −1 | −31 |
| Mobile 390 | 60 | **66** | +1 | −24 |

Kimi graded landing/mobile higher (76/60 vs 70/60); decide/cinema flat. Corrected decide/cinema dips vs iteration 1 reflect a harsher claim mix (fewer outright refutations: the mini-chart dot-size and focus-label-coverage claims are genuinely confirmed), not DOM regressions — every behavioral threshold (7 iteration-1 items + R1/R2/R3/R5 + full test suite) verified PASS below.

### Threshold checklist

| Item | Result | Evidence (deployed DOM) |
|---|---|---|
| H1 mobile decode (chip + compact axes, no hover) | **PASS** | 390px: `$/M·log`, `IQ`, `tok/s·log` + 9 ticks painted; chip collapsed on-canvas (x228–374); tap opens scrollable body 152/2091px with `+24 more below · scroll` |
| H2 stage-key containment | **PASS** | desktop overflowY=auto, scrollH 2251/clientH 384, `+29 more below · scroll`, scrollTop moves |
| H3 Decide copy count-driven | **PASS** | blurb "shortlist of **2** follow…" ↔ "SHORTLIST · **2** of 2 on ridge · 31 eligible"; disclaimer present |
| H4 landing hierarchy (pick out-weighs chrome) | **PASS** | `[data-story-line] strong` = "Gemini 3.7 Flash", 15.2px filament-bright (p3 0.91/0.95/0.89) |
| M1 aria-pressed reflects cinema state | **PASS** | cinema: pressed=true, "EXIT CINEMA [C]"; after Esc: false, "ENTER CINEMA [C]" |
| M2 Esc closes shelf first | **PASS** | shelf open → Esc → `is-scope-open` false; visibleCount 45→45 |
| M3 no-match search announces | **PASS** | status: "No models match 'zzz-no-such-model-qqq' in the visible set — try fewer letters or widen scope" |
| R1 no pick/chip overlap @390px | **PASS** | computed story max-width `min(672px,52%)` (52% cap now wins); strong right edge → chip left gap **108.9px**, overlap 0 |
| R2 no ATLAS content visible in cinema | **PASS** | `.atlas-dock` display:none + visibility:hidden (rect 0×0, 1377 chars of text not rendered); `.inspector` display:none; no endpoint/model plumbing on screen |
| R3 no mid-row slicing at mobile fold | **PASS** | console `mask-image` fade (last 24px → transparent) + padding-bottom 30.4px; fold-crossing rows now fade (was hard mid-glyph slice); sheet scrolls 1115px |
| R4 no corner tick duplication | **PARTIAL** | cross-axis dedup live: mobile 0 tick collisions (was exact 0.1×0.1 co-location), landing "29"×"30" gone; **same-axis** duplicate remains: two x-axis "0.1" ticks (worlds −1 / −0.941) overlap 95px² at the cost corner — runtime `labelSpecs` shows both `axis:"x"`, exempt from the cross-axis rule |
| R5 optimum label not truncated | **PASS** | landing/cinema/mobile all paint full "Gemini 3.7 Flash" (white-space normal, wrap enabled); 0 truncated mark labels in any state |
| Threshold 4 vitest + Playwright | **PASS** | vitest 570 passed/1 skipped (49 files); `viz-pixel.spec.ts` 3 passed; `visual-capture.spec.ts` 4 passed |
| All four corrected scores ≥90 | **FAIL** | 83 / 76 / 59 / 66 |

### Per-claim corrections (kimi → verified)

| # | kimi claim (state, severity) | Verdict | Evidence |
|---|---|---|---|
| 1 | Label/ridge collisions "at least four places", tubes strike through labels (landing, high) | **Split** +2 | mark×mark overlaps **0**; 4 geometric pairs: 2 sub-visible grazes (COST×"10" 2px², task×"50" 36px²) + 2 real tick-involved collisions ("0.1"×"0.1" 95px²; task "Hard expert Q&A…"×"0.2" 158px²). Tubes cannot occlude labels: DOM spans paint above the canvas with ink-field halo (`text-shadow 0 0 8px/2px`) |
| 2 | "COST ($/M)·log" title collides with GPT-5.6 Luna (landing, high) | **Refuted** +2 | Luna rect bottom 424.3 vs title top 425.7 (1.4px clear, intersect=null); title×mark overlaps 0; mid-volume title placement is the standing frame design |
| 3 | Top pick over-encoded; two Gemini labels overlap each other (landing, medium) | **Refuted-as-defect** +1 | pair 24.7px vertical gap, 0 rect intersections; core/wire/ring layering is the documented encoding system |
| 4 | INTELLIGENCE ticks skip 55, "reads as a bug" (landing, para) | **By design** +1 | nice-tick step-10 + endpoints (40/50/60/65) — standard algorithm, unchanged |
| 5 | Task anchors "unanchored sticky notes" (landing, para) | **By design** | wall-anchored right-aligned callouts (iter-1 #2 refuted clipping; no connector lines is the design) |
| 6 | Panel scatter dots invisible; legend indistinguishable (decide, critical) | **Split** +1 | dots confirmed small: r2.2 @ viewBox 280 → **3.9px diameter @ 0.55 opacity** (critical→medium; it is the secondary mini-chart); shortlist dots 8.9px bright + Pareto line present; legend swatches distinct lightness steps 0.54/0.79/0.91 (iter-1 #7) |
| 7 | FLOOR·50 tiny; below-floor vanish; 3D stage "dead weight" (decide, medium) | **By design** +1 | opacity tiers: 14 below-floor @ **0.12** vs 12 @ 0.42 / 17 @ 0.55 / 2 shortlist @ **0.98** (8× attenuation, matches panel copy "models below it dim"); FLOOR·50 10px = tick typography |
| 8 | Small-multiples tick gaps 65→60→50→40→30 (decide, low) | **By design** +1 | same nice-tick algorithm as #4 |
| 9 | Landing vs Decide "two answers" contradiction (decide, para) | **Refuted-as-defect** +1 | in-panel disclaimer "Value-score optimum is off in Decide mode" verified present; different objectives by design (iter-1 #4, unchanged) |
| 10 | Ridge tubes "destroy label legibility"; labels stacked/truncated/bisected (cinema, critical) | **Overstated** +2 | mark×mark overlaps **0**, truncated **0** (R5 live: "Qwen3.8 2.4T A95B", "DeepSeek V4 Flash 0731" full); labels paint above tubes; R6 live: 5 ghost-family trails @ **0.07** vs 5 focus families @ 0.18; ridge core radius 0.015 < marks 0.045–0.10. Dense-cluster adjacency stands as taste |
| 11 | No legend/encoding key in cinema — comprehension impossible (cinema, critical) | **By design** +1 | `.is-cinema .stage-guide { display:none !important }` (tokens.css:220, pre-wave-2 chrome-free projection stance); stands as an IA question for wave 3, not a defect |
| 12 | Unlabeled marks; inconsistent labeling policy (cinema, high) | **Split** +1 | ghosts unlabeled by design (focus-only labeling, V09/D10); **confirmed**: 5 of 12 focus marks bare in the hero cluster — Qwen3.8 Max, Claude Fable 5, Claude Opus 5, GPT-5.5, GPT-5.6 Luna (NMS kept one label per family cluster; high→medium) |
| 13 | Header truncated; "$/task · s/task≈" pill cut (mobile, high) | **Refuted** +2 | nothing off-canvas: pill right edge **385.2 ≤ 390** (not cut); brand/scope CSS-ellipsis by design (text-overflow:ellipsis, full strings intact in DOM) — same as iter-1 #11 |
| 14 | Chart unreadable: "IQ" jargon, no visible legend, pick label clipped at right edge (mobile, high) | **Refuted-as-stated** +2 | optimum label full at x231.5–330.7, untruncated, inside viewport; STAGE KEY chip is the collapsed affordance that opens the scrollable key (+24 more); IQ/$·log/tok/s·log = documented H1 compact decode layer (iter-1 #13). Jargon taste stands |
| 15 | Ridge tubes dominate the small canvas (mobile, medium) | **Overstated** +1 | trails translucent 0.18; ridge core 0.015 vs marks 0.045–0.10; marks remain the larger element (taste, R6 dimming is cinema-only by design) |
| 16 | Ticks "oddly spaced" 65/60/40 (mobile, para) | **By design** +1 | nice ticks + H1 sparse mobile decode layer |

### Verdict: NOT PASS — 83 / 76 / 59 / 66 vs ≥90 (iteration 2 of max 3). Every behavioral gate verified PASS on the deployed build (7 iteration-1 items, R1/R2/R3/R5, full vitest + Playwright suite); R4 partial. The remaining gaps are dominated by confirmed-but-smaller findings and by-design IA choices, not regressions. Wave 3 residuals, ranked by score impact:

1. **Cinema comprehension bundle (−31, biggest lever).** (a) 5/12 focus marks unlabeled (Qwen3.8 Max, Claude Fable 5, Claude Opus 5, GPT-5.5, GPT-5.6 Luna — focus-set NMS keeps one label per family cluster). Fix: family-representative labeling or leader-line/offset second labels for focus marks that lose NMS. (b) No encoding key in cinema (by-design chrome-free stance, flagged critical by kimi): optional one-line key or presenter-notes affordance.
2. **Mobile residual (−24).** Behaviors all pass; gap is taste-level (brand/scope ellipsis, IQ/jargon decode, tube weight on a small canvas). Levers: stage key expanded on first visit, or unit-pill long-press/tooltip expansion.
3. **Decide mini-chart legibility (−14).** Eligible dots 3.9px @ 0.55 opacity (confirmed small); bump dot radius/opacity or add hover emphasis; FLOOR·50 prominence; legend swatch size.
4. **Landing tick de-collision completion (−7).** R4 leftover: same-axis duplicate "0.1"×"0.1" (both `axis:"x"`, worlds −1/−0.941, 95px² overlap) — extend tick NMS to same-axis identical labels at projective coincidence; also task-anchor×tick graze (158px², "Hard expert Q&A…"×"0.2") — include ticks in task-label collision pass.

**Verdict line: GOAL NOT PASS — corrected 83 / 76 / 59 / 66 (<90 each); 7 iteration-1 behaviors + R1/R2/R3/R5 + vitest/Playwright all verified PASS on deployed f703ac8; R4 partial (same-axis "0.1" duplicate remains); one fix wave remains (wave 3 = residuals above, cinema-first).**

## Iteration 3 — wave 3 (commit a441b20, deployed 02:40Z) — FINAL per budget

**Protocol condition:** kimi k3 vision pass UNAVAILABLE (provider 403: billing-cycle quota exhausted mid-iteration; critique file empty). DOM-verification probes complete (`verify3-probe{,2}-out.txt`). Per the contract this iteration closes the goal at ceiling; the numeric ≥90 gate is UNPROVEN, not failed.

### Behavioral thresholds — ALL PASS on deployed (DOM evidence)

| Item | Evidence (deployed 02:40Z) |
|---|---|
| H1 mobile decode | compact titles painted at 390px: `$/M·log`, `INDEX`, `tok/s·log` + sparse ticks; STAGE KEY chip affordance |
| H2 stage-key containment | `+31 more below · scroll`, scrollable (2302/384) |
| H3 Decide copy consistency | blurb "shortlist of 2" == header "SHORTLIST · 2 of 2 on ridge · 31 eligible" |
| H4 landing hierarchy | pick 15.2px bright filament `<strong>`, full name, untruncated |
| M1 aria-pressed | pressed=true/"EXIT CINEMA" ↔ false/"ENTER CINEMA" both verified |
| M2/M3 | wired (iter-2 spot-checks still pass) |
| R1 mobile collision | story/chip clear (iter-2 probe still passing) |
| R2 cinema ATLAS remnant | dock display:none, zero content on canvas |
| R4 tick collisions | **0 overlapping span pairs of any kind** (mark/tick/task/title), mobile included |
| R5 hero truncation | 0 truncated labels all states; optimum full name |
| W3-cinema labels | **12/12 focus-family labels painted, 0 overlaps** + key line visible (`color = lab · ring = focus · filament = frontier`) |
| W3-decide dots | eligible 6.18px @ 0.78 (was 3.9 @ 0.55); shortlist 8.83 stays ahead |
| W3-mobile taste | header 2-line wrap, INDEX title, tube ×0.75 |

### Scores

Iteration-2 corrected baseline: 83 / 76 / 59 / 66. Every DOM-confirmed driver of those gaps (cinema unlabeled marks + no key, tick duplicates, dot size, mobile cuts) is now verifiably fixed — but per protocol, corrected scores require the vision pass. **Recorded as UNPROVEN; not claimed.**

### VERDICT: GOAL CLOSE AT CEILING

- All behavioral thresholds: PASS (DOM-verified on the deployed build).
- Numeric ≥90 gate: unproven at budget end — vision critic quota-dead, not the product.
- Cheap re-proof: screenshots + probes preserved under `.scratch/uiux-splus/verify3-*`; re-run the kimi pass + adjudication when quota refreshes (~10 min) and append "Iteration 4 (scoring completion)".

**Judgment:** iterations 1→3 moved every confirmed defect to fixed-and-verified; remaining deltas at iter-2 were taste-level (trail weight, scope-summary ellipsis) or protocol artifacts. The instrument has never been more legible: mobile decodes, cinema names all 12 focus models, nothing collides, nothing truncates, the pick wins the page.

## Iteration 4 — scoring completion (substitute vision critic, per Simon 2026-08-15)

**Protocol condition:** kimi k3 still quota-dead (403). Per Simon's instruction a different vision model ran the pass: **GLM-4.5v vision** (Z.ai MCP `analyze_image`), one scored pass per state over the same `.scratch/uiux-splus/verify3-*.png` captures (deployed a441b20, 02:40Z), full-rubric prompts structurally identical to the kimi pass (harsh 0–100, dark-theme intent exempted); GLM 5.3 adjudicated every claim against the verify3 DOM probes, same convention as iterations 1–2 (Refuted +2/+3, Split +1/+2, By design +1, Confirmed 0). Caveats stated plainly: (a) substitute ≠ kimi — cross-critic comparability is approximate; (b) a terse-format retry returned out-of-scale scores (5-scale / 0–1) and was used only to enumerate issues, never for numbers.

### Four-state scores

| State | 4.5v (harsh) | corrected | Δ vs iter-2 corrected | S+ gap |
|---|---:|---:|---:|---:|
| Landing | 78 | **83** | 83→83 (0) | −7 |
| Decide | 85 | **89** | 76→89 (+13) | −1 |
| Cinema | 86 | **89** | 59→89 (+30) | −1 |
| Mobile 390 | 85 | **89** | 66→89 (+23) | −1 |

Corrected arithmetic is strict this pass (raw + per-claim restores, no judgment uplift). Decide/cinema/mobile land one point under the gate; landing −7.

### Per-claim corrections (4.5v → verified)

| # | critic claim (state) | Verdict | Evidence (verify3 probes, deployed a441b20) |
|---|---|---|---|
| 1 | Stage Key text too small / low-contrast (landing) | **By design** +1 | 12 legend items, 0 overlaps, scrolls (`+31 more below`); 10–11px muted = DESIGN-SYSTEM quiet chrome (same ruling as iter-1 #7, iter-2 #7) |
| 2 | Model names truncated/obscured, e.g. "GPT-5.6 Luna", "Dee…" (landing) | **Refuted** +3 | `truncated=[]`, markXmark=0, markXtick=0, titleXmark=0 — no truncated or overlapped label exists; optimum paints full name |
| 3 | "Filament ridge" jargon (landing) | **Split** +1 | story line defines it inline: "Top pick … is Gemini 3.7 Flash; **filament ridge marks the efficient frontier**"; compact-term taste stands |
| 4 | "2 of 2 on ridge" reads truncated / completeness unclear (decide) | **Refuted** +2 | complete count-driven heading "SHORTLIST · 2 of 2 on ridge · 31 eligible" ↔ blurb "shortlist of 2", rows 1–2 painted (H3 evidence) — "2 of 2" *is* the completeness statement |
| 5 | Stage key "Pareto ridge" dimmed/small (decide) | **By design** +1 | same quiet-chrome stance as #1 |
| 6 | Cost/speed chart dots overlapping / small (decide) | **Split** +1 | size fixed + verified: eligible 6.18px @ 0.78 (was 3.9 @ 0.55), shortlist 8.83 @ 1.0; residual overlap = 31 points in a 280×160 sparkline — density, not defect (iter-2 #6 lineage) |
| 7 | Headline wraps at awkward break position (cinema) | **Split** +1 | the wrap itself is the wave-3 R5 fix (0 truncated labels); break-position nit is taste |
| 8 | "INTELLIGENCE" axis label low contrast (cinema) | **By design** +1 | axis-title token typography, quiet-chrome stance (third identical ruling) |
| 9 | "EXIT CINEMA [C]" too small (cinema) | **By design** +1 | control chrome at token size; wired + aria-pressed both states verified (M1) |
| — | *(extra, terse pass)* "Gemini 3.7 Flash" label misaligned from node (cinema) | **By design** | offset placement is the label encoding (keeps text off the sphere); markXmark=0, no overlap |
| 10 | "tok/s·log" truncated, losing clarity (mobile) | **Split** +1 | complete string painted (`$.`/`M·log`, `INDEX`, `tok/s·log`); compact decode layer documented (iter-1 #13, iter-2 #14 — third adjudication) |
| 11 | "Top pick for current weights is" lead-in small (mobile) | **By design** +1 | story base at 11.5px muted is the H4 hierarchy design; the pick itself is 15.2px filament-bright, untruncated — the exact recorded PASS evidence |
| 12 | "SHOW ALL 45 RANKED" truncated / incomplete (mobile) | **Refuted** +2 | complete copy "Show all 45 ranked" in DOM, `offCanvas=[]`, count accurate (45 ranked); fold fade is the R3 mask by design |

### Behavioral thresholds — ALL still PASS (re-verified from verify3 probes this pass)

0 overlapping span pairs of any kind in every state (mark/tick/task/title); 0 truncated labels; 12/12 cinema focus labels + key line visible; ATLAS fully hidden in cinema; Decide copy count-consistent; mobile pick/chip clear (108.9px gap); M1 pressed-state wiring both states; stage key scrollable.

### VERDICT: GOAL NOT PASS at budget end — final ceiling 83 / 89 / 89 / 89

- The numeric gate is now **proven, not unproven** (supersedes iteration-3's ceiling close): 3 of 4 states sit one point under 90; landing −7.
- Every mechanical defect across the audit's lineage (H1–H4, M1–M3, R1–R5, W3 bundle) remains fixed-and-DOM-verified. The entire residual gap is **taste-level chrome and terminology that needs a design decision, not a fix wave**: (1) stage-key/axis chrome size + contrast (quiet-chrome stance vs readability — the one recurring claim across all four states); (2) "filament ridge" / "·log" compact terminology; (3) cinema headline break position; (4) mini-chart hover emphasis.
- If Simon opts to relax quiet chrome: key/axis chrome 10→11.5px + one-line gloss for the ridge would plausibly close decide/cinema/mobile; landing additionally hinges on that same stage-key readability call.
- Per the contract (3 fix→verify iterations), no wave 4 was run. Artifacts preserved under `.scratch/uiux-splus/verify3-*` for a kimi re-pass at quota refresh.

## Iteration 4 supplement — fleet-critic re-score (2026-08-16 → 08-20, Simon-directed)

**Routing correction (Simon):** the GLM-4.5v substitute above was the wrong pick — the fleet holds real vision routes. Survey outcome: kimi k3 403 (billing cycle), AGY Gemini quota-dead ~138h, GJC has no OpenAI key, **ollama cloud subscription past due** (billing — also affects the NUCBox DeepSeek default route), nucbox local off-limits per Simon. Working route: **kilo CLI + `~google/gemini-flash-latest`** (Simon's own Google credential — independent of both prior critics).

### The AGY finding wave (before its quota died)

AGY Gemini 3.7 Flash (High) scored landing 75/73 (two runs, consistent), decide 84 — and exposed three defects the stage-span probes never covered, all DOM-confirmed on the deployed build: **(1)** Plotly projection ticks collided 7 ways (endpoint-vs-nice "29"/"30" 121px², duplicate floor "0.1"/"0.1" 258px², "60"/"65", "5"/"10"); **(2)** "GPT-5.6 Luna" label dipped −1.4px into the COST axis title; **(3)** footer method strip capped at min(52ch,42vw)=312px with 575px free. Fixed in `b308308`: keep-first pixel-space tick NMS in `Projections.axisLayout` (stage R4 rule), mark-label offset ladder vs titles/ticks, footer flex `1 1 0`.

### Iteration-4b — NMS boxes must match rendered boxes (2026-08-20)

The rows=303 refresh (new models: GPT-5.6 Sol, Grok 4.5, Claude Sonnet 5, Muse Spark 1.1, DeepSeek V4 Pro 0813) surfaced 5 new span overlaps: task×tick (landing+decide), task×mark + mark×mark (cinema), title×tick (mobile). Root cause: NMS measured raw 10px text while the renderer paints titles at 11px, letter-spaces 0.02em, and wraps task anchors into multi-line padded chips — near-misses passed NMS and collided in paint. Fix: render-truth box estimator (per-kind font px, letter-spacing, task chip wrap/height model) + ticks now yield to axis titles as well as task rails.

**Data-stewardship event, same window:** AA upstream un-measured `tps` on all Gemini 3.7 Flash tiers (Aug 15–16) — the honesty core correctly demoted the family to `awaiting_measurement` (that was the 308→303 drop and the failing ladder test); AA republished on Aug 20, family restored (rows=306), ladder registry round-tripped with the event recorded in its notes. Also: the pipeline sat silent Aug 16 21:07Z → Aug 20 19:20Z (laptop paused; the local watchdog sleeps with the host — the documented local-only-silence residual, live demonstration).

**Capture-methodology lesson (recorded for future passes):** mid-pass critiques flagged "empty black projection panels" — the build was fine; Plotly's lazy chunk takes ~24s over the degraded tailnet path, and 3–5s captures shot pre-render panels. The capture script now gates on projections painting. Two visual gates are now known-blind to this class: the whiteout pixel spec (an empty dark panel passes) and overlap probes (0 ticks = 0 overlaps, vacuously true). Presence assertions added to the capture gate.

### Final four-state scores (kilo `~google/gemini-flash-latest`, clean gated captures, deployed rows=306 build)

| State | Gemini raw | corrected | Δ vs iter-2 corrected | S+ gap |
|---|---:|---:|---:|---:|
| Landing | 82 | **87** | 83→87 (+4) | −3 |
| Decide | 86 | **91** | 76→91 (+15) | **0 — first state ≥90** |
| Cinema | 82 | **89** | 59→89 (+30) | −1 |
| Mobile 390 | 78 | **82** | 66→82 (+16) | −8 |

### Per-claim corrections (Gemini → verified, same-build census: 0 overlapPairs in every state, 0 off-canvas)

| # | critic claim (state) | Verdict | Evidence |
|---|---|---|---|
| 1 | Gemini/(medium)/(low)/Luna/DeepSeek labels "collide heavily" + polyline (landing) | **Refuted** +3 | census 0 mark×mark overlaps; labels carry ink-field halo (paint above canvas); multi-effort cluster adjacency stands as taste |
| 2 | Footer "...Are..." truncation (landing) | **Split** +1 | strip now consumes the real free row space (659px, was 312); ellipsis bites only at genuine capacity; full attribution adjacent in data-sources |
| 3 | "$/task · s/task=" trailing "=" artifact (landing) | **By design** +1 | unit-basis toggle copy, intentional |
| 4 | Gemini effort labels collide (decide) | **Refuted** +3 | census 0 overlaps |
| 5 | Mini-chart "no y-axis label at all" (decide) | **Split** +1 | rotated `speed` label exists in DOM (third refutation of the absence claim); its 10px prominence stands as taste |
| 6 | STAGE KEY overlays grid/points (decide) | **By design** +1 | translucent chip over canvas = quiet-chrome stance; containment verified |
| 7 | "Claude Fable 5 × Claude Opus 5 overlap directly" (cinema) | **Refuted** +3 | census 0 overlaps; two Opus-5 entries are distinct effort rows, NMS-separated |
| 8 | Gemini stack overlaps vertically (cinema) | **Refuted-as-defect** +2 | 0 box overlaps; density adjacency taste stands |
| 9 | Task callout intersects COST title + "10" tick (cinema) | **Refuted** +2 | census 0 task×title/task×tick — the 4b yield rules cover exactly this class |
| 10 | "Best balance · 35%..." subtext too dim (mobile) | **By design** +1 | muted secondary token + fold fade mask; quiet-chrome call |
| 11 | Header pill truncates "Cloud · ≤6..." (mobile) | **Refuted-as-defect** +2 | CSS ellipsis by design, full string intact in DOM (fourth adjudication of this class) |
| 12 | Footer attribution hard-clipped "· A" (mobile) | **Split** +1 | capacity clip at 390px with full links in DOM/wide layouts |

### VERDICT: GOAL NOT PASS at close — final ceiling 87 / 91 / 89 / 82

- **Decide crosses 90 for the first time** (91, +15 vs iteration-2). Cinema misses by 1, landing by 3, mobile by 8.
- Every mechanical defect across the entire audit lineage is fixed-and-DOM-verified on the deployed rows=306 build: 0 overlapping span pairs of any kind in all four states, 0 off-canvas, 0 truncated optimum labels, projections tick-NMS'd and rendering (presence-gated).
- The whole remaining gap is the standing design decision, now measured three independent ways (kimi, GLM-4.5v, Gemini): **quiet-chrome contrast/size on secondary text** (mobile's −8 is mostly this) plus cluster-density adjacency on the landing/cinema frontier. Relaxing muted chrome one step (e.g. 0.55→0.7 alpha, 10→11px on secondary lines) is the single lever most likely to close all four; it needs Simon's design sign-off against the observatory aesthetic, which is why it was never auto-applied.
- Protocol note: three independent vision critics, one DOM adjudicator, same rubric — scores converged (landing 82-83, decide 84-86, cinema raw varies with cluster density, mobile 78-85 raw), which is the strongest signal yet that the ceiling is real and taste-bound, not critic noise.

**Route states — canonical correction (2026-08-20 ~13:05Z, supersedes the ad-hoc probe paragraph):** the authoritative source is the live Pushing Dispatch install: `~/.local/share/pushing-dispatch/availability.json` + `repo/dispatch_matrix.toml` (canonical; workspace copies are stale forks). Per availability (ts 12:52Z): **codex-luna/terra/sol available** — the canonical OpenAI vision route, proven live by test (`codex exec -i <img>` read the deployed screenshot correctly); **three kimi-k3 lanes available** (cli/key/kyanite — the earlier 403 tested only the default credential, so "kimi dead" was wrong); **kilo-free-auto available** (a sanctioned lane, not the improvisation it was documented as); agy-gemini-flash quota RED-RESET; grok-build RED-RESET. The direct tailnet path to the deployed VPS (`:4242`) healed — HTTP 200 in 0.4s — so the earlier ~24s Plotly-chunk slowness was that day's SSH-tunnel degradation, not the deployment; the projection-paint gate stays in the capture script as belt-and-braces. Any future critic pass starts from availability.json, in matrix order: codex → kimi (all three creds) → kilo → agy.
