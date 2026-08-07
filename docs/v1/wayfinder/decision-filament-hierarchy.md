# Decision: glanceable lab color + filament rank (no hover required)

**Map:** MAP-s-plus-maximal-dataviz-beauty (supersedes #147)  
**Plan:** `.omx/plans/prd-s-plus-maximal-dataviz-beauty.md`  
**Date:** 2026-08-06 · **W0 locked:** 2026-08-07  
**Status:** **locked for execute** (owner glanceable fill; trail idle **0.18**; supersedes desat-until-hover + 0.55×L)  
**Authority:** Simon 2026-08-06 — *“see and understand at a glance; don’t want to hover; that was the point of color differentiation.”*

## Problem

Audit confetti was real (equal-loud marks + high-α trails + closed legend + no ridge rank). The first S+ draft fixed confetti by **desaturating non-frontier until hover/solo**. That **breaks the product job of lab color**: brand differentiation must be readable **without hover**.

## Product law (non-negotiable)

1. **Lab identity is glanceable** — full brand fill (`colors[0]`) is **always on** for every visible mark. No hover required to know lab.
2. **Encoding HUD is always on** — lab swatches + glyph 2×2 + size/trail/frontier keys match stage 1:1 on first paint (not a collapsed details).
3. **Rank is not carried by muting brand fill** — hierarchy uses ridge, size, trails, density, optimum treatment.

## Principle rank (amended)

1. **Glanceable lab color** (full fill always)  
2. **Filament ridge + size rank** (who wins / frontier)  
3. **Encode honesty / always-on HUD 1:1**  
4. **Calm chrome**  
5. **Hybrid simultaneous 2D**  

## Locked encoding (S+ default · glance-first)

| Channel | Rule |
|---------|------|
| **Fill color** | **Full lab brand `colors[0]` always** for all visible marks (frontier and non-frontier). Family shade OK. **Never require hover for lab.** |
| **Ridge** | Continuous `--filament` stroke · never lab-segmented · strongest rank signal |
| **Optimum** | Max size + gold/filament treatment · **no emoji** · same glyph; lab fill still present or gold overlay that remains identifiable |
| **Size** | Value-score continuous; frontier floor + optimum max; **readable without hover** |
| **Shape** | Sphere/octa × solid/wire (openness × reasoning) always visible |
| **Trails idle** | Family hue **α = 0.18** (code freeze; stricter than historical ≤0.45) |
| **Trails solo** | α ≥ 0.85 |
| **Endpoint emphasis** | Mid-effort **size** ×0.70 (not fill desat); endpoints full size |
| **Singleton** | Size/α hierarchy **only if lab hue still nameable** (W1 locks A keep 0.42+glanceable hue **or** B opacity 1 + size-only; no slate-mud fill) |
| **Rings/core ≥3** | Default **off** at full density (noise); **on** for solo / selected / `?brand=full` / density-expand / cinema focus-set — **not** required for lab glance (fill alone is enough) |
| **Legend HUD** | **Always open**; lab color chips for every lab in view; glyph matrix; size ramp; frontier/optimum |
| **Hover** | Detail only (name, metrics) — **never** the first reveal of lab color or channel meaning |

## Explicitly rejected

| Option | Why |
|--------|-----|
| Desat non-frontier until hover/solo | **Violates glanceable lab color** (owner veto 2026-08-06) |
| Drop lab color / mono heat | Owner rejected earlier |
| Auto-solo first paint | Kills comparison |
| Closed STAGE KEY | Forces hover/click to decode |

## What still kills confetti (without muting brand fill)

1. Continuous filament ridge + clear size hierarchy  
2. Quiet trails (α), not quiet fills  
3. Endpoint size emphasis on multi-effort  
4. Rings/core off by default (fill is enough for lab)  
5. Density: prefer readable subset defaults already in scope; not equal visual weight via trail spaghetti  
6. Always-on HUD so shape/size/lab map without stage archaeology  

## Ticket impact (must re-lock before execute)

| Ticket | Change |
|--------|--------|
| **W0** | Write this law into DESIGN-SYSTEM; remove “non-frontier ≤55% L” as default |
| **W1** | Paint: **full brand fill always**; hierarchy via ridge/size/trail α/endpoint **size**; drop desat-fill requirement |
| **W2** | HUD: lab chips always visible = glance path for color key |
| W3–W5 | Unchanged intent |

## Acceptance (glance test)

Without hovering any mark, a cold viewer can:

1. Name **which labs** are present (from fill + HUD chips)  
2. See **frontier / optimum** (ridge + size + optimum treatment)  
3. Read **openness × reasoning** (glyph + HUD)  
4. Read **rough value-score rank** (size)  

Hover may add name/metrics only.

## Amend on W0 close

- DESIGN-SYSTEM.md: lab fill always-on; hierarchy channels listed above  
- RALPLAN scorecard D1: “filament + size rank” not “desat non-frontier”  
- MAP/W1 accept bullets: replace luminance≤55% fill rule with glance-first paint rules  
- Comment on Forgejo #146 / #147 / #149 when execute train starts  


## W0 lock (2026-08-07)

Single-source paint authority published in DESIGN-SYSTEM + maximal-beauty plan.  
**Forbidden:** `target_L = 0.55 × L` desat; slate-cyan as default dominated **mark fill**; hover-gated lab color.  
**Allowed:** chroma pull 0.22 keep hue; trail idle 0.18; mid size 0.7.  
Ultragoal: G001–G007 under `.omc/ultragoal/`.
