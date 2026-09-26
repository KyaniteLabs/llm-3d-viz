# Context: AA-density graph suite (ralplan)

**Timestamp:** 20260804T062624Z  
**Branch:** `spike/r3f-stage`  
**Map:** Forgejo #47 (AA-density suite)  
**Mode:** ralplan consensus only (no execution)

## Task statement

Close wayfinder and produce an execution-ready consensus plan for the full AA-density product suite on the **Three.js** hero: filters, multi-effort family curves, AA semantic color, remappable stage axes, cost/time-per-task charts, with honest data and visible-set math.

## Desired outcome

Simon can scan a density-controlled 3D model universe that matches AA’s multi-graph usefulness without cloning AA, without inventing metrics, and without permanently locking a single cost-axis definition.

## Known facts / evidence

### Wayfinder decisions locked (docs/v1/wayfinder/)

| Doc | Lock |
|-----|------|
| `decision-filters-and-effort-curves.md` | Age ≤6mo default; multi-select provider + family; **all effort tiers on same 3D graph**; family effort **polyline trails** (real points only) |
| `decision-semantic-color-aa.md` | Primary fill = openness (open vs closed); reasoning = icon/glyph; lab color for identity; no decorative copper heat as default; DESIGN-SYSTEM amendment required |
| `decision-chart-inventory-task-metrics.md` | Must-ship: **cost per Index task** ranking + **time per Index task** chart; empty/skeleton OK until real data |
| `research-aa-cost-per-task.md` | $/task and time/task **not in v0**; do not invent from $/M; AA defines metrics publicly |
| `research-aa-multi-effort.md` | v0 collapsed to max/high only (0 multi-effort families); need schema `family_id` + `effort_tier` + dataset expansion |
| `RALPLAN-aa-density-suite.md` | Draft pending approval; chose option A via wayfinder |

### User supersession (session)

- **Axes changeable** so product does **not** permanently choose cost definition (#50). Remappable X/Y/Z metrics close #50 without locking $/M vs $/task forever.
- Prior turn started unsolicited axis-mapping code on the branch; treat as **spike WIP**, not as consensus-approved delivery. Ralplan owns the plan; execution lane owns whether to keep/rewrite that WIP.

### Codebase snapshot

- Hero: `src/viz/stage3d-three.ts` (Three default); Plotly stage fallback only.
- Value score / frontier: `src/lib/score.ts`, `src/lib/pareto.ts` — classic tps × blended$/M × Index; `visibleSet` already in score API.
- Models: `data/models.v0.draft.json` — **35 rows**, 17 providers, 33 with tps; fields include `openness`, `release_date`, `reasoning?`, prices, Index; **no** `family_id`, `effort_tier`, cost/time per task.
- Palette: `src/viz/palette.ts` — semanticPointFill still heat-oriented for class/score.
- Console: `src/ui/console.ts` — weights + table; filters/axes not yet product-complete under wayfinder locks.
- Preview: `npm run preview` → :4200 Safari-safe.

### Constraints

- Three only for 3D hero; Plotly 3D out of product scope.
- No invented cost/time per task.
- Visible-set recompute of frontier + value score (frontier-math).
- DESIGN-SYSTEM is authority but **must be amended** for AA categorical color.
- Publish gated on Simon visual go (HANDOFF).

## Unknowns / open questions (for plan, not blockers)

1. Exact `family_id` derivation rules (string normalize vs AA slug).
2. Live AA payload confirmation for cost/time-per-task field names (research residual).
3. Full multi-chart layout chrome (#55) — inventory metrics locked; layout prototype still open.
4. Whether WIP axis-remapping on branch is kept as base or reimplemented under execution.

## Likely touchpoints

- `data/models.v0.draft.json`, `src/data/models.ts`
- `src/lib/score.ts`, `src/lib/pareto.ts`, new `src/lib/filters.ts` / `axis-metrics.ts`
- `src/viz/stage3d-three.ts`, `palette.ts`, `projections.ts`
- `src/ui/console.ts`, `index.html`, `src/styles/tokens.css`
- `DESIGN-SYSTEM.md`, `SPEC.md`, wayfinder closeout + issue comments
- Tests under `tests/`

## Planning rule

Ralplan writes only planning artifacts under `.omx/` (+ may update wayfinder decision that #50 is closed by remappable axes as a **decision doc**, not product code). No feature implementation in this mode.
