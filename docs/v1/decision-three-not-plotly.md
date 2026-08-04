# Decision: Three hero, not Plotly stage

**Date:** 2026-08-03  
**Decider:** Simon (explicit: “were not doing plotly”)  
**Supersedes for 3D hero:** SPEC D7 “Plotly-first v0 then Three later” *as a publish path*; HANDOFF “optional Plotly film”; any agent advice to ship/polish Plotly 3D.

## Decision

The **3D hero is Three.js** (`src/viz/stage3d-three.ts` behind `Stage3DSurface`). We will **not** invest in Plotly gl3d as the product or video look.

## Still allowed (temporary)

- **2D projections** may keep Plotly SVG until a separate non-Plotly pass (per `docs/v1/r3f-stage-contract.md` — do not port 2D in the same train as the hero swap).

## Not allowed

- Plotly stage polish, “film Plotly v0 instead,” defaulting product back to Plotly 3D, or using Plotly as the beauty bar.

## Next engineering bar

1. Three hero must win **visual go** on http://127.0.0.1:4200/ (Safari-safe preview).
2. Beauty = DESIGN-SYSTEM *Observatory-after-dark* executed hard: ridge, sweep, cinema, honest axes — not Plotly parity.
3. After go: remove/default-off Plotly stage path; code-split already keeps Plotly out of main Three chunk where possible.

## Authority order

This decision + current user direction > stale HANDOFF lines > SPEC D7 publish sequencing for the 3D stage only.
