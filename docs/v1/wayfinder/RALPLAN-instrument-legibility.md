# RALPLAN A2 — multi-effort instrument legibility fix train

**Status:** `pending approval`  
**Consensus:** Planner → Architect (APPROVE-with-changes) → Critic iteration 1 ITERATE → Critic iteration 2 **APPROVE**  
**Date:** 2026-08-04  
**Map:** [#79](https://git.kyanitelabs.tech/simon/llm-3d-viz/issues/79)  
**Decision tickets:** #80–#85  

**ADR Decision (one line):** Ship curve-focus as product default—multi-effort family series color on fill+trail, dimmed post-filter singletons, openness glyph-only, multi-effort first-paint camera fit, docs then #84 hard gate before #82–#85; `?enc=openness` is regression-only.

---

## RALPLAN-DR summary

### Principles
1. Primary job = multi-effort family intensity curves + navigable exploration (not openness marketing scatter).
2. First paint ≤3s delivers ≥1 readable multi-effort family curve without mudball dominance.
3. Encoding honesty: real points only; legend 1:1 with marks.
4. Medium blast radius acknowledged: shared encoding + stage API + console + projections + docs.
5. Docs first; #84 prototype hard-gates full polish.
6. Three remains hero; effort strip secondary.

### Decision drivers
1. Simon forced multi-effort curves + usefulness/navigability over aesthetics.
2. Audit failures: wrong primary encoding, mudball first paint, solo label collision, filter-first console, dead projections.
3. Age≤6mo alone insufficient; DESIGN-SYSTEM openness-primary fill conflicts with the job.

### Viable options
| Option | Result |
|--------|--------|
| **A2 curve-focus default** (chosen) | Single product encoding; dim singletons; multi-effort fit; docs + #84 gate |
| O2 openness polish only | Rejected — job mismatch |
| O3 2D ladder as hero | Rejected — Three constraint |
| Dual-mode first-class console | Rejected — legend/test explosion |
| Auto-solo first paint | Rejected — URL surprise; kills comparison; filter-decision conflict |

### Why chosen
Matches product job, preserves catalog honesty (dim ≠ remove), avoids dual-mode maintenance, sequence-gated so polish cannot land on a failed first paint.

---

## Locked channel matrix (curve-focus default)

| Mark | Channel |
|------|---------|
| Multi-effort point **fill** | **family series color** (curated map for known multi-effort families; stable HSL hash fallback with min-separation attempt) |
| Multi-effort **trail** | same family series color; effort-rank ordered; real points only |
| **Outline / ring** | lab/provider identity when multi-lab visible (secondary) |
| **Singleton** fill | desaturated slate; **opacity 0.30**; **size ×0.55** of multi-effort peer; still full members of visible set / score / frontier |
| **Openness** | **glyph only** (or 1px stroke dash) — **never primary fill** in curve-focus |
| **Frontier / optimum** | size / ridge / ★ retained |
| **Reasoning** | existing glyph; if collision with openness glyph, one status cluster |
| **Heat** | `?heat=1` only (overrides fill to copper→filament ramp) |

**Legend (default entries):** Family trail · Effort path (low→xhigh) · Singleton (dim) · Frontier ★ · Optimum · Open/Closed (glyph) · Reasoning (if shown).  
**Not:** open blue / closed black as primary fill story.

### Singleton predicate
`isSingleton(model, visibleModels) := count of models in visibleModels with same family_id < 2`  
Context = **post-filter visible set**. Dim is visual only; score/frontier membership unchanged.

---

## Density path
1. age ≤ 6 months (existing default)
2. dim singletons (above)
3. trail emphasis (stroke strong; opacity ≥ 0.85)
4. first-paint camera: soft fit once to **multi-effort subset bounds** (padding 1.15), then free orbit
5. If **#84 fails**: stop train; amend filters decision for durable multi-effort visible-set filter before #82–#85. Do not ship prettier mudball. Do not treat today’s chip-list-only `multiEffortOnly` as stage density fix.

---

## Map decision resolutions (A2 → grilling tickets)

| Ticket | Resolution |
|--------|------------|
| **#80** | Job = multi-effort instrument. First paint ≤3s: name ≥1 multi-effort family + effort direction without click. Default = age + dim singletons + trail emphasis + multi-effort fit. Non-goals: AA reskin, invent metrics, replace Three, publish. |
| **#81** | Channel matrix above; one `pointEncoding` in palette; stage/projections/sweep/legend share it. |
| **#82** | Solo: 3D trail + tier labels (N≤12, NMS) + secondary effort ladder strip (solo-only, above projections or first panel). Not 2D-primary. |
| **#83** | Console: optimum/ladder → family chips → weights → axes → advanced filters collapsed. Clear keeps age-on. Fix/rename false multiEffortOnly. |
| **#84** | Thin prototype after doc locks; hard gate for first paint + Sol solo path. |
| **#85** | Catalog: 3 linked 2Ds same encoding. Kill PROJECTION 0N. Solo: effort strip + ≥1 linked 2D. |

---

## Sequence
1. Amend DESIGN-SYSTEM + decision-semantic-color-aa (+ dim note in filters decision if useful)
2. **#84** thin implement + hard gate
3. On pass: **#82** → **#83** → **#85**
4. Hardening: `?enc=openness` dual tests, visual evidence pack

### #84 checklist
- Docs amended first
- `palette.ts`: `pointEncoding`, `familySeriesColor`, `isSingleton`
- `stage3d-three.ts`: fill/trail/dim/emphasis
- `Stage3DSurface` / options: `fitToVisible` or `fit: 'multi-effort' | 'all' | 'none'`
- Solo via existing `families` filter / URL
- **Out of #84:** console reorder, full NMS polish, projection vanity, effort strip host
- **Pass/fail:** human ≤3s + screenshot + unit tests

### `?enc=openness`
Regression/AA comparison only; no console toggle; url-state preserves `enc`; dual unit tests + Playwright default = curve-focus legend.

---

## Blast list
`palette.ts` (+tests), `stage-api.ts`, `stage3d-three.ts`, `stage3d.ts`, `projections.ts`, `sweep.ts`, `stage-guide.ts`, `console.ts`, `filters.ts` (only if multi-effort visible-set path after #84 fail), `url-state.ts`, `state.ts`, `index.html`, `multi-effort.test.ts`, palette tests, `render.spec.ts` legend keys, Playwright first-paint + solo Sol.

---

## Train acceptance
- ≤3s: name family + effort direction of ≥1 curve (human + screenshot; #84 gate)
- Solo: ordered tiers readable; labels not piled
- Openness not loudest default fill story
- Console: filters not above optimum/ladder/family nav
- Projections useful; no vanity numbering
- Unit: encoding 1:1 legend; trail vertices = real members; dim ⇏ score change
- Three remains default stage

## Out of scope
AA marketing reskin; invented metrics; 2D hero; live scrape; mobile-first; Cloudflare publish; R3F rewrite.

---

## Execution boundary
This plan is **pending approval**. No implementation, commits, or product publish until Simon approves execution (team/ralph/implement). Tracker PRD/tickets may be filed as planning artifacts per `/to-spec` `/to-tickets`.
