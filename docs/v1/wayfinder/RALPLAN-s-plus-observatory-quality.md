> **SUPERSEDED 2026-08-07** by `.omx/plans/prd-s-plus-maximal-dataviz-beauty.md` + `MAP-s-plus-maximal-dataviz-beauty.md`. The `target_L = 0.55 × L` desat algorithm below is **void** — glanceable full brand fill + chroma pull 0.22 is law.

# RALPLAN — S+ Observatory quality (≥90 all gates)

**Status:** `pending approval` (Critic **APPROVE** · PRD #146 · map #147 · tickets #148–#153)  
**Consensus:** Planner → Architect APPROVE-with-changes → Critic ITERATE×2 → Critic **APPROVE**  
**Date:** 2026-08-06  
**Map:** [MAP-s-plus-observatory-quality.md](./MAP-s-plus-observatory-quality.md)  
**Decision:** [decision-filament-hierarchy.md](./decision-filament-hierarchy.md)  
**Baseline:** critic **41/100** · HOLD · adversarial-2026-08-06  
**Bar:** every W5 dimension **≥90** · composite **≥92** · stretch **≥96**

---

## ADR Decision (one line)
> **Owner amendment 2026-08-06:** Lab brand **fill always full chroma at a glance** — do **not** desaturate non-frontier until hover. Hierarchy = ridge + size + quiet trails + open HUD. See [decision-filament-hierarchy.md](./decision-filament-hierarchy.md). Re-lock W0/W1 accepts before execute.

Ship **S1 Filament Console train (W0→W5)** with a single shared paint seam, always-on open HUD, chrome/Decide exclusivity, structural hybrid 2D + mobile stage-first, and **W5 independent triple scorecard** (every dimension ≥90).

---

## Gate operationalization (Critic-required)

### Mid-train vs W5 scoring (single rule)

- **W0–W4 pass/fail = binary:** all MAP §Wn acceptance bullets hold + required evidence artifacts exist. **No independent numeric ≥90 mid-train. No implementer self-score composite.**
- **Independent numeric ≥90 starts at W5 only**, using the **W5 Independent Scorecard** below.
- **Fail-stop:** if Wn binary gate fails, **W(n+1) is blocked**. Implementer cannot clear a failed gate. Only user reopen or independent micro-veto (if user requests) may reopen.

### Evidence path pattern

| Ticket | Evidence dir |
|--------|----------------|
| W1 | `.omx/artifacts/visual-ralph/s-plus-w1/` |
| W2 | `.omx/artifacts/visual-ralph/s-plus-w2/` |
| W3 | `.omx/artifacts/visual-ralph/s-plus-w3/` |
| W4 | `.omx/artifacts/visual-ralph/s-plus-w4/` |
| W5 | `.omx/artifacts/visual-ralph/s-plus-pass/` |

Minimum captures when relevant: `1440-default.png`, `cinema.png`, `390-mobile.png`, `decide.png`, `table.png`, `dom-metrics.json`, `checklist.md` (tick MAP accepts with pass/fail).

### GATE binding

| Ticket | GATE = |
|--------|--------|
| **W0** | All MAP W0 accepts + DESIGN-SYSTEM amended + decision status locked + A2 supersession note |
| **W1** | All MAP W1 accepts + evidence in `s-plus-w1/` + unit tests green for luminance vectors |
| **W2** | All MAP W2 accepts + evidence in `s-plus-w2/` |
| **W3** | All MAP W3 accepts + evidence in `s-plus-w3/` |
| **W4** | All MAP W4 accepts + evidence in `s-plus-w4/` |
| **W5** | All MAP W5 accepts + scorecard every dim ≥90 + composite ≥92 + triple roles + tastecheck SHIP |

---

## W5 Independent Scorecard (fixed)

Each role scores **every** dimension 0–100. **Pass iff every dimension ≥90 and mean composite ≥92.** Stretch SHIP if composite ≥96 and no dim &lt;92.

| # | Dimension | Audit anchor | Critic | Designer | Dataviz |
|---|-----------|--------------|--------|----------|---------|
| D1 | Canvas drama (filament + subtraction) | P0-1 | ✓ | ✓ | ✓ |
| D2 | Encoding honesty (channels not overloaded/lying) | P0-4, R1 | ✓ | ✓ | ✓ |
| D3 | Legend 1:1 first paint | P0-2 | ✓ | ✓ | ✓ |
| D4 | Chrome calm (progressive disclosure) | P1-6 | ✓ | ✓ | — |
| D5 | Decide exclusivity + shortlist legibility | P1-7 | ✓ | ✓ | ✓ |
| D6 | Hybrid simultaneous 2D | TC-DV-02 | ✓ | ✓ | ✓ |
| D7 | Mobile stage-first | P0-5 | ✓ | ✓ | — |
| D8 | Anti-slop (emoji, white inputs, eng jargon) | P0-3, P1-9 | ✓ | ✓ | — |
| D9 | Cinema craft (density + DOF + ridge) | P2-12 | ✓ | ✓ | ✓ |
| D10 | CVD / lab separation safety | R5 | — | — | ✓ |
| D11 | Numeral / table craft | P1-8 | ✓ | ✓ | — |
| D12 | Type hierarchy | P2-11 | ✓ | ✓ | — |

Roles mark N/A only where column shows “—”. N/A does not count toward composite mean (mean over scored dims only). **No dim that is scored may be &lt;90.**

**Composite aggregation:** each role computes mean of its scored dims; **global composite** = mean of the three role means (roles with zero scored dims omitted). Pass requires **each role mean ≥92** and **every scored dim ≥90**.

---

## Locked density + paint algorithms (executable)

### Relative luminance
Use WCAG sRGB relative luminance `L` on fill hex:
`L = 0.2126 R + 0.7152 G + 0.0722 B` with standard sRGB linearization.

### Non-frontier hierarchy (**VOID — do not implement**)
```
// SUPERSEDED: do not use 0.55×L desat
frontier_ref_fill =
  same-lab frontier mark fill if any frontier in visible set for that lab
  else --filament-dim (#C9D4C4)

For each non-frontier, non-optimum, non-selected, non-solo mark:
  target_L = 0.55 * L(frontier_ref_fill)
  desaturate/mix fill toward --slate-cyan until L(fill) <= target_L
  clamp: L(fill) >= 0.08 so mark remains barely visible on --ink-field
```
Unit tests: golden pairs (hex in → hex out) for OpenAI full vs dim, no-frontier-peer fallback to filament-dim.

### Endpoint emphasis (multi-effort family with ≥3 points)
| Mark role | Size mult | Fill α | Trail segment α |
|-----------|-----------|--------|-----------------|
| Effort endpoints (min + max rank) | 1.0 × hierarchy size | 1.0 | — |
| Mid-effort points | **0.70** × hierarchy size | **≤0.55** | — |
| Trail idle | — | — | **≤0.45** |
| Trail solo/hover | — | — | **≥0.85** |

Families with 2 points: both endpoints (no mid).

### Rings / core
`PointEncoding` (or hierarchy helper return) includes `showRing: boolean`, `showCore: boolean`.  
`showRing`/`showCore` = **true** iff `solo | selected | ?brand=full | density-expand(=brand full) | cinema focus-set member`; else **false** at full catalog. (Cinema zoom alone does not enable rings for the whole catalog.)

### Pictographs
Ban **all** emoji and symbol prefixes on marks/labels including ⚡ and ★. Use 1px line / mono text status only.

### Decide mode paint
Same filament hierarchy applies. Floor plane + shortlist emphasis **add** to hierarchy (below-floor already dimmed); do not replace lab hierarchy with floor-only story for above-floor marks.

### Escapes
- `?brand=full` → full chroma + rings/core on for all visible  
- Density expand control (scope shelf chip “Full density brands”) sets same as `?brand=full`  
- Cinema zoom alone does **not** force full brand for whole catalog; only focus set

---

## RALPLAN-DR summary

### Principles (rank order)
1. Filament hierarchy  
2. Encode honesty / legend 1:1  
3. **Glanceable lab brand fill always-on** (no hover)  
4. Calm chrome  
5. SPEC hybrid simultaneous 2D  
6. Fail-closed scorecard at W5  
7. One paint seam  

### Decision drivers
1. User ≥90 all W5 dimensions · S+  
2. Independent HOLD 41 · three reviews  
3. Root: equal-chroma carnival + collapsed legend + exclusive modes  
4. Architect: density lock, DS amend, one seam  
5. Critic: operational gates, scorecard, numeric density  

### Options
S1 chosen (with Architect+Critic ops). S2 polish-only rejected. S3 greenfield optional later. S4 hard-cut retained steelman. S5 drop-3D rejected.

### Why S1
Dependency-ordered score delta; reuses Decide floor + massing + brand research; single paint seam; fail-stop mid-train; numeric W5 bar.

### Pre-mortem (deliberate)
1. **Quieter confetti:** mid-effort still full chroma → mitigated by endpoint table + luminance formula + fail-stop W1.  
2. **False W5 SHIP:** composite vibe score → mitigated by fixed D1–D12 scorecard.  
3. **Hybrid late thrash:** W4 first layout rewrite fails → mitigated by optional early scaffold **feature-flagged only** (default off until W4); no unflagged shell rewrite before W3 done.

### Expanded test plan
| Layer | What |
|-------|------|
| Unit | Luminance helper golden vectors; endpoint role classification; showRing/showCore flags; no emoji in label builders |
| Integration | pointEncoding → mesh options; legendEntries match flags; decideMode non-render of Explore hosts |
| E2E / capture | Playwright multi-viewport packs per Wn evidence dir |
| Observability | `checklist.md` per ticket; W5 scorecard JSON filled by independents |

---

## Sequence

```
W0 docs/DS/decision lock
W1 paint seam + density numbers + legend co-land + tests   [fail-stop]
W2 open HUD + materials + numerals + copy                 [fail-stop]
W3 chrome 3 sections + Decide non-render list + table     [fail-stop]
W4 hybrid strip + mobile sheet + type                     [fail-stop]
W5 cinema/CVD/sweep + triple scorecard ≥90 all dims
```

### Definition of done
- [ ] W5 scorecard every scored dim ≥90 · composite ≥92 (stretch ≥96)
- [ ] Designer SHIP · Dataviz no P0 kill-shots  
- [ ] tastecheck-pass SHIP + visual veto cleared  
- [ ] Evidence in `s-plus-pass/`  
- [ ] Deploy only after Simon go  

### Out of scope
Light mode · WebGPU · catalog growth · Plotly hero · n≥20 study · auto-solo · unflagged early hybrid rewrite  

### Consequences
A2 idle trail ≥0.85 superseded; DS rings default Off at full density; STAGE KEY open; hybrid broken until W4  

### Blast radius (modules)
Shared encoding/palette · stage3d-three · stage3d · projections · sweep · stage-guide · console · decide-panel · tokens/CSS shell · url-state · main canvas modes · table numeral formatters · tests  

### Follow-ups
Optional Visual Ralph after W1 · Forgejo map+tickets · mid-train independent only if user insists  

---

## W3 Decide non-render list (concrete)

When `decideMode === true`, **do not render** (remove from DOM or `hidden`+`aria-hidden`+not focusable — prefer not render):

| Host / section | Rationale |
|----------------|-----------|
| Family/effort NAVIGATE steppers + SHOW ALL | Explore |
| FIND search + family chip cloud | Explore |
| Permanent keyboard help paragraph | Explore dump |
| Value-score leaderboard (Explore ranks) | Decide uses shortlist |
| Workload preset row (coding/chat/…) | Explore weights story |
| Weight share sliders block | Decide uses floor/bias |

**Still render in Decide:** floor control, bias, shortlist, cost×speed chart, Copy decision, selection readout (decide-aware), scope bar, mode tabs, cinema.

**Explore inspector sections (fixed three, no “or equivalent”):**
1. **Selection** — optimum/selection + short meta  
2. **Score** — weights + presets + leaderboard (max 5 + expand)  
3. **Navigate** — family/effort + FIND  

---

## Scoreboard estimates (not acceptance)

41 → ~48 W0 → ~68 W1 → ~78 W2 → ~88 W3 → ~93 W4 → ~96 W5