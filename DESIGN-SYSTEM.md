# Design System — LLM 3D Benchmark Viz (SPEED × COST × INTELLIGENCE)

**Status:** approved (direction confirmed; pixel-level sign-off deferred to first render via `tastecheck-pass`)
**Next move:** hand the build to **wayfinder** (chart v0→v1→v2 as decision tickets); v0 build starts with curated dataset + de-chromed Plotly stage + threshold-sweep.

## Design direction summary

> **North star (one line):** *Observatory-after-dark* — a precision instrument for the model universe where the Pareto frontier burns white-hot as a filament and everything off it dims by subtraction; **calm chrome, dramatic canvas**, spectacle fires only on user action.

- **Reference / anchor (studied, not copied):** *Severance* (Apple TV+) — severe typographic calm, tension via space/framing; *Control* (Remedy) — architectural darkness, disciplined light; *Westworld* title sequence / Sarofsky diagnostic-tablet UI — dark field, filament warm light, calm procedural geometry; **Bloomberg Terminal / Koyfin** — operational numerals, decisive hierarchy, minimal color; **Teenage Engineering OP-1 / TX-6** — instrument-as-object, one accent, mono numerals, zero decoration.
- **Aesthetic territory:** "Observatory-after-dark" / darkroom instrument — a calm dark chamber; the canvas is a night sky of models with one burning edge.
- **Personality:** instrument-grade calm (chrome) + cinematic-drama (canvas). Pole: **instrument, not dashboard; object, not website.** Restrained, expensive, precise, anti-festive.
- **Structure and rhythm:** asymmetric "stage + console"; canvas slow/heavy, console snappy/even. (See Structure block.)
- **Signature:** the **threshold-sweep** — on every re-weight, a staged filament ignition propagates from the frontier outward, synced to the 2D projections snapping into registration. Both the motion signature and the video hero shot.
- **Imagery and iconography:** no decorative imagery; one minimal 1px line-icon set for controls. No emoji. Provider differentiation = **point shape** (circle/triangle/square/diamond…) **plus** AA-style semantic channels below (shape remains useful when many labs share a color class).

## Canvas encoding channel matrix (curve-focus default · 2026-08-06)

Supersedes “never categorical color on canvas” and “copper never on canvas” for **data marks only**. Chrome copper (sliders/focus) is unchanged.

**Product default = curve-focus** (RALPLAN A2 / PRD #86). Openness-primary fill is regression-only (`?enc=openness`).

**One meaning per channel — no double-encoding.** Lab is color only; shape is never lab.

| Channel | Meaning | Default (curve-focus) |
|---------|---------|----------------------|
| **Position X / Y / Z** | Cost / intelligence / speed (remappable metrics) | **On** |
| **Fill color** | Lab **brand colors[0]** + family shade; **always full chroma** (no hover) | **On** — glanceable lab identity |
| **Outer ring** | Lab **brand colors[1]** | **On** always (≥3-color brand kit) |
| **Inner core** | Lab **brand colors[2]** | **On** always |
| **Trail** | Same family shade; effort-rank ordered; real points only | **On** |
| **Size** | Value-score for current weights (continuous) | **On** — bigger = better fit |
| **Size floor / gold** | Frontier size floor; optimum = gold + largest | **On** |
| **Shape geometry** | **Wire sphere** = closed weights · **Wire octa** = open weights | **On** |
| **Material** | **All wireframe** (no solid marks) | **On** |
| **Ridge polyline** | Pareto frontier | **On** |
| **Score heat (copper→filament)** | Diagnostic value-score on fill | **Off**; `?heat=1` only |

Glyph law (authoritative in `src/viz/mark-encoding.ts`):

| Openness | Glyph | Material |
|----------|-------|----------|
| Closed weights | sphere | wire |
| Open weights | octahedron | wire |

Reasoning / thinking is **not** a stage shape — nearly all new models reason; it stays in inspector, filters, and table only.

- Legend must match stage 1:1 (lab color, trails, size=score, glyph 2×2, frontier, optimum).
- **Legend HUD open by default** (compact); decoding must not require hover on marks.

### Glanceable lab color (S+ · 2026-08-06)
Lab brand **fill + ring + core** are always on for every visible mark (≥3 brand colors). Rank uses filament ridge, point size, and quiet trails — not muted brand fills. Catalog org labels must not steal product identity (e.g. **Qwen ≠ Alibaba orange** — resolve by model name).
- Family effort **trails** keep one family color along real points only (no invented vertices).
- Value-score weights remain independent of display-axis remapping.
- First paint: soft-fit multi-effort subset bounds; age ≤ 6 months remains density floor.

## Typography specimen (→ web-typography)
- **Display / labels:** refined grotesque — **Söhne / Neue Haas Grotesk** if licensed, else **Inter Tight** (NOT default Inter) / Geist. Tight tracking.
- **Numerals:** **tabular mono** — IBM Plex Mono or Geist Mono. Tabular figures mandatory so speed/cost/IQ align.
- **Axis labels:** mono **UPPERCASE**, ~11px, generous letterspacing (the "instrument not dashboard" swap — ~50% of the feel).
- **Contrast intent:** display down to ~300 (light) on dark; mono values 400–500. Restrained weight range.

## Color palette (→ color-system)
- **Dominant hue:** cool-**green** ink, field `#070C0B` (near-black, chlorophyll undertone) — chosen to kill the "Linear blue-ink" cliché. Panels step lighter: `#0B1110`, `#10161D`.
- **Accent:** **white-hot filament** `#E8F1E4` (warm-white) ~100% for the ridge; frontier points slightly lower luminance `#C9D4C4`. *(Documented warm alternative: Sol's mineral gold `#D6A84B` / hot core `#F4D58A` — swap only if a render shows white reads too clinical.)*
- **Dominated / off-frontier:** desaturated slate-cyan `#3D5560` at 40–60% opacity (**subtraction**, never added glow).
- **Chrome functional accent:** restrained copper `#C47A3A` — **only** active slider thumb + focus rings; never in the canvas.
- **Neutrals:** text `#E7E2D8` (warm off-white), muted `#89939E`. Warm-biased to balance the cool-green field.
- **Mode:** **dark-first.** Light mode is a later consideration; the concept is dark.
- **Contrast notes:** filament-on-ink exceeds WCAG AAA. Muted `#89939E` on `#070C0B` must be verified ≥4.5:1 (remediate if not). Off-frontier points are intentionally low-contrast (secondary by design); the selected/frontier state must stay unambiguous.

## Spacing scale and shape (→ spacing-system, components)
- **Density:** dual — canvas **sparse** (points breathe, lots of black); console **dense**, operational, tabular (Bloomberg/Koyfin).
- **Corner radius:** controls `4px` · cards/panels `8px` · pill `9999px` for tags/chips only. Small radii = instrument feel.
- **Elevation:** flat + hairline borders (`rgba(231,226,216,0.10)`); no heavy drop shadows. Canvas depth = luminance/size falloff + fog, not UI shadows.

## Motion (→ micro-motion)
- **Level:** restrained chrome + dramatic canvas — **two tempos, one accent, one field.**
- Chrome: `180–220ms`, `cubic-bezier(0.2, 0, 0, 1)`.
- Canvas camera: `~600ms` critically damped, `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Threshold-sweep:** `~400ms` staged ignition (filaments light with slight stagger; ridge breathes only while a slider is active, dead-calm when idle).
- **No ambient bobbing, no idle glow, no permanent pulse.** `prefers-reduced-motion`: collapse sweeps to instant highlight, kill camera drift.
- **DOF + slow orbit live ONLY in "cinema mode"** (auto-pilot, detunes when pointer enters the canvas); OFF in interaction mode.

## Structure & rhythm
- **Composition:** asymmetric — the 3D canvas is the dominant focal mass; chrome docks to a slim console column. Focal logic: canvas = subject, chrome = frame. No reflexive-centered hero.
- **Spatial motif:** "stage + console" — big dark stage flanked by an operational console; linked 2D projections sit as a row of small instrument readouts.
- **Rhythm:** syncopated across layers — canvas slow/heavy, console snappy/even-metronomic.
- **Density:** canvas sparse, console dense.
- **Structural signature:** the threshold-sweep (staged ignition on re-weight, synced to 2D snap-to-registration).
- **Section order (app layout):** [3D stage (hero)] + [console: value-score sliders | model readout] + [linked 2D projection row]. (NOT a SaaS hero→features→cards stack.)

## Language (→ i18n-ready)
- EN-first v0. Tokens/type must tolerate long model-name strings. i18n deferred.

## Refusals (what we will NOT do)
- No gradient / aurora / mesh-gradient backgrounds → solid ink field + subtle canvas fog only.
- No glassmorphism / blur blobs → flat panels + hairlines.
- No rainbow categoricals for providers → point **shape** + direct labels + near-neutral pearl.
- No default Plotly chrome (modebar, grid, ticks, hover card, camera) → strip all; build axes/legend/tooltip/controls in HTML; **Plotly = render engine only.**
- No fake volumetrics in Plotly v0 → v0 signature is typographic/informational + frontier animation; true atmosphere = R3F v1+.
- No emoji icons (including ⚡ and ★ on marks) → minimal 1px line-icon set / plain mono labels.
- No desaturating lab fill to encode rank (hierarchy = ridge + size + quiet trails).
- No particle systems / starfield / grid-floor-to-horizon / fog-bank / neon bloom (Three.js demo vocab is banned).
- No shaded Pareto **surface** → ridge line/fuse + subtraction.
- No ambient/idle glow or permanent camera drift → spectacle only on user action.
- No gold-on-dark as default → filament-white is primary (gold = documented warm alt).

## Token block
```css
:root {
  /* ---- PRIMITIVE (color-system generates full OKLCH ramps from these anchors) ---- */
  --ink-field: #070C0B;      /* cool-green near-black ground */
  --ink-panel-1: #0B1110;
  --ink-panel-2: #10161D;
  --filament: #E8F1E4;       /* warm-white hot core = primary accent */
  --filament-dim: #C9D4C4;   /* frontier-point luminance */
  --slate-cyan: #3D5560;     /* off-frontier (subtraction) */
  --copper: #C47A3A;         /* chrome focus/active ONLY */
  --text-warm: #E7E2D8;
  --text-muted: #89939E;

  /* TYPE (web-typography builds the --step-* fluid scale) */
  --font-display: "Inter Tight", "Söhne", "Neue Haas Grotesk", system-ui, sans-serif;
  --font-body: "Inter Tight", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", "Geist Mono", ui-monospace, monospace;

  /* SHAPE */
  --radius-control: 4px;
  --radius-card: 8px;
  --radius-pill: 9999px;     /* tags/chips ONLY — never text CTAs */

  /* ---- SEMANTIC (components reference roles only; theming remaps) ---- */
  --color-bg: var(--ink-field);
  --color-surface-1: var(--ink-panel-1);
  --color-surface-2: var(--ink-panel-2);
  --color-text: var(--text-warm);
  --color-text-muted: var(--text-muted);
  --color-border: rgba(231, 226, 216, 0.10);
  --color-primary: var(--filament);
  --color-primary-hover: #FFFFFF;
  --color-primary-ink: var(--ink-field);
  --color-accent: var(--filament);
  --color-accent-ink: var(--ink-field);
  --color-focus: var(--copper);

  /* VIZ-SPECIFIC (data-viz) */
  --viz-frontier: var(--filament);
  --viz-frontier-point: var(--filament-dim);
  --viz-dominated: var(--slate-cyan);   /* used at 40–60% opacity */
  /* provider differentiation = SHAPE, not a --series-* hue ramp */

  /* MOTION */
  --dur-fast: 180ms;   /* chrome */
  --dur-base: 220ms;   /* chrome */
  --dur-slow: 600ms;   /* canvas camera, critically damped */
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-cinema: cubic-bezier(0.16, 1, 0.3, 1);
  --sweep-dur: 400ms;  /* threshold-sweep */
}
```

## Component guidance notes
- **Plotly v0:** remove modebar, default grid, tick styling, hover card, camera behavior. Build legend, tooltip, axes treatment, controls in HTML. Treat Plotly as a rendering engine, not the visual system.
- **Points:** near-neutral pearl, differentiated by **shape** + direct labels. Filament reserved exclusively for the efficient frontier + the user's selected optimum.
- **Dominated region:** dim toward `--viz-dominated` (subtraction); never add glow to non-frontier points.
- **Cinema vs interaction mode:** DOF + slow orbit only in cinema mode; pointer-enter detunes to interaction mode (snappy camera, no DOF, depth via falloff + fog).
- **Accessibility:** full `prefers-reduced-motion` path; frontier/selected state must be distinguishable by shape/luminance, not color alone (color-blind safety).

## Open decisions

| Decision | Recommendation | Evidence | Owner / confirmation |
| --- | --- | --- | --- |
| Accent: filament-white vs mineral-gold | filament-white (gold = documented warm alt) | Kimi: gold-on-dark is the 2023–25 cliché; Sol defended gold as "mineral" | visual sign-off at first render (`tastecheck-pass` / user) |
| Field tint green vs blue | green `#070C0B` (anti-Linear) | Kimi | revisit at render if reads off |
| Type licensing (Söhne/Neue Haas paid) | fallback Inter Tight / Geist (free) | Sol | user budget at build |
| Plotly v0 scope | typographic-signature v0 (crisp projections + obsessive restyle + frontier anim; no fake volumetrics) | Kimi | confirm at v0 kickoff |

## Build order
design-system-interview (this, done) → color-system + web-typography + theming + spacing-system → responsive-layout → component-states + form-ux + empty-states → micro-motion + data-viz + art-direction → a11y-pass + cognitive-a11y. Audit with **deslop-ui** + humanize-copy **against this spec**; gate the ship with **tastecheck-pass**. The multi-phase build (v0→v1→v2→publish) is orchestrated by **wayfinder** (decision-ticket map).

## Amendment — semantic color on canvas (Simon 2026-08-03)

**Supersedes** the strict “provider differentiation = shape never color” / “copper never in the canvas” rules **for data marks on the stage and multi-charts**, following Artificial Analysis:

- **Fill color (primary):** open vs closed (license class).
- **Reasoning:** icon/glyph (AA lightbulb pattern), not a hue series.
- **Lab/provider:** may use stable identity colors when many labs are visible; family effort curves share one family color.
- **Not default:** continuous score heat as the only fill story.

Chrome copper for focus/sliders unchanged. Full decision: `docs/v1/wayfinder/decision-semantic-color-aa.md`.
