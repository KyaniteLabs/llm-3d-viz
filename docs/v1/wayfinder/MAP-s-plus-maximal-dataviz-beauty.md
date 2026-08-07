# Map — S+ Maximal DataViz Beauty (W0–W6)

| Field | Value |
|-------|--------|
| **Status** | **executing** · Ultragoal · W0–W4 complete · **W5 D10 REDEFINED + cleared (identity-without-color via focus-set direct labels; palette floor = no degenerate merges)** · W5 instrument scorecard + W6 remain (role/deploy gated) |
| **Plan** | `.omx/plans/prd-s-plus-maximal-dataviz-beauty.md` |
| **Supersedes** | MAP-s-plus-observatory-quality · RALPLAN-s-plus-observatory-quality |
| **Baseline tip** | `d7bcec1` |
| **Target** | W5 D1–D12 ≥90 · W6 D1–D14 ≥90 · role means ≥92 · stretch ≥96 · **deploy only after W6 + Simon go** |
| **Mid-train** | Binary MAP accepts only |
| **Fail-stop** | Wn fail blocks W(n+1); no W2+W3 or W2+W6 parallel |
| **Charted** | 2026-08-07 |

## Critical path

```
W0 → W1 → W2 → W3 → W4 → W5 → W6
docs  verify  HUD/host  chrome  hybrid  instrument  DiB+SHIP
```

---

## W0 — Docs + law kill + MAP complete

**Blocked by:** None (plan consensus + user execute)  
**Evidence:** docs only  

- [x] Plan reaches Critic APPROVE + user `execute S+ maximal beauty`  
- [x] Single-source paint table published (trail 0.18, chroma 0.22, no 0.55×L)  
- [x] Supersede old RALPLAN desat block  
- [x] Remove old MAP W0 non-frontier desat  
- [x] DESIGN-SYSTEM §Color slate-as-default-fill rewritten  
- [x] decision-filament-hierarchy trail ≤0.45 → 0.18; singleton A/B noted  
- [x] Operational scorecard D1–D14 in plan (audit/evidence/fail)  
- [ ] Forgejo ticket IDs logged (new or re-titled #147–#153)  

**GATE:** all above before W1 code.

---

## W1 — Paint VERIFY freeze

**Blocked by:** W0  
**Evidence:** `.omx/artifacts/visual-ralph/s-plus-w1/`  

- [x] No algorithm change unless fail-set hits  
- [x] Goldens: `TRAIL_IDLE_OPACITY===0.18`, `MID_EFFORT_SIZE_SCALE===0.7`, `DOMINATED_CHROMA_PULL===0.22`, `brandLayerFlags` matrix (`tests/palette.test.ts` extended)  
- [x] AC-I1 four glance bullets documented with `1440-default.png`  
- [x] Singleton policy A or B locked in checklist.md  
- [x] `1440-default.png`, `cinema.png`, `checklist.md` present  
- [x] Zero emoji in label builders (unit)  

**GATE:** checklist all pass + units green.

---

## W2 — HUD honesty + materials + host lock

**Blocked by:** W1  
**Evidence:** `s-plus-w2/`  

- [x] STAGE KEY open desktop; closed mobile default  
- [x] Ring/core copy matches `brandLayerFlags` (no “always ≥3 colors” lie) — fix `stage-guide.ts`  
- [x] First paint keys: glyph · size · trail · frontier · optimum · top labs  
- [x] Ink materials on inputs; copper focus  
- [x] Numerals: IQ 1dp; cost 2–3dp; TPS int  
- [x] Method-strip host locked (footer/status); desktop ≤1 mono line budget  
- [x] Cinema: method line path = export overlay (not status-bar alone)  
- [x] No `stage r3f` / eng jargon in UI  
- [x] checklist.md + captures  

**GATE:** binary accepts + evidence.

---

## W3 — Chrome IA + Decide exclusivity

**Blocked by:** W2  
**Evidence:** `s-plus-w3/` + `decide.png`  

- [x] Explore sections: `[data-section="selection|score|navigate"]` per plan AC-I4  
- [x] Intent presets preserved under Score progressive path  
- [x] Keyboard dump only behind help control (`.nav-keys` not permanent)  
- [x] Leaderboard max 5 + expand  
- [x] Decide hide matrix (all must be hidden/absent):  
  `.weight-controls`, `.preset-controls`, `[data-intent-primary]`, advanced/score weight host, `.family-nav`, `#nav-family-search`, `[data-nav-family-search]`, `.family-chip-row`, `.value-leaderboard`, `.nav-keys`  
- [x] Decide keep visible: floor, bias, shortlist, cost×speed chart, Copy decision / `[data-decide-export]`  
- [x] Vitest asserts selector matrix  
- [x] checklist.md + decide.png  

**GATE:** tests + evidence.

---

## W4 — Hybrid + mobile + type

**Blocked by:** W3  
**Evidence:** `s-plus-w4/` + `390-mobile.png`  

- [x] Default 3D shows 2D strip simultaneous; height ≤148px (9.25rem)  
- [x] Same `pointEncoding` on 2D; multi-effort trails on 2D  
- [x] TABLE exclusive full-page mode  
- [x] Mobile ≤390: stage ≥52vh; inspector bottom sheet peek name+score  
- [x] Type: selection name 22–28px; scores mono 16–18; wordmark ~11 tracked  
- [x] checklist.md + 390-mobile.png + 1440  

**GATE:** binary + evidence.

---

## W5 — Cinema / CVD / instrument scorecard

**Blocked by:** W4  
**Evidence:** `s-plus-w5/`  

- [x] Cinema density: focus-set or top-K **K≤12** + frontier/optimum/selected; not full-catalog confetti
- [x] DOF + filament ridge in cinema
- [x] Threshold-sweep visible on weight change
- [x] **D10 REDEFINED (owner-approved 2026-08-07):** identity reachable WITHOUT color via always-on focus-set direct labels (`labelFocusIds`, default view, K≤12, NMS); palette floor = no identical primaries + no degenerate (<5 dE) deutan merge among high-signal labs. Old "≥35 all-pairs" bar retired — provably impossible for 33 labs in sRGB; conflicts with ridge+size+trail hierarchy law. See `s-plus-w5/d10-redefined.md`.
- [x] Multi-viewport recapture parity
- [ ] Independent scores **D1–D12** ≥90; role means ≥92 *(role-gated — implementer cannot self-score)*
- [ ] **Not** product deploy SHIP

**GATE:** instrument scorecard pass.

---

## W6 — DiB maximal + deploy SHIP

**Blocked by:** W5 instrument pass + W2 host lock  
**Evidence:** `s-plus-w6/`  

- [x] Method strip: as-of, sources, axes (economy basis), N — `data-method-strip` populated (main.ts updateTrustChrome)
- [x] Copy insight+method (`src/lib/share-copy.ts` + `data-copy-insight` button) — buildInsightMethodCopy wired
- [x] Story line; sparse = N_plottable<3 → fail-closed copy — defaultStoryLine handles n<3
- [x] Provenance in Selection when sources present — formatProvenanceLine (console.ts)
- [x] Log labels on 2D + Three where log — `axisTitle` in buildAxisDomain + projections.ts titleText (2026-08-07)
- [x] How-to-read — covered by always-open STAGE KEY (W2); no separate chrome (avoids redundant UI)
- [x] Cinema export overlay method line — CinemaMode.syncMethodOverlay (data-cinema-method under is-cinema)
- [ ] Independent **D1–D14** ≥90; tastecheck SHIP; Simon go  
- [x] checklist.md + captures  

**GATE:** deploy allowed only after this + Simon go.

---

## Fog

Light mode · WebGPU · rename · n≥20 study · Plotly hero · Liani on product

## Reopen

| Scorecard fail band | Reopen ticket |
|---------------------|---------------|
| D1–D3 | W1/W2 |
| D4–D5 | W3 |
| D6–D7 | W4 |
| D8–D12 | W5 |
| D13–D14 | W6 |

## Frontier

After Critic APPROVE + user execute → W0 then W1 verify.
