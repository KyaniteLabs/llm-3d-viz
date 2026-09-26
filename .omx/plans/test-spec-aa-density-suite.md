# Test specification — AA-density graph suite

**PRD:** `.omx/plans/prd-aa-density-suite.md`  
**Context:** `.omx/context/aa-density-suite-20260804T062624Z.md`

## Unit (vitest)

| ID | Case | Pass condition |
|----|------|----------------|
| U1 | `applyFilters` age ≤6mo | Fixture with old/new `release_date` → only new remains when default age on |
| U2 | Provider multi-select | Union semantics; **empty selection ≡ all only** (never zero rows from empty multi-select) |
| U3 | Family multi-select | Same as U2 for `family_id` |
| U4 | Score visible set | Filtered set changes normalized extrema / optimum vs full set |
| U5 | `hasMappedAxes` + `modelToSceneCoords` | Default mapping places scorable models in [-1,1]³ |
| U6 | Axis swap domain | Input $/M domain uses `price_in_per_M` values |
| U7 | Openness fill | `semanticOpennessFill('open') !== semanticOpennessFill('closed')` |
| U8 | Family trail order | Effort ranks sort low→high (or documented order) without fabricating points |
| U9 | Task chart values | Null fields → empty path; non-null → sorted rank; no $/M derivation helper for task cost |
| U10 | Default encoding | Product default heat off / openness primary: open fill ≠ closed fill without `?heat=1` |
| U11 | Empty multi-select | Empty providers[] and families[] ≡ all (not zero rows) |
| U12 | sameFilters | Equal filter objects do not bump datarevision; deep field change does |

## Integration

| ID | Case | Pass condition |
|----|------|----------------|
| I0 | Filter-only re-render | Change filters with weights+axes fixed → stage pointCount changes (main subscribe) |
| I1 | Console filter change | Store update → fewer points when age filter on |
| I2 | Axis select change | Axis title matches selected metric title |
| I3 | Legend | Open/Closed + reasoning + lab swatch when multi-lab visible |
| I4 | Cross-surface optimum | Console optimum id === stage optimum id under same filters+weights |
| I5 | Projections fan-out | Projection traces only include models from current visibleSet |
| I6 | Sweep / filter appearance | Filter-only change (weights fixed): stage + projection optimum id and score ordering match console under **same visibleSet**; after a store tick, appearance arrays are not restored from pre-filter full-catalog length/extrema |

## E2E / manual (preview :4200)

| ID | Case | Pass condition |
|----|------|----------------|
| E1 | First paint Three | Canvas non-blank; axes titles present |
| E2 | Age default | Cloud denser with age filter off than on (visual or count via `__viz.pointCount`) |
| E3 | Safari | Load on WebKit via :4200 without blank stage |
| E4 | Task chart empty | With current v0 data, task charts show explicit empty/skeleton, not fabricated bars |

## Observability

| ID | Signal |
|----|--------|
| O1 | `window.__viz.axisMapping` / pointCount in DEV for agent QA |
| O2 | `data-stage-backend=three` on default load |

## Playwright / render suite (Phase 2)

- Migrate `tests/render.spec.ts` FIX-B heat-on-default / `?heat=0` opt-out cases to **heat-off default** / **`?heat=1` opt-in**.
- Phase 2 complete only if `npm run test:render` green **or** a tracked deferral ticket is filed (do not silently skip).

## Explicit non-tests (this train)

- Pixel-perfect AA brand color match (lab palette may approximate).  
- Full multi-effort scrape completeness (blocked on network).  
- Plotly 3D parity.
