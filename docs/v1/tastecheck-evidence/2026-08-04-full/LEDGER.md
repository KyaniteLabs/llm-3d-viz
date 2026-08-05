# TasteCheck Pass — llm-3d-viz (private VPS artifact)

**Date:** 2026-08-04  
**Artifact:** http://100.92.68.103:4242/ (Tailscale-only; main @ curve-focus)  
**Spec:** `DESIGN-SYSTEM.md` (Observatory-after-dark + curve-focus matrix)  
**Evidence dir:** this folder (`01`–`05` PNGs)

---

# HOLD — 7 ship blockers (visual + instrument job)

**What passed:** Three hero default; curve-focus encoding on; age filter; family chips; solo Sol ladder readable; token field dark ink; no SaaS three-card hero.

**Ship blockers (summary):** first-paint still mudball-dense; legend steals stage; solo camera too sparse; projection row dead space; mobile stack drowning; stage keyboard hole; independent visual go not granted.

**Fastest path:** (1) default density + fit/legend hierarchy → (2) solo camera + effort strip always → (3) projection row density → (4) narrow layout → (5) keyboard stage path → (6) Simon visual go.

**Evidence:** `01-landing-default.png`, `02-age0-full-catalog.png`, `03-solo-sol.png`, `04-narrow-390.png`, `05-console-advanced.png`

---

## 0. Interview re-pass (design-system-interview)

**Mode:** existing product shortcut + product-job delta (multi-effort curves supersede openness marketing).

| Dimension | Evidence | Decision / assumption | Status |
|-----------|----------|----------------------|--------|
| reference | Bloomberg/Koyfin + Severance/Control; AA for density only | committed | pass |
| personality | instrument not dashboard | committed | pass |
| aesthetic | Observatory-after-dark | committed | pass |
| type | Inter Tight + IBM Plex Mono | committed (license fallback) | pass |
| color_mode | cool-green ink, filament accent, dark-first | committed | pass |
| density_shape | dual: sparse canvas / dense console; 4/8 radius | committed | pass |
| structure_rhythm | stage + console + projection row | committed | pass |
| signature | threshold-sweep | committed in system; **weak on first paint** | fail (behavior) |
| imagery | no decorative imagery | committed | pass |
| **Job delta** | multi-effort curves primary | committed RALPLAN A2 | pass (intent) |
| **Job vs render** | first paint still dense catalog | **blocked** | fail |

### Interview forks still open (need Simon)

1. **Default density:** keep age window + dim (current) **vs** default multi-effort-only visible set (harder mudball kill)?
2. **Legend:** stage overlay always open **vs** collapsed-by-default / off-canvas?
3. **Solo camera:** aggressive fit-to-ladder **vs** keep catalog context orbit?
4. **Signature moment:** threshold-sweep only on reweight (current) **vs** first-paint “ignite multi-effort trails” staged entrance?

Until forks 1–2 resolve, visual-quality veto stays HOLD even if code is correct.

---

## Evidence table (tastecheck-pass contract)

| skill | check_id | status | reason | remediation | evidence | provenance |
|-------|----------|--------|--------|-------------|----------|------------|
| design-system-interview | DS-01 dimensions | pass | Nine dimensions present in DESIGN-SYSTEM.md | — | DESIGN-SYSTEM.md | file |
| design-system-interview | DS-02 job alignment | fail | Spec curve-focus; render still reads catalog-first mudball on default | Density fork + fit/legend | 01-landing | render |
| improve-existing-website | IE-01 identity preserved | pass | Observatory chrome intact; not reskinned | — | 01–03 | render |
| color-system | CL-01 field/accent | pass | Ink field + filament hierarchy on chrome | — | tokens + 01 | tokens+render |
| color-system | CL-02 muted contrast | pass | `#89939E` on `#070C0B` ≈ 6.3:1 ≥ 4.5 | — | contrast calc | numeric |
| color-system | CL-03 singleton canvas | fail | Singleton slate ≈ 2.5:1 on ink (intentional secondary but fails “readable marks” for non-frontier) | Raise singleton luminance floor slightly or only dim size not fill | numeric 2.50 | numeric |
| color-system | CL-04 family series collision | fail | Many rainbow series hues compete; hard to track one family in multi-lab view | Cap visible series hues / emphasize hovered family | 01, 02 | render |
| web-typography | TY-01 roles | pass | Display + mono numerals present | — | 01 | render |
| web-typography | TY-02 axis mono | pass | Axis uppercase mono on stage | — | 01, 03 | render |
| spacing-system | SP-01 dual density | fail | Canvas sparse OK; projection row huge empty void under stage (layout waste) | Tighten projection row height; denser 2D | 01, 03 | render |
| theming | TH-01 dark-first | pass | Dark only; no light flash | — | 01 | render |
| theming | TH-02 light mode | n/a | Light not in scope | — | DESIGN-SYSTEM | file |
| responsive-layout | RL-01 narrow | fail | 390px stacks entire instrument into endless scroll; stage ~square then console wall | Collapse console sections; sticky stage; hide projections until expand | 04-narrow | render |
| component-states | CS-01 chips | pass | Active family chip visible when soloed | — | 03 | render |
| component-states | CS-02 cinema | fail | Not re-verified this pass | Click ENTER CINEMA; screenshot | — | missing |
| form-ux | FU-01 sliders | pass | Weight sliders labeled with shares | — | 04, 05 | render |
| form-ux | FU-02 advanced filters | pass | Collapsed by default | — | 01, 05 | render |
| empty-states | ES-01 zero visible | fail | Not exercised this pass | Force empty filters + copy | — | missing |
| micro-motion | MM-01 reduced motion | fail | Not re-verified this pass | `prefers-reduced-motion` sweep check | suite exists historically | partial |
| micro-motion | MM-02 no idle glow | pass | No ambient pulse observed | — | 01 | render |
| data-viz | DV-01 comparison job | fail | Job = intensity curves; default view still multi-series scatter without clear ladder affordance | Default multi-effort emphasis + first-paint trail ignition | 01 | render+audit |
| data-viz | DV-02 honest trails | pass | Real points only (code contract) | — | stage3d-three trails | code |
| data-viz | DV-03 lie factor 3D | fail | Interactive 3D depth still hard for absolute magnitude (known SPEC tension); projections underused | Make projections denser + linked highlight | 01 projections sparse | render |
| data-viz | DV-04 table parity | pass | Model table in console | — | 04 | render |
| art-direction | AD-01 no decorative imagery | pass | No hero illustration / stock | — | 01 | render |
| a11y-pass | A11Y-01 landmarks | pass | main/sections present | — | DOM | code |
| a11y-pass | A11Y-02 keyboard stage | fail | Canvas is focusable but 3D orbit not keyboard-operable; data path is table-only | Document + improve keyboard orbit or explicit skip | code | render |
| a11y-pass | A11Y-03 focusable count | pass | 191 focusables (heavy but operable) | — | DOM probe | runtime |
| cognitive-a11y | CA-01 legend load | fail | Stage key overlay dense; competes with first comprehension | Collapse by default; progressive disclosure | 01 STAGE KEY | render |
| cognitive-a11y | CA-02 filter vs answer | pass | Optimum/ladder above advanced filters | — | 01 console | render |
| i18n-ready | I18N-01 | n/a | EN-first deferred | — | DESIGN-SYSTEM | file |
| deslop-ui | SL-01 gradients/glass | pass | No aurora/glass/purple CTA | — | 01 | render |
| deslop-ui | SL-02 SaaS skeleton | pass | Not hero-features-cards | — | 01 | render |
| deslop-ui | SL-03 template empty | fail | Large black void under projections reads unfinished, not sparse | Compress layout grid / raise projections | 01, 03 | render |
| humanize-copy | HC-01 chrome voice | pass | Instrument voice (MODEL UNIVERSE, STAGE KEY) | — | 01 | render |
| humanize-copy | HC-02 density copy | fail | “Empty filter = all families in age window” is correct but dense jargon for first run | Shorter first-run hint | 01 family curves | render |
| tastecheck-pass | TC-visual-veto | fail | Implementer cannot clear; Simon not yet visual-go on private VPS | Simon inspects 01–04; go/kill | this ledger | process |
| tastecheck-pass | TC-gate-self-real-artifact | pass | VPS + screenshots | — | 100.92.68.103:4242 | runtime |
| tastecheck-pass | TC-gate-self-checks-ran | pass | Contrast numeric + screenshots + DOM probe | — | this ledger | session |
| tastecheck-pass | TC-gate-self-visual-independent | fail | No independent vision reviewer this session | Dispatch vision review or Simon go | — | process |
| tastecheck-pass | TC-gate-self-blockers-owned | pass | Blockers listed with owners | — | below | session |

---

## Deslop audit (against brief)

| P | Subject | Observation | Mechanism | Repair |
|---|---------|-------------|-----------|--------|
| P0 | First paint density | 01: multi-color point cloud; trails present but not primary read in ≤3s | Catalog completeness > instrument job | Stronger multi-effort emphasis + legend collapse + fit |
| P0 | Solo Sol empty field | 03: one cluster floating in void; projections flat | Fit too tight / too little ladder graphic | Fit-to-ladder + always-on effort strip + denser 2D ladder |
| P1 | Stage KEY overlay | 01: steals left of canvas | Comprehension rail competes with marks | Collapse default; open on demand |
| P1 | Projection row void | 01/03: huge empty below 2Ds | Grid assigns projections full band | Reduce row height; pack 2Ds under stage |
| P1 | Mobile wall of console | 04: stage then endless console | No progressive disclosure on narrow | Sticky mini-stage; accordion console |
| P2 | Family rainbow | 01: many series hues | Unbounded categorical color | Hover family full chroma; others desat |
| P2 | ENTER CINEMA placement | buried under advanced filters | Spectacle control demoted | Keep demoted but ensure reachable |

**Preserved signals:** dark ink, filament hierarchy language, stage+console motif, mono numerals, no glass/gradients.

---

## Data-viz audit (honest marks)

| Check | Result |
|-------|--------|
| Comparison question | “How does effort intensity trade speed/cost/intelligence within a family?” |
| Default view supports it? | **Weak** — multi-family scatter dominates |
| Trail honesty | **Pass** — real vertices only |
| Openness not primary fill | **Pass** on curve mode |
| Direct labels | Weak on multi; better on solo (still limited) |
| Table parity | Present |
| Chartjunk | Low (good) |
| 3D absolute magnitude | Still hard — projections must carry more |

---

## A11y / cognitive (short)

- Focusable controls abundant; stage exploration mouse-first.
- Contrast: text OK; singleton marks intentionally low.
- Cognitive load: STAGE KEY + dense chips + 3 projections = high first-run memory load.
- Missing: empty-state pass; cinema keyboard path check this session.

---

## Release path (ordered)

| # | Owner | Repair | Rerun | Acceptance |
|---|-------|--------|-------|------------|
| 1 | agent | Collapse STAGE KEY default; densify multi-effort first paint | 01 cold | ≤3s name one family curve without click (Simon) |
| 2 | agent | Solo: effort strip always + ladder labels + better fit | 03 | All Sol tiers readable without legend |
| 3 | agent | Projection row height + less void | 01 | Projections share visual mass with stage, not empty band |
| 4 | agent | Narrow layout accordion | 04 | Stage usable without 3× scroll for answer |
| 5 | agent | Hover family chroma emphasis | 01 | One family trackable among many |
| 6 | Simon | Visual go/kill on private VPS | eyes | Explicit go or next fork answers |

---

## Verdict

**HOLD** — private deploy is fine for daily use; product is **not** tastecheck-clear for public or “done.” Work continues from release path #1.
