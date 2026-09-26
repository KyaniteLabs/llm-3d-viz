# Map — S+ Observatory quality (≥90 at W5 · binary gates W0–W4)

| Field | Value |
|-------|--------|
| **Status** | **superseded** by MAP-s-plus-maximal-dataviz-beauty (2026-08-07) |
| **Forgejo map** | #147 |
| **PRD** | #146 |
| **Tickets** | #148→#149→#150→#151→#152→#153 |
| **Baseline** | live `100709f` · independent critic **41/100** · HOLD |
| **Target** | W5 every scorecard dim **≥90** · composite **≥92** · stretch **≥96** |
| **Mid-train** | Binary MAP accepts only — **no** numeric ≥90 until W5 |
| **Fail-stop** | Wn fail blocks W(n+1); implementer cannot self-clear |
| **RALPLAN** | [RALPLAN-s-plus-observatory-quality.md](./RALPLAN-s-plus-observatory-quality.md) |
| **Decision** | [decision-filament-hierarchy.md](./decision-filament-hierarchy.md) |
| **Evidence root** | `.omx/artifacts/visual-ralph/adversarial-2026-08-06/` |
| **Charted** | 2026-08-06 |

---

## Critical path

```
W0 → W1 → W2 → W3 → W4 → W5
docs   paint  HUD    chrome hybrid  scorecard
```

| # | Ticket | Blocked by | Gate type |
|---|--------|------------|-----------|
| W0 | Lock S+ docs + DS + density algorithms | — | binary docs |
| W1 | Shared paint hierarchy + density + legend co-land | W0 | binary + units |
| W2 | Always-on open HUD + materials + numerals + copy | W1 | binary + capture |
| W3 | Chrome 3 sections + Decide non-render + table | W2 | binary + capture |
| W4 | Linked 2D strip + mobile sheet + type | W3 | binary + capture |
| W5 | Cinema/CVD/sweep + independent triple scorecard | W4 | **≥90 all dims** |

---

## W0 — Lock S+ acceptance

**Blocked by:** None  
**Evidence:** docs only  

- [ ] `decision-filament-hierarchy.md` status locked (algorithms + principle rank)  
- [x] ~~non-frontier desat~~ **SUPERSEDED** → glanceable fill + chroma pull (see MAP-s-plus-maximal-dataviz-beauty) · rings/core focus-gated · filament ridge · no carnival · no emoji  
- [ ] A2 supersession pointer (idle trail α; rings) in wayfinder docs  
- [ ] `decision-semantic-color-aa.md` pointer to S+ hierarchy overlay  
- [ ] RALPLAN W5 scorecard + mid-train binary rule published  

---

## W1 — Shared paint hierarchy + density

**Blocked by:** W0  
**Evidence:** `.omx/artifacts/visual-ralph/s-plus-w1/` (`1440-default.png`, `cinema.png`, `checklist.md`) + unit tests  

- [ ] One shared encoding/hierarchy helper consumed by Three, Plotly stage, projections, sweep  
- [ ] Ridge continuous filament (not lab-segmented)  
- [ ] Optimum max size + gold/filament · **zero** ⚡/★/emoji prefixes  
- [ ] **Full lab brand fill always on** (no hover for lab); hierarchy via ridge/size/trails not desat fill  
- [ ] Trail idle α≤0.45; solo/hover ≥0.85  
- [ ] Endpoint emphasis: mid **size**×0.70; endpoints 1.0 (keep brand fill)  
- [ ] `showRing`/`showCore` = **true** iff `solo | selected | ?brand=full | density-expand(=brand full) | cinema focus-set member`; else **false** at full catalog. (Cinema zoom alone does not enable rings for the whole catalog.)  
- [ ] legendEntries co-landed (no ring/core promise when off)  
- [ ] Unit tests: golden luminance vectors + no-frontier-peer fallback  
- [ ] checklist.md all bullets pass  

---

## W2 — Always-on open HUD + materials + copy

**Blocked by:** W1  
**Evidence:** `s-plus-w2/`  

- [ ] STAGE KEY / encoding HUD **open by default** (max-height ~56–72px scroll); never collapsed-default  
- [ ] First paint shows: glyph 2×2 · size ramp · trail · frontier · optimum · top labs  
- [ ] Expand reveals full lab list + frontier list  
- [ ] Zero emoji product-wide  
- [ ] No white native inputs (ink-panel materials; copper focus)  
- [ ] Table IQ 1 decimal; cost 2–3dp; TPS integer  
- [ ] Footer/copy: no `stage r3f`; export label “Copy decision”  
- [ ] First-paint decode: user can state lab/shape/size channels without opening prose wall  
- [ ] checklist.md all pass  

---

## W3 — Chrome diet + Decide exclusivity + table

**Blocked by:** W2  
**Evidence:** `s-plus-w3/` including `decide.png`  

- [ ] Explore inspector exactly three sections: **Selection | Score | Navigate** (no “equivalent”)  
- [ ] Keyboard help only behind `?` / help control  
- [ ] Leaderboard max 5 + expand  
- [ ] Decide mode **does not render**: NAVIGATE, FIND+chips, key dump, Explore leaderboard, presets, weight sliders (see RALPLAN table)  
- [ ] Decide still renders: floor, bias, shortlist, cost×speed chart, Copy decision, decide selection  
- [ ] Cost×speed chart legible (axes, ridge, labels when shortlist ≥1)  
- [ ] Badges: eligible / ridge / shortlist from decide authority (not stale frontier-only)  
- [ ] checklist.md all pass  

---

## W4 — Hybrid 2D + mobile + type

**Blocked by:** W3  
**Evidence:** `s-plus-w4/` including `390-mobile.png`  

- [ ] Default 3D mode shows linked 2D projection row simultaneous (SPEC hybrid); strip height ≤148px  
- [ ] Same encoding helper as 3D; multi-effort trails on 2D  
- [ ] TABLE remains exclusive full-page mode  
- [ ] Mobile ≤390: stage ≥52vh; inspector bottom sheet (peek = name+score)  
- [ ] Type: selection name 22–28px; scores mono 16–18; wordmark 11 tracked  
- [ ] checklist.md all pass  

---

## W5 — S+ polish + independent scorecard

**Blocked by:** W4  
**Evidence:** `s-plus-pass/` + filled scorecard JSON  

- [ ] Cinema: density filter + DOF + filament ridge; no full-catalog confetti export  
- [ ] CVD deuteranopia spot-check; fix collisions if fail  
- [ ] Threshold-sweep visible on weight change  
- [ ] Full multi-viewport recapture (adversarial set parity)  
- [ ] Independent critic scores D1–D12 per RALPLAN (≥90 each scored)  
- [ ] Independent designer scores applicable dims ≥90 · SHIP instrument  
- [ ] Independent dataviz scores applicable dims ≥90 · no VIS P0  
- [ ] Composite mean ≥92 (stretch ≥96)  
- [ ] tastecheck-pass SHIP + visual veto cleared  

---

## Fog
Light mode · WebGPU · n≥20 study · more brand hex unless CVD fail · new Decide features  

## Decisions so far
1. User bar ≥90 all W5 dims · S+  
2. **Glanceable lab color always-on** (owner 2026-08-06) · hierarchy via ridge/size/trails, not muted fill  
3. Binary mid-train · numeric only W5  
4. Fail-stop · one paint seam  
5. No code until user execute approval  

## Frontier
**Next after approval:** W0 then W1. Say **execute S+ map**.

## Next train (after this map)
- [MAP-oss-custom-quality.md](./MAP-oss-custom-quality.md) — architecture + ultraqa → customizable → FJ+GH open source



## Superseded by (2026-08-07)
- [MAP-s-plus-maximal-dataviz-beauty.md](./MAP-s-plus-maximal-dataviz-beauty.md)
- Plan: `.omx/plans/prd-s-plus-maximal-dataviz-beauty.md` (Critic APPROVE · pending user execute)
