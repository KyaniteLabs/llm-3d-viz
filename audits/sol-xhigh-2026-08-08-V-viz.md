# Sol@xhigh audit — VIZ / RENDERING — llm-3d-viz — 2026-08-08

## Verdict: FAIL (0 CRIT / 8 HIGH / 5 MED / 0 LOW)

## Scope read
Fully opened: `src/viz/stage3d-three.ts`, `src/viz/stage3d.ts`, `src/viz/stage-api.ts`, `src/viz/projections.ts`, `src/viz/sweep.ts`, `src/viz/sweep-timing.ts`, `src/viz/palette.ts`, `src/viz/mark-encoding.ts`, `src/viz/cinema.ts`, `src/viz/plotly-loader.ts`. Context/support opened: `SPEC.md`, `DESIGN-SYSTEM.md`, `HANDOFF.md`, `src/main.ts`, `src/lib/axis-metrics.ts`, `src/lib/pareto.ts`, `src/lib/cinema-focus.ts`, `src/data/models.ts`, `src/state.ts`, `src/styles/tokens.css`, `package.json`, `package-lock.json`, relevant tests/catalog rows, and Plotly 3.7.0 loader/hover source. Tools: `read`, `find`, `search`, three read-only architect lanes, and one read-only `node -e` catalog check (299 scorable rows, 22 default-frontier rows). No source mutation, server, build, test, install, deploy, or formatter command was run.

## Findings (CRITICAL → LOW)
### [HIGH] V01 — Linked projections pass six unresolved display-P3 tokens into Plotly
- **File:** `src/viz/projections.ts:117-127` (renderer sinks at `:215-220`, `:259-280`, `:365-369`)
- **Evidence:** `const resolveToken = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;` followed by `filament: resolveToken("--filament", ...)`, `filamentDim`, `slateCyan`, `textWarm`, `textMuted`, and `inkField`. Those raw values reach `paper_bgcolor: this.tokens.inkField`, `plot_bgcolor: this.tokens.inkField`, axis colors, and the point palette. `src/styles/tokens.css:102-112` redefines every one of those color tokens as `color(display-p3 …)` on capable displays. Unlike both stage backends, this constructor never calls `resolveColorToken()`.
- **Impact:** On a P3 browser, e.g. Safari on the target Apple workstation, all three linked Plotly panels receive color syntax Plotly's legacy parser does not understand. `colorWithAlpha()` also falls through and returns the raw P3 string, so backgrounds/axes/marks can default to white or invalid colors: the known projection whiteout. Exact unresolved tokens: `--filament`, `--filament-dim`, `--slate-cyan`, `--text-warm`, `--text-muted`, `--ink-field`.
- **Fix:** Use the same canvas-to-sRGB `resolveColorToken()` implementation as `stage3d.ts:59-77` for all six colors; keep plain `resolveToken()` only for `--font-mono`.

### [HIGH] V02 — `Infinity` is admitted into Three domains and glyph coordinates
- **File:** `src/viz/stage3d-three.ts:927-964`, `src/lib/axis-metrics.ts:269-278`
- **Evidence:** Three selects points with `const plottable = modelsList.filter((m) => hasMappedAxes(m, this.axisMapping));`. The predicate only rejects `v === null || Number.isNaN(v)` and negative log values; it does not reject positive `Infinity`. Those rows are then passed to `buildAxisDomain()` and `modelToSceneCoords()`.
- **Impact:** A concrete row with finite cost/intelligence and `tps: Infinity` passes `hasMappedAxes`. The log domain gets `max = Infinity`; finite speeds collapse to one cube face, while the infinite row computes `Infinity / Infinity = NaN` and its mesh position contains a NaN. The hero point field degenerates/disappears while the 2D projections omit the same row via finite-safe `isScorable()`, breaking linked-view parity. An infinite price corrupts X the same way.
- **Fix:** Make `hasMappedAxes()` require `Number.isFinite(v)` (and retain the log non-negative rule); defensively filter non-finite values again in `buildAxisDomain()` and reject non-finite scene coordinates before constructing `THREE.Vector3`.

### [HIGH] V03 — Plotly `destroy()` skips purge, leaking the gl3d context and resize/listener state
- **File:** `src/viz/stage3d.ts:600-606`, `src/viz/projections.ts:469-476`, `src/viz/plotly-loader.ts:4-17`
- **Evidence:** Both destroy paths use `const Plotly = (window as any).Plotly;` and purge only when that global exists. The loader returns the imported module and, only in DEV, stores it at `window.__viz.Plotly`; it never assigns `window.Plotly`.
- **Impact:** In the bundled module path, destroying/remounting the Plotly stage removes its div without calling `Plotly.purge()`. The exact un-disposed object is the scatter3d graph attached to `this.gd`, including its WebGL scene/context, Plotly event emitter and `responsive:true` resize machinery; every projection graph in `this.gds` likewise retains Plotly runtime/listener state. Repeated mounts accumulate contexts until browsers evict one and blank a stage.
- **Fix:** Retain the resolved `PlotlyModule` on each instance (or expose a synchronous `getLoadedPlotly()` cache) and call that exact module's `purge()` for every owned graph before removing its div.

### [HIGH] V04 — Pending Plotly imports resurrect destroyed graphs
- **File:** `src/viz/stage3d.ts:223-225,510-520,600-606`; `src/viz/projections.ts:291-293,361-385,469-476`
- **Evidence:** Both async renderers execute `const Plotly = await loadPlotly();` before `const gen = ++this.renderGen;`. `destroy()` increments `renderGen`, but a render waiting on the import has not captured its generation yet.
- **Impact:** `render(); destroy();` before the lazy chunk resolves is a deterministic failure: destroy changes generation 0→1 and removes the div; the continuation then changes 1→2, passes every `gen === this.renderGen` guard, and calls `Plotly.newPlot()` on the detached stage/projection divs. The exact leaked objects are newly created Plotly canvases/graphs, including a new gl3d WebGL context, after teardown. A replacement mount can coexist with this orphan.
- **Fix:** Increment/capture generation before the first `await`, add a terminal `destroyed` flag, recheck both immediately after every await and before publishing/listener attachment, and await/cancel the in-flight first plot.

### [HIGH] V05 — Plotly views violate `StageRenderOptions` and current-axis projection semantics
- **File:** `src/viz/stage-api.ts:15-52`, `src/viz/stage3d.ts:216-220`, `src/viz/projections.ts:27-31,130-134,287-304`
- **Evidence:** The surface contract accepts `axisMapping`, fit, family emphasis, Decide floor/Pareto/shortlist, cinema focus and label focus. The Plotly stage only reads `presentationMode`, then executes `void options` and always uses `DEFAULT_AXIS_MAPPING`. Projections hard-code `{tps,intelligence}`, `{tps,cost}`, and `{cost,intelligence}` and their render method accepts no mapping/options.
- **Impact:** Select the shipped task-economy mapping (`cost_per_index × intelligence × time_per_index`): the Three cube remaps, but all linked panels continue plotting rate `tps/cost`; under `?stage=plotly`, even the hero remains on default axes while UI/share state reports task axes. With Decide enabled, the Plotly hero still shows classic optimum/frontier rather than floor eligibility/shortlist. Users make decisions from plots whose displayed semantics disagree with the active controls.
- **Fix:** Thread normalized `StageRenderOptions`/`AxisMapping` into the Plotly stage and projections, derive the three orthogonal 2D specs from active X/Y/Z, and implement Decide/cinema/family behavior or stop presenting the fallback as a contract-compatible `Stage3DSurface`.

### [HIGH] V06 — Sweep reasserts stale classic styling over Decide, cinema and remapped renders
- **File:** `src/viz/sweep.ts:116-143,176-184,250-292,299-310`; `src/viz/stage3d-three.ts:1106-1113,1383-1392`
- **Evidence:** Sweep detects only weight/filter changes. Every other store change takes `this.reassertAppearance()` even though `markerStates()` always computes classic frontier/optimum styling and knows nothing about `decideMode`, `cinemaMode`, or axis mapping. The terminal write calls Three's `__setPointAppearance`; Three scales by `Math.max(0.4, sizes[i] / base)`.
- **Impact:** Enter Decide: the stage correctly paints floor/Pareto/shortlist, then a projection `plotly_afterplot` reasserts the prior classic colors/sizes, erasing shortlist/Pareto size hierarchy. Enter cinema: excluded marks are rebuilt with `baseSizePx = 0.01`; any stale sweep write with a normal size such as 8 sets scale to 800. Those opacity-zero meshes still depth-write/raycast (V09), producing giant invisible depth/hover occluders. An axis remap with equal old/new point counts can also apply old index arrays to different model IDs.
- **Fix:** Treat axis/Decide/cinema changes as appearance-invalidating state, key cached appearance by graph model IDs and mode, and never reassert a classic sweep over a semantically different stage. For cinema, skip suppressed meshes or make `setPointAppearance()` ignore invisible marks.

### [HIGH] V07 — `CinemaMode.destroy()` leaves a live store subscriber and stale body control
- **File:** `src/viz/cinema.ts:31-49,51-67,69-72`
- **Evidence:** `this.store.subscribe((state) => this.render(state));` discards the returned unsubscribe function. `destroy()` only stops the current RAF and removes the media listener. The body-level `[data-cinema-exit]` button and its closure over the old store are never removed/rebound.
- **Impact:** Destroy and remount with a new stage/store: a later old-store cinema update invokes the destroyed instance's `render()` and restarts its orphan RAF against the disposed stage. The persistent Exit FAB still updates the old store; the new instance sees the existing button and attaches no handler, so its visible exit control is broken. The exact un-disposed objects are the AppStore listener, its retained `CinemaMode`/stage graph, and the FAB click listener.
- **Fix:** Store and invoke the subscription disposer; track/remove or explicitly rebind the FAB handler on teardown/remount; clear cinema classes/overlay/atmosphere during destroy.

### [HIGH] V08 — `SweepScheduler.destroy()` leaves `plotly_afterplot` closures writing stale arrays
- **File:** `src/viz/sweep.ts:159-164,318-331,381-393`
- **Evidence:** Listener registration uses an untracked closure: `(gd as any).on.call(gd, "plotly_afterplot", () => this.onAfterPlot(gd))`. `destroy()` removes the store/media listeners and scheduled sweep only; it neither detaches these Plotly listeners nor clears `currentAppearance`.
- **Impact:** Destroy/recreate the scheduler on the same live plots: each old `plotly_afterplot` callback retains its scheduler, models, store and graph divs, and continues restyling stale colors/sizes after every redraw. Old and new schedulers can permanently fight, while every remount adds another retained closure. This is a concrete listener/resource leak even when Plotly graph teardown is intentionally independent.
- **Fix:** Store one callback per graph, remove it with the graph emitter's listener-removal API in `destroy()`, clear `currentAppearance`, reset registration flags, and guard queued microtasks with a destroyed/run token.

### [MEDIUM] V09 — Cinema “suppressed” glyphs remain depth-writing and hoverable
- **File:** `src/viz/stage3d-three.ts:804-831,1106-1142,1395-1420`
- **Evidence:** Non-focus marks get `opacity = 0; size = 0.01`, but `radiusForSize()` still returns about `0.045`, `makePointMesh()` sets `depthWrite: true`, and every mesh is pushed into `pointMeshes`/`modelIds`. Raycasting intersects the complete `pointMeshes` array without checking opacity/visibility.
- **Impact:** With a cinema focus set `{A,B}`, every excluded model remains a normal-radius invisible depth occluder and can win raycasts, emitting `stage:hover` for a model that the export claims is fully suppressed. It can hide later transparent membrane/glow/focus geometry; V06 can enlarge it 800×.
- **Fix:** Do not construct/push non-focus mark meshes (domains can still use all rows), or set `visible=false`, `depthWrite=false`, and exclude them from raycast/model-ID/export arrays.

### [MEDIUM] V10 — Threshold sweep drops Qwen's model-aware brand alias
- **File:** `src/viz/sweep.ts:203-212`, `src/viz/palette.ts:349-366`
- **Evidence:** Sweep calls `pointEncoding({ ..., provider: model.provider })` without `modelId`. `resolveLabKey()` only remaps Alibaba rows to Qwen when `/qwen/i` matches `modelId`. Both stage renderers pass the model ID; sweep is the later terminal color writer.
- **Impact:** The catalog contains many `Qwen*` rows whose provider is `Alibaba`. First paint uses Qwen sky (`#38BDF8` family), then the settled sweep resolves bare Alibaba and flips them to the Alibaba orange family. Every weight/filter sweep corrupts lab identity in the hero and projections.
- **Fix:** Pass `modelId: model.model` in both sweep `pointEncoding()` calls that have a model.

### [MEDIUM] V11 — Projection teardown purges a stage div it does not own
- **File:** `src/viz/projections.ts:469-475`
- **Evidence:** After purging `this.gds`, `destroy()` also executes `Plotly.purge(this.stageGd)`, although `stageGd` is borrowed only for hover coupling and is owned by `Stage3D`.
- **Impact:** Independent projection teardown (HMR, view toggle, remount sequencing) blanks a still-live Plotly hero. Its `Stage3D.isInitialized` remains true, so the next stage render takes `Plotly.react()` against a purged graph. Once V03 supplies the real Plotly module, this latent ownership violation becomes deterministic.
- **Fix:** Purge only `this.gds`; remove the DOM coupling listener from `stageGd` but leave stage purge to `Stage3D.destroy()`.

### [MEDIUM] V12 — Family highlight cannot restore trail opacity and leaves child brand layers bright
- **File:** `src/viz/stage3d-three.ts:1173-1184,1354-1379`
- **Evidence:** Trails are created at `trailEnc.trailOpacity ?? 0.18`, but clearing highlight takes the final branch `mat.opacity = 0.92`. Point dimming changes only the parent `mesh.material`; `accentShell` and `coreShell` child materials are not traversed.
- **Impact:** Hover any family and leave: all effort trails jump permanently from the required quiet 0.18 alpha to 0.92, cluttering the cube and overpowering the ridge. While a family is highlighted, an optimum/focused mark from another family can retain a bright ring/core even though its body is dimmed.
- **Fix:** Persist base opacity per trail/material, restore that exact value when `familyId` is null, and apply highlight opacity consistently across parent plus accent/core child materials.

### [MEDIUM] V13 — One Plotly chunk-load failure is cached for the whole session
- **File:** `src/viz/plotly-loader.ts:4-17`
- **Evidence:** `pending` is assigned the dynamic-import promise once and reset only never; a rejected Promise remains truthy, so every later `loadPlotly()` returns the same rejection.
- **Impact:** A transient offline fetch or stale-deploy 404 during lazy projection boot permanently disables every Plotly-backed projection/fallback operation for that page session. Sweep's fire-and-forget `.then()` calls then emit repeated unhandled rejections on later writes; recovery requires a full reload.
- **Fix:** Add a rejection handler that sets `pending = null` before rethrowing, and add rejection handling at fire-and-forget callsites so a failed/purged graph does not flood unhandled promises.

## No-findings note
Not applicable: the audit found 13 actionable defects. Three's ordinary remodel path does dispose point/trail/axis/ridge/membrane geometries and materials; its main RAF, ResizeObserver, window resize handler, controls, renderer and scene resources are disposed on normal `destroy()`. Sweep timing for reachable inputs is wall-clock based and correctly self-terminates; default empty/singleton domains are guarded.
