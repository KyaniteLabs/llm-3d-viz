# Three stage — deep analysis (Aug 2026) + TasteCheck pack gate

**Artifact:** local preview `http://127.0.0.1:4190/` · branch `spike/r3f-stage` · default Three (`STAGE · THREE`)  
**Date:** 2026-08-03  
**Evidence:** `docs/v1/tastecheck-evidence/` + `capture.json`  
**Authority:** `DESIGN-SYSTEM.md`, `SPEC.md`, `docs/v1/r3f-stage-contract.md`, tastecheck-pass contract  

---

# HOLD — 7 blockers (visual veto open)

**What passed:** Observatory shell tokens, monochrome heat path, cinema+reduced-motion wire, h1 contrast AAA, multi-viewport paint with 33 points, no JS pageerrors in capture.

**Ship blockers (summary):**  
TC-VIZ-01 independent visual veto open · TC-DV-01 no stage data-table / SR parity · TC-A11Y-01 canvas unlabeled · TC-PERF-01 Plotly still on hero cold path (~1.6 MB gz JS) · TC-DV-02 occlusion / no labels on marks · TC-ZOOM-01 400% overflow · TC-SLOP/COPY residual badge + triad warn  

**Fastest path:**  
1) Independent visual review of wide+narrow screenshots (or Simon explicit go) →  
2) Stage accessible name + live region for hover/optimum →  
3) Hidden/toggle data table for scorable set →  
4) Dynamic-import Plotly only for projections / `?stage=plotly` →  
5) Occlusion strategy (order, size scale, optional labels on frontier only) →  
6) Rerun this gate  

**Evidence:** this doc + `docs/v1/tastecheck-evidence/capture.json` + PNGs listed below.

---

## Part A — Best practices as of August 2026 (applied to this product)

### A1. What the science still says (unchanged core)

| Principle | Source class | Implication for llm-3d-viz |
|-----------|--------------|----------------------------|
| **Position on a common scale** beats angle, area, volume, and pure hue for quantitative comparison | Cleveland & McGill 1984 and replications; hierarchy still taught 2025–26 | 3D *position* is legitimate only if users can re-project; **linked 2D projections are not optional chrome — they are the perception fix** |
| **Static 3D underperforms** for magnitude comparison | Classic vis literature; SPEC already cites this | Do not ship a lock-off 3D poster; interaction + linked views are the product |
| **Interactive 3D is still under-studied** for comprehension vs 2D | Wiederich & VanderPlas 2024 (JDS) — SPEC’s research wedge | Treat go/kill as both product and research: log tasks (find optimum, rank two models) before publish |
| **Color is a weak quantitative channel**; shape + luminance for class | DESIGN-SYSTEM + data-viz skill; color-blind safety | Filament heat + provider **shape** is correct; rainbow providers remain refused |
| **Overview first, details on demand** | Shneiderman mantra; IEEE VIS practice | Stage = overview of tradeoff; console + hover = detail; don’t put all identity on glyphs alone |

### A2. 2025–2026 practice deltas that matter for *this* spike

1. **Hybrid encoding is mainstream “serious” 3D**  
   Modern scientific and product 3D (immersive analytics tutorials, linked multi-view systems) treat 3D as *one view in a coordinated system*, not the sole encoding. Our SPEC D1 (3D + linked 2D) is aligned with best practice; the failure mode is letting 3D look like a finished chart while 2D is an afterthought, or the reverse.

2. **WebGPU is production-adjacent; WebGL remains the compatibility path**  
   Through mid-2026, WebGPU is the path for heavy GPU compute (particles, volume, large N). At **n ≈ 35**, WebGL/Three is enough. Migrating to WebGPU for vanity is out of scope; **keep WebGL**, plan WebGPU only if N or effects explode.  
   *Practical rule:* optimize **bundle and draw simplicity**, not renderer generation.

3. **Bundle and cold-start are part of “visual quality”**  
   2025–26 product bars treat multi‑MB hero JS as a quality defect. Contract go-criteria said: *no 5MB Plotly tax on the hero path*. Capture shows **~1.62 MB transferred** for `index-*.js` still co-bundling Plotly with the Three default. That fails the spirit of the go-criteria even if gzip is under the old 5MB raw figure.

4. **Accessibility for WebGL is expected, not optional**  
   WCAG 2.2 mindset in 2026: canvas must have an accessible name; interactive data must have a non-visual path (table, list, or live region). Keyboard for weights/cinema exists; **stage pick and optimum identity do not**.

5. **Anti-slop for Three.js is a first-class design rule**  
   DESIGN-SYSTEM bans starfields, fog banks, neon bloom, particle soup. Correct. Best practice for *instrument* 3D in 2026 is **sparse marks, honest axes, restrained motion** — not demo-reel lighting. Our cube rewrite moves toward that; residual risk is “generic dark cube with white dots” without instrument typography on-canvas.

6. **Cinema / reduced motion**  
   Slow orbit only in an explicit mode; kill on pointer enter and under `prefers-reduced-motion` — we implement this (`CinemaMode`). That matches 2026 motion hygiene.

7. **Occlusion and overplotting**  
   At n=33 with large glyphs, depth ordering and size still hide points. Best practice: smaller marks, depth-sorted transparent draws, **direct labels on frontier/optimum only**, and always-synced 2D for identity. We partially have size classes; we lack frontier labels on the 3D stage (labels live in HTML rail — good — but stage still relies on hover).

### A3. Genre decision (data-viz skill)

| Question | Answer |
|----------|--------|
| Comparison question | “Given my speed/cost/intelligence weights, which models are efficient, and what is the current optimum?” |
| Genre | Interactive 3D scatter + Pareto ridge + linked 2D scatters + console ranking — **justified** because the third continuous dimension is load-bearing for the product story |
| Refuse | Decorative 3D, provider rainbow, filled Pareto surface, fake volumetric “atmosphere” |
| Required companions | Linked 2D (have), **table/list parity** (missing), caption of takeaway (partial: CURRENT OPTIMUM in console) |

### A4. Recommended design thesis for the Three stage (think-through, not yet built)

Order of work that matches both science and DESIGN-SYSTEM:

1. **Parity frame** — cube, ticks, titles (landed; keep refining tick clutter on narrow).  
2. **Mark discipline** — smaller default marks; optimum exclusive max size + filament; dominated slate *readable but subtractive* (slate-on-ink contrast ~2.5:1 — *intentionally low*; must stay secondary to shape+position).  
3. **Identity without rainbow** — frontier names stay in STAGE KEY; add **optional** on-canvas labels for optimum + top-2 only when stage is wide.  
4. **Depth honesty** — slight size attenuation with depth *or* constant size + stronger ridge; never fake lighting that invents hierarchy. MeshBasic is correct for unlit honesty.  
5. **Motion** — threshold-sweep on re-weight is the signature; cinema orbit is opt-in; no idle glow.  
6. **Load** — code-split Plotly; Three-only default path should not download gl3d.  
7. **A11y** — `role="img"` + `aria-label` summarizing optimum + frontier count; `aria-live` on hover/optimum change; data table toggle.  
8. **Research hook** — before publish, one timed task protocol (find optimum under two weight presets) vs Plotly path.

### A5. Explicit non-goals (still correct)

- Provider categorical hues  
- WebGPU rewrite at n=33  
- Full React app  
- Plotly polish on the frozen path  
- Three demo vocabulary (particles, bloom, starfield)

---

## Part B — TasteCheck pack (ordered gate)

Artifact: **live** `http://127.0.0.1:4190/` (Three default), captured 2026-08-03.  
Spec: **DESIGN-SYSTEM.md** (approved direction; pixel sign-off deferred to this gate).

### B0. Direction

| skill | check_id | status | reason | remediation | evidence | provenance |
|-------|----------|--------|--------|-------------|----------|------------|
| design-system / improve-existing | TC-DIR-01 | **pass** | Approved DESIGN-SYSTEM *Observatory-after-dark*; spike implements Stage API under contract | — | DESIGN-SYSTEM.md; r3f-stage-contract.md | repo |
| design-system | TC-DIR-02 | **fail** | Pixel sign-off was deferred; user previously disputed blank/blob and still not explicit visual go | Independent vision review or Simon go on current screenshots | user messages; wide-1440-stage.png | session |

### B1. Foundations

| skill | check_id | status | reason | remediation | evidence | provenance |
|-------|----------|--------|--------|-------------|----------|------------|
| color-system | TC-COL-01 | **pass** | Tokens match anchors (ink `#070C0B`, filament `#E8F1E4`, slate `#3D5560`) | — | tokens.css; capture contrasts | browser |
| color-system | TC-COL-02 | **pass** | h1/text-warm on ink ≈ **15.3:1** (AAA); filament ≈ **17:1** | — | capture.json contrasts | computed |
| color-system | TC-COL-03 | **warn** | Muted `#89939E` on ink ≈ **6.3:1** (≥4.5 OK); dominated slate ≈ **2.5:1** (secondary by design — OK only if shape/size carry identity) | Keep shape+size; never use slate alone for critical state | computed | computed |
| web-typography | TC-TYPE-01 | **pass** | Inter Tight + IBM Plex Mono load; mono badge/axis labels | — | gate-audit notes; network fonts | browser |
| web-typography | TC-TYPE-02 | **warn** | Axis tick HTML can clutter/collide on narrow (INTELLIGENCE ticks drop partially at 320) | Narrow tick subset (already pattern in Plotly stage) | narrow-320-stage.png | screenshot |
| spacing-system | TC-SPACE-01 | **pass** | Dual density: sparse stage / dense console; panel radius tokens | — | wide-1440.png | screenshot |
| theming | TC-THEME-01 | **pass** | Dark-first only; no light-mode flash required for v0 | Light mode later | DESIGN-SYSTEM | spec |
| theming | TC-THEME-02 | **n/a** | No light theme ship target | — | DESIGN-SYSTEM §Mode | spec |

### B2. Structure / behavior

| skill | check_id | status | reason | remediation | evidence | provenance |
|-------|----------|--------|--------|-------------|----------|------------|
| responsive-layout | TC-RESP-01 | **pass** | 1440 / 1280 / 768 / 375 / 320 all render stage + console; 33 points | — | capture views[] | playwright |
| responsive-layout | TC-RESP-02 | **fail** | 400% zoom approx: `overflowX: true`, scrollW 1280 vs clientW 360 | Fluid layout under zoom; avoid min-widths that force horizontal scroll | capture.zoom400; zoom-400-approx.png | playwright |
| component-states | TC-STATE-01 | **pass** | Preset chips `is-active`; cinema button present | — | tabOrder; wide-1440.png | browser |
| component-states | TC-STATE-02 | **warn** | Hover optimum console path exists; stage hover has no focus equivalent | Keyboard model cycle or table selection | main.ts stage:hover | code |
| form-ux | TC-FORM-01 | **pass** | Range inputs have accessible names | — | focusables | browser |
| empty-states | TC-EMPTY-01 | **pass** | Incomplete data section exists in console | — | landmarks list | browser |
| empty-states | TC-EMPTY-02 | **n/a** | No zero-model product state in v0 dataset | — | models length 35 | code |

### B3. Surface

| skill | check_id | status | reason | remediation | evidence | provenance |
|-------|----------|--------|--------|-------------|----------|------------|
| micro-motion | TC-MOT-01 | **pass** | CSS reduced-motion collapses transitions; cinema respects media query | — | tokens.css; cinema.ts | code |
| micro-motion | TC-MOT-02 | **pass** | `prefers-reduced-motion: reduce` → cinema does not apply `is-cinema` | — | reduced cinema probe | playwright |
| micro-motion | TC-MOT-03 | **warn** | Threshold-sweep signature not re-verified under Three appearance hook in this capture | Manual weight-drag video QA | sweep.ts `__setPointAppearance` | code |
| data-viz | TC-DV-01 | **fail** | No accessible data table / SR parity for 3D marks | Add toggle table: model, cost, intel, tps, score, frontier flag | a11y probe hasTable:false | browser |
| data-viz | TC-DV-02 | **fail** | Occlusion + no on-canvas identity for most points; hover-only | Frontier/optimum labels; smaller marks; pick radius QA | wide-1440-stage.png | screenshot |
| data-viz | TC-DV-03 | **pass** | Axes log/linear match contract; ridge polyline present; heat monochrome | — | mesh sample hex | code |
| data-viz | TC-DV-04 | **pass** | Linked 2D projections still present (hybrid encoding) | — | wide-1440.png | screenshot |
| art-direction | TC-ART-01 | **warn** | Badge + cube read as instrument, but not yet “cinematic showcase” vs Plotly; atmosphere intentionally sparse | Atmosphere via typography/ridge, not fog/bloom | three vs plotly stage PNGs | screenshot |
| art-direction | TC-ART-02 | **pass** | No starfield/particles/neon bloom detected | — | stage screenshots | screenshot |

### B4. Verification / audit

| skill | check_id | status | reason | remediation | evidence | provenance |
|-------|----------|--------|--------|-------------|----------|------------|
| a11y-pass | TC-A11Y-01 | **fail** | WebGL canvas lacks `aria-label` / role | Set role=img + descriptive label; update on optimum change | a11y probe | browser |
| a11y-pass | TC-A11Y-02 | **pass** | Landmarks: main.observatory, asides, sections | — | a11y landmarks | browser |
| a11y-pass | TC-A11Y-03 | **warn** | Keyboard reaches cinema + weights + presets; not stage points | Model list roving tabindex or table | tabOrder | browser |
| a11y-pass | TC-A11Y-04 | **pass** | Cinema shortcut yields to text entry (documented in main.ts) | — | main.ts isTextEntryTarget | code |
| cognitive-a11y | TC-COG-01 | **warn** | High simultaneous density (stage + guide + console + 3 projections) | Progressive disclosure already partly in guide details; keep | wide-1440.png | screenshot |
| cognitive-a11y | TC-COG-02 | **pass** | CURRENT OPTIMUM lands without hover (comprehension pass) | — | console region | screenshot |
| i18n-ready | TC-I18N-01 | **n/a** | EN-first v0; i18n deferred by DESIGN-SYSTEM | — | DESIGN-SYSTEM Language | spec |
| deslop-ui | TC-SLOP-01 | **warn** | gate-audit: “uniform card grid: 3× identical article.projection” three-card tell | Accept as *instrument triad* if rhythm differs; else asymmetric projection weights | gate-audit.js verdict REVIEW WARNS | gate-audit |
| deslop-ui | TC-SLOP-02 | **pass** | No purple gradient / glass / emoji / aurora | — | screenshots | screenshot |
| deslop-ui | TC-SLOP-03 | **pass** | Direction is named instrument, not SaaS hero template | — | layout structure | screenshot |
| humanize-copy | TC-COPY-01 | **pass** | Instrument voice (STAGE KEY, VALUE READOUT, mono uppercase axes) matches brief | — | UI strings | screenshot |
| humanize-copy | TC-COPY-02 | **warn** | “STAGE · THREE” is engineer-facing; for publish hide or demote | Spike-only badge; remove on production swap | badge screenshot | product |

### B5. Performance / cold load (cross-cutting)

| skill | check_id | status | reason | remediation | evidence | provenance |
|-------|----------|--------|--------|-------------|----------|------------|
| (contract go-criteria) | TC-PERF-01 | **fail** | Default Three still ships full Plotly in main chunk (~1.62 MB transfer / ~5.5 MB raw) | Dynamic `import()` for Plotly projections + plotly stage only | capture.coldLoad.resources | performance |
| (contract) | TC-PERF-02 | **pass** | tLoad ~857 ms local; fine for LAN preview, not a CDN claim | Measure on Pages after publish | capture.coldLoad | performance |

### B6. Visual-quality veto (mandatory)

| skill | check_id | status | reason | remediation | evidence | provenance |
|-------|----------|--------|--------|-------------|----------|------------|
| tastecheck-pass | TC-VIZ-01 | **fail** | Implementer cannot clear visual veto; user has not given explicit visual go on *this* cube build; prior “blank/blob” dispute still in session history | Independent design/vision reviewer **or** Simon written go on wide+narrow PNGs | tastecheck-pass §Visual-quality veto | policy |
| tastecheck-pass | TC-VIZ-02 | **warn** | Wide stage: cube readable; ridge visible; still monochrome (by design); not yet “clearly better” than Plotly for all viewers | Compare task timings; improve labels/occlusion | wide-1440-stage.png vs wide-plotly-stage.png | screenshot |

**Visual observations (implementer — non-clearing):**

| Viewport | Hierarchy | Proportion | Type | Marks | Whitespace | Slop signals |
|----------|-----------|------------|------|-------|------------|--------------|
| 1440 wide | Stage dominant, console right — correct asymmetry | Stage ~762×504 healthy | H1 Inter Tight; mono keys OK | Cube+ridge+mixed shapes; some occlusion | Canvas sparse OK | Badge reads spike/debug |
| 375 phone | Vertical stack; stage min-height | Stage ~317×300 tight | Tick labels crowd | Marks denser | Guide below helps | Three-card projections full width |
| 320 narrow | Same; fewer tick labels | Stage ~262×300 | Title/tick collision risk | OK | Dense console | Same |

### B7. Gate self-check

| check_id | status | reason |
|----------|--------|--------|
| TC-SELF-01 real artifact + spec used | **pass** | Live 4190 + DESIGN-SYSTEM |
| TC-SELF-02 browser/numeric checks ran | **pass** | Multi-VP, contrast, cold load, keyboard, gate-audit, reduced-motion |
| TC-SELF-03 visual veto independent or user-approved | **fail** | Neither present |
| TC-SELF-04 every blocker has owner/repair/rerun/accept | **pass** | See Part C |

---

## Part C — Blockers → release path

| ID | Owner | Repair | Rerun / artifact | Acceptance |
|----|-------|--------|------------------|------------|
| TC-VIZ-01 | Simon or independent vision reviewer | Review PNGs in `tastecheck-evidence/`; written go/kill | Update TC-VIZ-01 | Explicit “visual go” message or review note |
| TC-DV-01 | implementer | Scorable models `<table>` or listbox, toggle in console | a11y probe hasTable or list | SR can read optimum + top scores without canvas |
| TC-A11Y-01 | implementer | canvas `role="img"` + aria-label with optimum + counts | axe/manual | No “canvas missing aria” |
| TC-PERF-01 | implementer | Dynamic import Plotly; Three path free of gl3d | Network panel on `/` | Main chunk without plotly.js-dist-min |
| TC-DV-02 | implementer | Smaller marks; frontier label optional; pick test | stage screenshot + hover QA | ≥90% frontier points pickable; less blobbing |
| TC-RESP-02 | implementer | Zoom-safe layout | 400% zoom capture | no forced horizontal scroll at 320 CSS px × 400% |
| TC-SLOP-01 | design | Decide: instrument triad OK vs rebalance projections | deslop re-run | Named decision in DESIGN-SYSTEM or layout change |
| TC-COPY-02 | implementer | Hide STAGE·THREE outside spike / `?debug=1` | screenshot | No engineer badge on publish path |

---

## Part D — Three vs Plotly (honest)

| Dimension | Plotly (frozen) | Three (spike now) | 2026 best practice winner |
|-----------|-----------------|-------------------|---------------------------|
| Axis chrome | Mature ticks/titles | HTML labels + wire cube | Plotly slightly clearer; Three closing |
| Control of materials | Limited gl3d | Full (honest MeshBasic) | Three |
| Bundle on hero | Heavy | Still heavy (co-bundle) | Neither until code-split |
| Cinema orbit | Camera relayout | orbitTo continuous | Three smoother path |
| A11y of stage | Poor (canvas) | Poor (canvas) | Neither |
| Design-system fidelity | De-chromed well | Tokens OK; badge noisy | Plotly calmer for publish |
| Showcase headroom | Low (gl3d ceiling) | High if we invest | Three |

**Kill/go for spike (contract):**  
- **Do not kill** — axes no longer lie as a pure void; ridge and class luminance exist; cinema/hover seams work.  
- **Do not declare go for production default** until TC-PERF-01, TC-A11Y-01, TC-DV-01, and TC-VIZ-01 clear.

---

## Part E — Recommended roadmap (think-through order)

### P0 (before any “default Three on main”)
1. Code-split Plotly.  
2. Canvas accessible name + live optimum.  
3. Data table parity.  
4. Independent visual go.

### P1 (instrument quality)
5. Narrow tick strategy (port Plotly narrow axis set).  
6. Occlusion pass (size scale, draw order).  
7. Threshold-sweep visual QA on Three.  
8. Remove spike badge outside debug.

### P2 (showcase / video)
9. Cinema framing presets (hero angles).  
10. Optional DOF **only** in cinema (DESIGN-SYSTEM allows).  
11. Record 10s video test: sweep + cinema + hover.

### P3 (research)
12. Comprehension micro-study protocol (Wiederich gap).

---

## Evidence index

| File | Role |
|------|------|
| `docs/v1/tastecheck-evidence/capture.json` | Numeric multi-viewport capture |
| `docs/v1/tastecheck-evidence/wide-1440.png` | Full UI wide |
| `docs/v1/tastecheck-evidence/wide-1440-stage.png` | Three stage crop |
| `docs/v1/tastecheck-evidence/wide-plotly-stage.png` | Plotly stage crop |
| `docs/v1/tastecheck-evidence/phone-375.png` | Mobile |
| `docs/v1/tastecheck-evidence/narrow-320.png` | 320 CSS px |
| `docs/v1/tastecheck-evidence/cinema-on.png` | Cinema mode |
| `docs/v1/tastecheck-evidence/zoom-400-approx.png` | Zoom stress |

---

## Verdict (repeat)

# HOLD — 7 blockers

Visual veto is open. Technical seams for the spike are real; production default swap is **not** cleared. Next owner action: **Simon visual go/kill on the evidence PNGs**, then implementer P0 table in Part C.
