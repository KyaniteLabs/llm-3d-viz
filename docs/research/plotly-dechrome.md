# Plotly de-chrome surface — what v0 can strip, style, and drive

Research ticket: verify, against current plotly.com/javascript docs, how far a Scatter3d
render-engine-only stack can be de-chromed and driven for the llm-3d-viz SPEED × COST ×
INTELLIGENCE explorer. Every verdict below cites a doc page that was actually fetched
(2026-08-01). Verdicts:

- **native** — a documented config/layout/trace key does exactly what we need.
- **restyled** — achievable via documented update APIs (`Plotly.restyle` / `relayout` /
  `react` / `Fx.hover`) or documented events, with our own logic around them.
- **custom-HTML** — Plotly cannot do it; we build it outside the plot and drive it from
  documented events.
- **impossible/shaky** — no documented path, or the documented path has caveats that
  matter for v0.

Doc URLs used throughout:
- CONFIG = https://plotly.com/javascript/configuration-options/
- SCATTER3D = https://plotly.com/javascript/reference/scatter3d/
- SCENE = https://plotly.com/javascript/reference/layout/scene/
- AXES3D = https://plotly.com/javascript/3d-axes/
- EVENTS = https://plotly.com/javascript/plotlyjs-events/
- HOVER = https://plotly.com/javascript/hover-events/
- ANIM = https://plotly.com/javascript/animations/
- FUNCREF = https://plotly.com/javascript/plotlyjs-function-reference/
- SCATTER3DDOC = https://plotly.com/javascript/3d-scatter-plots/

## Capability matrix

| # | Feature | Verdict | Exact config keys / API | Doc URL |
|---|---------|---------|--------------------------|---------|
| 1 | Remove modebar entirely | native | `config = {displayModeBar: false}` (4th arg to `newPlot`) | CONFIG |
| 2 | Remove Plotly logo | native | `config = {displaylogo: false}` (moot if modebar is off) | CONFIG |
| 3 | Kill all interactivity if ever needed | native | `config = {staticPlot: true}` | CONFIG |
| 4 | Hide grid lines on 3D axes | native | `layout.scene.{xaxis,yaxis,zaxis}.showgrid: false` | SCENE |
| 5 | Hide zero lines | native | `layout.scene.{x,y,z}axis.zeroline: false` (+ `zerolinecolor`, `zerolinewidth` if kept) | SCENE |
| 6 | Hide tick labels / ticks | native | `scene.{x,y,z}axis.showticklabels: false`, `ticks: ''` | SCENE |
| 7 | Hide axis walls / background | native | `scene.{x,y,z}axis.showbackground: false`; restyle with `backgroundcolor`, `gridcolor` (both demonstrated) | SCENE, AXES3D |
| 8 | Hide whole axis, keep drag | native | `scene.{x,y,z}axis.visible: false` — "single toggle to hide the axis while preserving interaction like dragging" | SCENE |
| 9 | Hide hover spikes (3D projection lines) | native | `scene.{x,y,z}axis.showspikes: false`, `spikesides: false` (`spikecolor`/`spikethickness` if kept) | SCENE |
| 10 | Disable default hover card | native | trace `hoverinfo: 'none'` — "no information is displayed… But… click and hover events are still fired"; `'skip'` suppresses events too. Also `scene.hovermode: false` | SCATTER3D, SCENE |
| 11 | Hover/click events on Scatter3d points | native | `gd.on('plotly_hover' / 'plotly_unhover' / 'plotly_click', …)`. 3D event data documented: `points[].curveNumber`, `pointNumber`, `x`, `y`, `z`, `data`, `fullData`, `xaxis/yaxis/zaxis` refs | EVENTS |
| 12 | Custom HTML tooltip (built outside Plotly) | custom-HTML | Drive an absolutely-positioned div from `plotly_hover` payload (`pointNumber` → model record). **Caveat: no documented data→pixel projection API for 3D scenes.** 2D cartesian axes expose `l2p()` (used in docs); the 3D event payload carries x/y/z but no pixel coords. v0 must anchor the tooltip to the cursor (`event` mouse position) or compute projection from `scene.camera` eye/up/center itself. | EVENTS, HOVER |
| 13 | Programmatic hover trigger (for coupled views) | native | `Plotly.Fx.hover(gd, [{curveNumber, pointNumber}])`; suppress Plotly's own label with `plotly_beforehover` → `return false` (documented pattern) | HOVER |
| 14 | Log scale on all three 3D axes | native | `scene.{x,y,z}axis.type: 'log'` — enumerated axis type includes `"log"` for scene axes. **Gotchas:** `range` must be given in log10 units ("range from 1 to 100 → [0, 2]"); log `dtick` uses special strings (`"L<f>"`, `"D1"`, `"D2"`); data must be > 0 | SCENE |
| 15 | Per-provider point glyphs by shape | native | `scatter3d.marker.symbol` accepts **a per-point array** ("enumerated or array of enumerateds"). Only **8 symbols** exist: `circle`, `circle-open`, `cross`, `diamond`, `diamond-open`, `square`, `square-open`, `x`. Fine for ≤8 providers; beyond that, combine shape × color or drop to circles + color | SCATTER3D |
| 16 | Per-point color / size arrays | native | `marker.color` (color or array of colors), `marker.size` (number or array), `sizemode`/`sizeref`/`sizemin`. **Caveat:** `marker.opacity` on scatter3d must be a scalar — per-point alpha requires rgba colors in `marker.color` | SCATTER3D |
| 17 | Threshold-sweep ignition (~400ms staged per-point) | restyled | `Plotly.restyle(gd, {'marker.color': [colorArray]}, [traceIdx])` — array values must be wrapped in an extra array; per-point updates documented and fast. Drive the stagger with our own `requestAnimationFrame`/timer scheduler. **`Plotly.animate` is the wrong tool here: "only scatter traces may be smoothly transitioned"; scatter3d frames update instantaneously.** If `animate` is used for coarse steps, set `frame.redraw: false` for perf | FUNCREF, ANIM, EVENTS |
| 18 | Programmatic camera set | native | `layout.scene.camera = {eye: {x,y,z}, up: {x,y,z}, center: {x,y,z}}`, plus `camera.projection.type: 'perspective' | 'orthographic'` | SCENE, AXES3D |
| 19 | Cinema-mode slow orbit | restyled (shaky) | Per-frame `Plotly.relayout(gd, 'scene.camera', {eye: …})` from a rAF loop, rotating `eye` around the scene center — relayout is documented as fast as restyle/react, and `plotly_relayout` emits `scene.camera` (eye/up/center) on user drags so we can sync state back. **Shaky part:** `Plotly.animate` smooth layout transitions are only documented for 2D axis ranges; a smooth *3D camera* transition via `animate` is not documented anywhere — hand-roll the interpolation | FUNCREF, ANIM, EVENTS |
| 20 | Orbit / turntable drag with custom styling | native | `scene.dragmode: 'orbit' | 'turntable' | 'zoom' | 'pan' | false` — independent of axis chrome settings; hiding axes/grids/spikes does not affect drag | SCENE |
| 21 | Camera persistence across re-renders | native | `scene.uirevision` (controls persistence of user-driven camera changes) — pin it so our restyles don't snap the user's camera back | SCENE |
| 22 | Linked 2D projections (speed×intel, speed×cost, cost×intel) | restyled | Three separate 2D `scatter` divs updated with `Plotly.react` (documented "as fast as Plotly.restyle/Plotly.relayout"; note immutability / `layout.datarevision` requirement for array diffs). Cross-highlight via shared `pointNumber` keys + `Plotly.Fx.hover` on the 2D plots ("coupled hover events" is a documented pattern). **Pitfalls:** (a) 3D hover payload has no pixel coords — sync by point index, never by position; (b) `Fx.hover` fires Plotly's own 2D label unless suppressed with `plotly_beforehover` → false; (c) each WebGL chart costs a GL context — keep WebGL to the single 3D view (2D scatter is SVG) and listen for `plotly_webglcontextlost`; (d) `uirevision` on 2D axes to avoid zoom resets on `react`. Custom SVG for the 2D panels is **not meaningfully better at ~40 points** — it buys pixel-perfect registration but re-implements hover, scales, and log axes Plotly already gives us. | FUNCREF, HOVER, EVENTS |

## v0 build implications

1. **De-chrome is fully native.** Every chrome element in the ban list (modebar, logo,
   grids, zero lines, tick labels, axis walls, hover spikes, hover card) has a documented
   off switch. The base figure is one `newPlot` call with
   `config = {displayModeBar: false, displaylogo: false}`,
   per-axis `showgrid/zeroline/showticklabels/showspikes/showbackground: false`, and
   trace `hoverinfo: 'none'`. No CSS hacks against Plotly internals needed.
2. **Tooltip is the one true custom-HTML piece.** Events fire on Scatter3d with full
   point identity (`curveNumber`/`pointNumber`/`x`/`y`/`z`), and `hoverinfo: 'none'`
   keeps them firing while hiding Plotly's card — the exact seam we need. The only gap:
   **no documented 3D data→pixel projection**, so v0 positions the tooltip at the cursor,
   not at the projected point. A scene-camera projection helper is a post-v0 refinement.
3. **Log³ is native**, including on 3D axes — but ranges/ticks are in log10 units and
   zero/negative benchmark values are unplottable; normalize data upstream.
4. **Glyph budget is 8 shapes** (circle/circle-open/cross/diamond/diamond-open/square/
   square-open/x), per-point assignable. Provider encoding should be shape × color with
   ≤8 shapes as the hard ceiling.
5. **Threshold-sweep: own scheduler + `Plotly.restyle`, not `Plotly.animate`.** Smooth
   transitions are documented for 2D `scatter` only; scatter3d frames snap. At ~40
   points, a rAF loop calling `restyle` with wrapped per-point `marker.color`/`marker.size`
   arrays every frame or two is the documented-performant route. Keep per-point alpha in
   rgba color strings (3D `marker.opacity` is scalar-only).
6. **Cinema orbit: hand-rolled rAF + `relayout` of `scene.camera.eye`.** Documented and
   fast, but there is no documented smooth 3D camera transition — we interpolate eye/up
   ourselves. Pin `scene.uirevision` and read `plotly_relayout` camera payloads so user
   drags and cinema mode don't fight.
7. **2D projections stay in Plotly.** `Plotly.react` on three small SVG scatter plots,
   cross-linked by `pointNumber` with `Fx.hover` and `plotly_beforehover` suppression.
   Sync by index, not pixels; keep `uirevision` stable. Custom SVG is a v-next
   consideration only if "snap into registration" demands pixel-level choreography that
   index-sync can't deliver.

### Shaky / flagged items

- **3D pixel projection: no documented API.** Tooltip positioning must use cursor
  coordinates or a self-computed projection from `scene.camera` vectors. (Row 12)
- **Smooth 3D camera animation not documented.** `Plotly.animate` smooth layout
  transitions are shown for 2D axis ranges only; scatter3d and (by omission) scene camera
  are not covered. Plan on manual interpolation. (Rows 17, 19)
- **`Plotly.react` diffing gotcha:** new array items must be added immutably or
  `layout.datarevision` bumped, or updates are silently skipped. (Row 22)
- **Per-point opacity in 3D:** scalar only; use rgba colors instead. (Row 16)
