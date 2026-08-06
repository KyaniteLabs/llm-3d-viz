# PRD: S+ Observatory quality (filament hierarchy train)

**Status:** ready-for-agent  
**Authority:** RALPLAN-s-plus-observatory-quality (Critic APPROVE) · MAP-s-plus-observatory-quality · decision-filament-hierarchy  
**Baseline:** live viz.kyanitelabs.tech · commit 100709f · independent critic 41/100 HOLD  
**Bar:** W0–W4 binary MAP accepts · W5 every scorecard dim ≥90 · role means ≥92 · stretch composite ≥96  

## Problem Statement

Analysts open Model Observatory to compare LLMs on speed × cost × intelligence and decide which models to use. Today the stage reads as a rainbow confetti scatter: lab brand colors at equal loudness, multi-layer rings, high-opacity trails, and a closed STAGE KEY. The DESIGN-SYSTEM promise—filament ridge burning white-hot with off-frontier subtraction—is not legible. Independent design, craft, and data-viz reviews rejected the live product (41/100). Decide mode’s floor plane is strong, but Explore chrome leaks and the SPEC hybrid of simultaneous 3D + linked 2D is broken by exclusive tabs. The user requires enterprise S+ quality: **≥90 on every independent scorecard dimension**.

## Solution

Ship the **S1 Filament Console train**: hierarchy wins over equal-chroma brand loudness via one shared paint encoding; always-on open encoding HUD; three-section Explore inspector; Decide exclusivity; structural linked 2D strip under 3D; mobile stage-first; cinema craft; then independent triple re-veto with a fixed D1–D12 scorecard. Lab multi-color identity remains on frontier, hover, solo, and selection. Mid-train gates are binary evidence checklists with fail-stop; numeric ≥90 only at W5.

## User Stories

1. As an analyst, I want the Pareto ridge to read as a single white-hot filament, so that efficient models stand out immediately.
2. As an analyst, I want dominated models quieter than frontier models, so that the canvas is not confetti.
3. As an analyst, I want lab brand identity on frontier and when I solo a family, so that I still recognize providers.
4. As an analyst, I want glyph meaning (sphere/octa, solid/wire) visible without a manual, so that openness and reasoning are readable.
5. As an analyst, I want size to track value-score honestly, so that better fits look larger without fighting color noise.
6. As an analyst, I want multi-effort trails visible but quiet until I solo, so that ladders help without spaghetti.
7. As an analyst, I want an always-visible encoding HUD, so that channels match the stage 1:1 on first paint.
8. As an analyst, I want zero emoji on marks and chrome, so that the product feels like an instrument.
9. As an analyst, I want inputs and sliders to match the ink field, so that white native controls do not break the material.
10. As an analyst, I want table numerals rounded for scan, so that IQ/cost/TPS are operational not raw dumps.
11. As an analyst, I want Explore chrome in Selection / Score / Navigate only, so that the console is calm.
12. As an analyst, I want Decide mode to hide Explore navigate/find/weights, so that floor → eligible → shortlist is the only job.
13. As an analyst, I want a legible cost×speed chart and shortlist in Decide, so that I can pick without the 3D alone.
14. As an analyst, I want eligible/ridge/shortlist badges from Decide authority, so that counts stay consistent.
15. As an analyst, I want linked 2D projections while in 3D mode, so that position comparisons are honest (SPEC hybrid).
16. As an analyst on mobile, I want the stage first and inspector as a sheet, so that chrome does not bury the canvas.
17. As an analyst, I want selection names and scores in a clear type hierarchy, so that the readout scans like a terminal.
18. As an analyst in cinema, I want density-filtered marks and DOF, so that exports look observatory-grade.
19. As a reviewer, I want evidence packs per ticket, so that binary gates are auditable.
20. As a product owner, I want independent critic/designer/dataviz scorecards at the end, so that ship is fail-closed ≥90.
21. As a keyboard user, I want help keys behind a help control, so that the permanent key dump is gone.
22. As a color-vision-deficient user, I want lab colors separable enough after hierarchy, so that identity survives CVD checks.
23. As a developer agent, I want one paint seam for Three/Plotly/projections/sweep/legend, so that hierarchy cannot desync.
24. As a developer agent, I want fail-stop if a ticket’s checklist fails, so that polish cannot land on broken paint.
25. As a stakeholder, I want eng jargon (`stage r3f`, DecideResponse) out of UI, so that copy is human.

## Implementation Decisions

- **Critical path W0→W5** is linear with fail-stop; no parallel palette rewrites across W1–W3.
- **Single paint seam:** hierarchy + luminance + endpoint emphasis + `showRing`/`showCore` live in the shared encoding path consumed by all renderers and legend.
- **Luminance:** WCAG sRGB L; non-frontier target_L = 0.55 × L(same-lab frontier fill else filament-dim); clamp L ≥ 0.08.
- **Endpoint emphasis:** mid-effort size ×0.70 and fill α ≤0.55; endpoints 1.0; trail idle α ≤0.45; solo/hover ≥0.85.
- **Ring law (single source):** showRing/showCore true iff solo | selected | ?brand=full | density-expand(=brand full) | cinema focus-set member; else false.
- **Pictographs banned:** including ⚡ and ★ on marks/labels.
- **W0 amends DESIGN-SYSTEM** before code: carnival refusal; rings default off; filament ridge continuous; A2 idle trail supersession.
- **W2 HUD open by default** (max-height ~56–72px scroll), never collapsed-default.
- **Explore inspector fixed sections:** Selection | Score | Navigate.
- **Decide non-render list:** NAVIGATE, FIND+chips, key dump, Explore leaderboard, presets, weight sliders; keep floor/bias/shortlist/chart/Copy decision.
- **W4 structural hybrid:** simultaneous 2D strip ≤148px under default 3D; TABLE exclusive; cinema may hide strip.
- **Mobile:** stage ≥52vh; inspector bottom sheet peek name+score.
- **Mid-train gates binary** (MAP accepts + evidence dirs); **numeric ≥90 only W5**.
- **W5 scorecard D1–D12** with role columns; each scored dim ≥90; each role mean ≥92; global = mean of role means.
- **No deploy** until W5 SHIP + explicit Simon go.

## Testing Decisions

- Good tests assert external behavior: luminance outputs for golden hex pairs; ring flags under state matrix; legend entries match encoding flags; Decide hosts absent from DOM when decideMode; captures exist for required viewports.
- Prefer existing unit harness (vitest) and Playwright render captures used in adversarial pack.
- Unit: luminance helper, endpoint role classification, showRing/showCore, no emoji in label builders.
- Integration: encoding → mesh options; legend co-land; decide non-render.
- Capture: per-ticket evidence dirs s-plus-w1…w4 and s-plus-pass with checklist.md.
- W5: independent scorecard JSON filled by critic, designer, dataviz (not implementer).

## Out of Scope

Light mode; WebGPU; catalog expansion; Plotly as hero renderer; n≥20 perception study; auto-solo first paint; unflagged early hybrid shell rewrite before W3; new Decide features beyond exclusivity and legibility.

## Further Notes

- Seams (primary): shared point/hierarchy encoding (one); secondary: stage-guide HUD; console section render branches; main canvas mode layout for hybrid; decide-panel exclusivity.
- Evidence baseline: `.omx/artifacts/visual-ralph/adversarial-2026-08-06/`
- Execute phrase: `execute S+ map` or `go W1` after W0.
