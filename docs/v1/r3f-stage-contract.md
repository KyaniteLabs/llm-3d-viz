# R3F stage contract — critical path (v1 hero)

**Status:** locked direction (Simon 2026-08-03)  
**Authority:** SPEC D7, DESIGN-SYSTEM (Plotly v0; true atmosphere = R3F v1+)  
**Scope:** replace the **3D hero only**. Do not rewrite console, scoring, Pareto math, models, or 2D projections in the same PR train.

---

## Why

Plotly gl3d was the **v0 prototype** so a shareable instrument could ship in days. It is **not** the end-state renderer:

- ~5 MB JS, opaque gl3d axis/camera behavior (cream planes, reversed-looking floor ticks, no data→pixel API)
- Diminishing returns on further Plotly polish
- Showcase / cinema quality needs a real WebGL scene we control

**Frozen after #42:** no new Plotly stage “depth / chrome / volume” work unless it is a P0 crash or publish blocker.

---

## Keep (do not rewrite)

| Surface | Path / notes |
|---------|----------------|
| Models + schema | `src/data/models.ts` |
| Frontier + ridge order | `src/lib/pareto.ts` |
| Value score / weights | `src/lib/score.ts` |
| App store | `src/state.ts` |
| Instrument console | `src/ui/console.ts` |
| Stage KEY rail | `src/ui/stage-guide.ts` (HTML labels stay until projection API exists) |
| Heat / palette | `src/viz/palette.ts` |
| 2D projections | `src/viz/projections.ts` (Plotly SVG OK at n≈35) |
| Axis lock | **x = cost, y = intelligence, z = speed** (Simon 2026-08-02) |
| Cost/speed log; intel linear 0–100 | frontier-math §3.3 |

---

## Replace

| Surface | Today | Target |
|---------|--------|--------|
| 3D stage | `src/viz/stage3d.ts` (Plotly scatter3d) | R3F / Three.js scene behind a **stable Stage API** |
| Cinema orbit | `stage.orbitTo` + Plotly camera relayout | Same API; implement with controlled camera |
| Threshold sweep on stage markers | `SweepScheduler` → `Plotly.restyle` on `stage.gd` | Restyle-free: stage accepts appearance write via Stage API |
| Stage hover | Plotly `plotly_hover` on `gd` | Stage emits model-id hover events (DOM CustomEvent or callback) |

**Do not** port 2D projections to R3F in the spike. **Do not** add Three.js demo slop (particles, starfields, fog banks, neon bloom) — DESIGN-SYSTEM ban.

---

## Stage API (drop-in shape)

Implement so `main.ts` / `cinema.ts` / sweep can migrate with a thin adapter.

```ts
// Target contract (names may match existing Stage3D where possible)
interface StageCamera {
  eye: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
}

interface Stage3DSurface {
  /** Mount root — canvas or container; not a Plotly graph div long-term */
  readonly el: HTMLElement;
  render(weights: ScoreWeights, models: Model[]): void;
  setCamera(camera: Partial<StageCamera> | StageCamera): void;
  orbitTo(angleRad: number): void;
  /** model id under pointer, or null */
  onHover?(modelId: string | null): void;
  /** pin toggle / click — model id */
  onSelect?(modelId: string | null): void;
  /** marker appearance for threshold-sweep (per scorable index or by model id) */
  setPointAppearance?(colors: string[], sizes: number[]): void;
  destroy?(): void;
}
```

### Behavioral invariants (must pass)

1. **Axes:** cost log, intelligence linear `[0,100]`, speed log; labels read **high values up/away**, not reversed on first paint.
2. **Points:** scorable only; provider glyphs (or equivalent distinct shapes); frontier ridge polyline; optimum larger / filament.
3. **Heat:** class-bounded luminance when heat encoding on (`?heat=0` off) — same palette rules as today.
4. **Camera:** default hero in the −cost / −intelligence octant (or equivalent that keeps high intel higher on screen); clamp so camera never flips under the stage plane.
5. **Cinema:** slow orbit only when cinema mode on; reduced-motion kills orbit; pointerenter stage may exit cinema (current behavior).
6. **Identity:** hover/select key by **model id**, never by screen position alone.
7. **Tokens:** filament / ink-field / mono from CSS variables (DESIGN-SYSTEM).

### Explicit non-goals (spike)

- Shareable URLs, backend, workload recommender  
- Full React app rewrite  
- Plotly removal from 2D  
- Volumetric fog / DOF “fake film” stack (cinema may add restrained motion only)

---

## Spike plan (1–3 days)

**Branch:** `spike/r3f-stage` (throwaway OK if kill criteria met)

| Day | Deliverable |
|-----|-------------|
| 0 | Scaffold R3F/Three in container under `.stage-plot`; side-by-side or flag `?stage=r3f` |
| 1 | Scatter + ridge + log/linear scales + default camera; screenshot parity vs Plotly hero |
| 2 | Orbit + cinema hook; hover by model id into console |
| 3 | Appearance writes for sweep **or** document adapter gap; kill/go decision |

**Kill criteria:** if after ~3 focused days axes still lie, pick is unreliable, or look is not clearly better than de-chromed Plotly → stop, write findings, keep Plotly frozen.

**Go criteria:** first paint axes honest; ridge + heat readable; cinema smooth; console still works; no 5MB Plotly tax on the hero path (2D may still load Plotly).

---

## Integration seams (known pain)

| Consumer | Today’s coupling | Migration note |
|----------|------------------|----------------|
| `main.ts` | `stage.gd` + Plotly `.on('plotly_hover')` | Switch to Stage hover callbacks / CustomEvents |
| `SweepScheduler` | `Plotly.restyle(stage.gd, …)` | Prefer `setPointAppearance`; keep Plotly path until flag flips |
| `Projections` | `stage.gd` for cross-hover | Keep coupling by **model id** only |
| `CinemaMode` | `orbitTo` + `pointerenter` on `gd` | Use `el` instead of `gd` |
| Playwright / `__viz` | Plotly internals in DEV | Expose stable test hooks on Stage, not Plotly |

---

## Acceptance (before calling R3F “the stage”)

- [ ] Visual: desktop 1440 + mobile 390 screenshots — no cream plane, axes not reversed  
- [ ] 45 vitest still green; stage-specific playwright updated for non-Plotly pick  
- [ ] `?stage=plotly` fallback optional for one release, then delete  
- [ ] HANDOFF + SPEC note: D7 advanced to “R3F stage in progress / landed”  
- [ ] Independent review ≠ implementer  

---

## Critical path (repo-level)

1. ~~Merge #42 (cream plane + camera orientation)~~ **done**  
2. **Freeze** Plotly stage polish  
3. **This contract** + spike branch  
4. Spike go/kill  
5. If go: production R3F stage PR train  
6. Then v1 product (URLs, recommender) and high-quality video — not before  

Publish remains **Simon-gated** and is optional as “honest v0 / concept” until R3F lands if showcase quality is the bar.
