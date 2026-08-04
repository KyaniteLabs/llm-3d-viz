# PRD — AA-density graph suite (execution train)

**Status:** **CONSENSUS APPROVED** (Architect APPROVE + Critic APPROVE on revise-2)  
**Gate date:** 2026-08-04  
**Execution:** not started — wait for explicit `$ultragoal` / `$team` / `$ralph` handoff  
**Slug:** `aa-density-suite`  
**Context:** `.omx/context/aa-density-suite-20260804T062624Z.md`  
**Wayfinder map:** #47  
**Mode:** short RALPLAN-DR (product density, not auth/migration high-risk)  
**Architect:** ITERATE → amendments below as **A′** (Option A scope + hard multi-surface consistency)

---

## RALPLAN-DR summary

### Principles (5)

1. **Three is the only 3D hero** — Plotly gl3d is not product scope (`docs/v1/r3f-stage-contract.md`, HANDOFF).
2. **AA density without AA clone** — filters, multi-effort, multi-chart, semantic color; differentiator remains hybrid 3D + linked views + value score.
3. **Honest metrics only** — no inventing cost/time per Index task from $/M; skeleton UI until scrape lands real fields (`research-aa-cost-per-task.md`).
4. **Visible-set math** — filters recompute frontier + value-score normalization over the visible set (`src/lib/score.ts` already accepts `visibleSet`).
5. **Axes remappable, not permanently chosen** — Simon supersedes locking #50 to a single cost definition; default mapping stays product cost×intel×speed.

### Decision drivers (top 3)

1. **Density control** — default age ≤6 months so the cloud is scannable.
2. **Effort as structure** — all tiers plottabile; family trails make intensity a path.
3. **Legible encoding** — AA-style color + must-ship task charts so tradeoffs do not depend on one muddy 3D view.

### Viable options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| **A. Full suite, data-gated UI** | Ship filters + color + remappable axes + chart shells; multi-effort + task metrics behind schema/scrape gates with empty states | Matches “all of them”; no fake data | Multi-PR; density incomplete until data expands |
| **B. Filters + color only** | Fast visual win | Under-delivers vs locked decisions #52/#54 | Rejected against “all of them” |
| **C. Data scrape first, UI later** | Honest metrics early | Stage stays unusable longer | Rejected against density urgency |

**Chosen:** **A′** — Option **A** scope and phase order, with Architect synthesis:
- Phase 1–2 ship a **hard minimum shared contract** across Three, projections, console table, sweep, stage-guide: same `visibleSet` + same score/frontier extrema + same openness/reasoning encoding.
- Soft lag only for: remapping **2D projection axis pairs**, real multi-effort scrape rows, real cost/time-per-task scrape.
- B/C invalidated by locked wayfinder decisions + user “all of them.”

**#50 resolution (axes):** Close as **user-selectable metrics on X/Y/Z** (default: blended $/M, Index, tps). Cost-per-task and time-per-task are **also** chart metrics and optional axis candidates once fields exist — not a forced permanent 3D cost choice.

**Multi-effort density (research supersession):** `research-aa-multi-effort.md` “default max/high only” is **superseded** by `decision-filters-and-effort-curves.md`: all tiers plottable on the same graph; density control is **age + provider + family** filters. An effort-tier multiselect is **out of this train** unless Simon reopens it.

---

## Requirements summary

### Locked product requirements (from wayfinder)

| ID | Requirement | Source |
|----|-------------|--------|
| R1 | Default visible set: `release_date` within **6 months** of reference date | filters decision |
| R2 | Multi-select **provider** and **family** filters | filters decision |
| R3 | All available effort tiers plottable on the **same** Three graph | effort decision |
| R4 | Family effort **trails** (chords between real effort rows only, ordered by effort rank) | effort decision |
| R5 | Semantic fill = **openness**; reasoning = **glyph/icon**; lab/provider color for identity; family trail one color | color decision |
| R6 | Must-ship charts: **cost per Index task** ranking + **time per Index task** | chart inventory |
| R7 | Empty/skeleton charts until real fields; never invent | research + inventory |
| R8 | Value score + frontier recompute on **visible set** | frontier-math + filters |
| R9 | Remappable stage axes (X/Y/Z metrics); default cost×intel×speed | Simon session supersession of #50 |
| R10 | Three hero only; Safari preview path :4200 remains viable | HANDOFF |

### Data / schema requirements

| ID | Requirement |
|----|-------------|
| D1 | Add `family_id` + `effort_tier` (enum) to model schema; derive for existing rows |
| D2 | Expand dataset with multi-effort AA rows when scrape available (may ship UI against derived single-tier first with trails no-op) |
| D3 | Optional fields: `cost_per_index_task_usd`, `time_per_index_task_s` (names flexible) when scraped |
| D4 | Keep existing scorable contract for value score (tps, blended$/M, Index) unless axes remapping explicitly changes plot completeness separately |

### Non-goals (this train)

- Replacing 2D Plotly projections with Three/Canvas in the same train (contract).
- Full AA site clone (every chart type).
- Publish/deploy without Simon visual go.
- Inventing intermediate effort points or fake $/task.

### Out-of-order WIP note

Branch may contain partial axis-remapping code from a prior session turn. **Execution** must either adopt it under this PRD’s acceptance tests or rewrite; planning does not treat it as done.

---

## Architecture shape

### Dataflow (mandatory — Architect P0)

```
AppState
  weights
  axisMapping
  filters { ageEnabled: boolean, ageMonths: 6, providers: string[], families: string[] }
  referenceDate policy: injectable clock; product default = wall date at session;
                        tests always inject fixed ISO date
       │
       ▼
applyFilters(models, filters, referenceDate): Model[]   // pure, src/lib/filters.ts
  rules:
    - ageEnabled default true → keep release_date ≥ referenceDate − 6 months
    - providers empty → all providers; non-empty → union
    - families empty → all families; non-empty → union
       │
       ▼
visibleSet
       │
       ├── scorableVisible = visibleSet.filter(isScorable)
       │     normalizedScores(scorableVisible, weights, scorableVisible)  // extrema = visible
       │     frontier(scorableVisible) / ridgeOrder
       ├── plottableVisible = visibleSet.filter(m => hasMappedAxes(m, axisMapping))
       │     Three positions/domains from plottableVisible only
       ├── projections + sweep + stage-guide + console table/optimum
       │     MUST consume same visibleSet / scorableVisible (not full catalog)
       └── task charts: visibleSet with non-null task fields; else empty state
```

**Dual contract (explicit):**
| Concern | Predicate |
|---------|-----------|
| Stage points | `plottableVisible` |
| Value score, optimum, frontier, ridge | `scorableVisible` (classic tps + blended$/M + Index) |
| Task charts | `visibleSet` ∩ non-null task metric |
| Family trails | family groups in `plottableVisible` with ≥2 real points; no invented vertices |

**Fan-out (must update all):** `src/main.ts` (subscribe gate), `src/viz/stage3d-three.ts`, `src/viz/projections.ts`, `src/viz/sweep.ts`, `src/ui/console.ts`, `src/ui/stage-guide.ts`.

**Consumer seam (pick one; document in code) — Critic P0:**
- **Preferred:** pure `selectVisibleModels(models, filters, referenceDate)` owned by main; `renderVisuals` passes `visibleSet` into `stage.render` / `projections.render`; **Console, StageGuide, and Sweep expose `setModels(visibleSet)`** (or equivalent) so constructor-pinned catalogs are replaced and store self-subscribers never score the full catalog after filters ship.
- **Alternative:** each consumer applies the same pure `applyFilters` from `state.filters` + **shared session `referenceDate`** (one clock; no divergent midnight drift).  
Do not leave consumers with only a one-shot constructor `models` array.

**Re-render gate (main.ts):** today only weights + axisMapping trigger paint. Phase 1 **must** also re-render on `filters` (and any future non-axis state that changes visible set). Add `sameFilters` deep equality in `src/state.ts` (export from `filters.ts` or colocate; one definition).

**Sweep gate (mandatory — same class of bug as main.ts) — Critic P0:**  
`SweepScheduler` currently restarts only on weight changes; other store ticks `reassertAppearance()` using the last full-catalog appearance and can **clobber** Three `__setPointAppearance` + Plotly projections after a filter-only paint. Phase 1 must:
1. Keep Sweep’s model universe === current `visibleSet` (update on every filter change via `setModels` or re-filter).
2. Treat `filters` (or visibleSet identity) as appearance-invalidating — recompute `markerStates` from **visibleSet** extrema/frontier/optimum; do not reassert stale full-catalog colors after filter-only updates.
3. Score/frontier inside Sweep use the same visibleSet as stage/console.

**Soft lag (allowed):** projections keep classic 2D metric *pairs* until a later train; they still filter + color consistently.

### Encoding channel matrix (Phase 0 DESIGN-SYSTEM amendment — Architect P0)

| Channel | Meaning | Default |
|---------|---------|---------|
| **Fill** | Openness (open vs closed [+ restricted later]) | **On** — primary story |
| **Glyph / icon** | `reasoning === true` | On |
| **Size / ridge / ★** | Frontier / optimum | On |
| **Lab/provider color** | Identity (outline, legend, family trail stroke) | On when multi-lab |
| **Score heat (copper→filament)** | Optional diagnostic | **Off by default**; opt-in `?heat=1` only |

`src/main.ts` currently defaults `heatEncoding = searchParams.get("heat") !== "0"` (heat on). Phase 2 inverts: heat only when `?heat=1`. Stage-guide copy must match.

### Key modules (planned)

| Module | Responsibility |
|--------|----------------|
| `src/lib/filters.ts` (new) | Age/provider/family pure filters; **`sameFilters` exported here** (state imports it) |
| `src/lib/axis-metrics.ts` | Metric registry + domain + scene mapping (**adopt WIP**, gate tests) |
| `src/lib/family.ts` (new) | family_id derivation, effort rank order |
| `src/data/models.ts` | Schema types + validation for new fields |
| `src/main.ts` | Subscribe gate: weights ∪ axes ∪ filters → renderVisuals(visibleSet) |
| `src/state.ts` | `filters` + equality; keep `axisMapping` |
| `src/viz/stage3d-three.ts` | Positions, trails, AA color, remapped labels; score on scorableVisible |
| `src/viz/projections.ts` / `sweep.ts` | Same visibleSet + AA color policy |
| `src/viz/palette.ts` | Open/closed fills; lab colors; heat opt-in only |
| `src/ui/console.ts` | Filter + axis UI + legend + task chart hosts |
| `src/ui/stage-guide.ts` | Legend/copy aligned with encoding matrix |
| `DESIGN-SYSTEM.md` | Amendment: channel matrix above |

### Dependency order (implementation phases)

1. **Phase 0 docs** — axes decision, DESIGN-SYSTEM channel matrix, multi-effort research supersession, tracker comments  
2. **Phase 1 filters + visible-set plumbing for ALL consumers** (density fix; main/store seams)  
3. **Phase 2 AA color default + legend** (heat opt-in)  
4. **Phase 3 adopt axis WIP under tests** (closes #50)  
5. **Phase 4 multi-effort schema + trails** (scrape can lag; trails no-op until N≥2)  
6. **Phase 5 task chart shells** (skeleton until scrape)  
7. **Phase 6 data scrape** multi-effort + cost/time per task when AA reachable  
8. **Polish:** URL state optional (#56), layout prototype (#55) if still open

---

## Acceptance criteria (testable)

1. **Default age filter:** With **injected** referenceDate, models with `release_date` older than 6 months are excluded from stage points **and** value-score / frontier / table visible set.
2. **Provider filter:** Selecting a single provider shows only that provider; multi-select unions; **empty selection = all**.
3. **Family filter:** Same as provider for `family_id`; empty = all.
4. **Visible-set score:** Changing filters changes optimum and/or ordering vs full catalog (fixture unit test).
5. **Cross-surface consistency:** Under the same filters, console optimum model id === stage optimum model id; projections point count ≤ filtered scorable/plottable set (I4).
6. **Filter re-render:** Changing filters alone (weights/axes unchanged) changes stage point count (I0 / main subscribe).
7. **Axis remap:** Changing X from blended $/M to input $/M moves ≥1 point scene X and updates axis title (adopt WIP).
8. **AA color default:** With default flags (no `?heat=1`), dominated open vs closed fills differ; not pure score heat.
9. **Reasoning mark:** `reasoning: true` → distinct glyph/icon; legend lists it.
10. **Family trail:** Two fixture rows same family different effort → one polyline, real vertices only.
11. **Task charts:** Real rank or explicit empty state; never derive task cost from $/M alone.
12. **Three default:** no `?stage` → Three; vitest + build green; :4200 preview path.

---

## Implementation steps (right-sized)

### Phase 0 — Decision closeout (docs only)

1. Write `docs/v1/wayfinder/decision-axes-remappable.md` (#50 remappable metrics).  
2. Amend `DESIGN-SYSTEM.md` with **encoding channel matrix** (fill/glyph/size/lab/heat-opt-in).  
3. Note multi-effort research supersession in wayfinder (age+provider+family density).  
4. Map #47 + close/comment #50–#54 per `docs/agents/issue-tracker.md`.

### Phase 1 — Filters + visible-set plumbing (all consumers)

5. `AppState.filters` + `sameFilters` in `state.ts`; pure `applyFilters(models, filters, referenceDate)` in `src/lib/filters.ts`.  
6. Provisional `family_id` derivation in `src/lib/family.ts` (pure + unit tested).  
7. **Fix `main.ts` subscribe** to re-render on filters; compute `visibleSet` once per paint.  
8. Wire **setModels(visibleSet)** (or applyFilters-from-state) on Console, StageGuide, Sweep; stage + projections receive visibleSet each render.  
9. **Sweep filter invalidation** per Sweep gate above (no full-catalog reassert clobber).  
10. Score/frontier call sites: `normalizedScores(visible, w, visible)` / `frontier(visible)` only.  
11. Console UI: age toggle (default on), provider multi-select, family multi-select (empty = all).  
12. If filters drop hovered/pinned model: clear pin/hover to null. Empty visible set: explicit console note + empty stage (no crash).  
13. Tests: U1–U4, U11–U12, I0, I4, I6.

### Phase 2 — AA semantic color (default on)

14. Implement openness fill + reasoning glyph + lab trail/outline helpers in `palette.ts`. Document Three materials: fill=openness; lab as outline/emissive/trail stroke — not a second competing fill.  
15. Invert heat default (`?heat=1` opt-in); update stage-guide.  
16. Apply encoding on Three, projections, **sweep**, and table/legend 1:1.  
17. **Migrate Playwright FIX-B** in `tests/render.spec.ts`: product default heat **off**; opt-in `?heat=1` (replace `?heat=0` opt-out cases). Phase 2 done only when `npm test` **and** `npm run test:render` are green, **or** a tracked ticket explicitly defers the render suite (no silent ignore).  
18. Unit tests U7, U10.

### Phase 3 — Adopt axis WIP (not greenfield rewrite)

19. Keep existing `axis-metrics.ts` / console selects / `axisMapping` if present; run U5/U6/I2.  
20. Domains from **plottableVisible** only; fix gaps only (stubs, missing fans).  
21. Document dual contract in code comment near stage render.

### Phase 4 — Multi-effort trails

22. Schema: `family_id`, `effort_tier` + validation when present.  
23. Three trails for families with ≥2 plottableVisible points.  
24. Dataset scrape ticket separate; no invented rows.

### Phase 5 — Task charts

25. Optional schema fields for cost/time per Index task.  
26. Rank/list UI over visible set; empty state if null.  
27. Forbid $/M→task derivation helper (U9).

### Phase 6 — Scrape (when AA reachable)

28. Multi-effort row expansion + task metric field dump per research notes.

### Phase 7 — Integration verify

29. `npm test`, `npx tsc --noEmit`, `npm run build`, Safari :4200; run `npm run test:render` if Phase 2 not deferred.  
30. HANDOFF; no publish without Simon visual go.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Multi-effort row explosion re-crowds stage | Default age ≤6mo; provider/family filters; trails read as paths not N³ points |
| AA scrape unavailable | Ship skeleton charts + single-tier data; do not invent |
| Color fights DESIGN-SYSTEM monochrome | Explicit amendment before paint |
| Axis remap breaks frontier meaning | Keep value-score axes classic; display axes independent; document in UI |
| WIP axis code diverges from plan | Phase 3 acceptance tests gate keep vs rewrite |
| Scope thrash into layout chrome #55 | Inventory metrics required; layout polish secondary |
| Sweep reassert clobbers filter-correct stage colors | Phase 1 Sweep gate + visibleSet-backed markerStates; I6 test |
| Playwright still asserts heat-on default | Phase 2 migrates FIX-B or tracked deferral ticket |
| Constructor-pinned full catalog on console/guide/sweep | `setModels(visibleSet)` or applyFilters-from-state seam |

---

## Verification steps

```bash
npm test
npx tsc --noEmit
npm run build
npm run test:render   # required after Phase 2 unless deferred ticket exists
npm run preview       # http://127.0.0.1:4200/
```

Manual: default age filter reduces cloud; toggle provider; swap X metric; check open vs closed color; legend match; empty task charts if no data; filter then wait for sweep tick without color flash-back to full catalog.

---

## ADR

| Field | Content |
|-------|---------|
| **Decision** | Execute **A′**: full suite phased train on Three with hard multi-surface visible-set + AA encoding contract; #50 closed by remappable axes; multi-effort research max/high default superseded by age/provider/family density filters. |
| **Drivers** | Density control; effort curves; legible AA color; honest task metrics; linked-view integrity; Simon “all of them” + “axes changeable.” |
| **Alternatives considered** | Filters-only (B); data-first UI-later (C); permanent 3D $/task; heat-as-primary; A without projection/table fan-out. |
| **Why chosen** | Matches wayfinder locks; Architect synthesis prevents linked-view lies; remappable axes resolve cost thrash without fake $/task. |
| **Consequences** | DESIGN-SYSTEM channel matrix; main/store re-render seams; schema growth; scrape-gated hollowness for trails/charts; projections axis pairs may lag. |
| **Follow-ups** | Live AA field dump; multi-effort scrape; optional URL state #56; layout #55; Simon visual go before publish. |

---

## Available-agent-types roster (execution handoff)

From active agent catalog (representative): `executor`, `explore`, `architect`, `critic`, `test-engineer`, `code-reviewer`, `debugger`, `verifier`, `writer`, `security-reviewer`, `designer`.

## Follow-up staffing guidance

| Lane | Role | Why | Reasoning |
|------|------|-----|-----------|
| L1 Schema/filters | executor | Pure data + filters | standard |
| L2 Color + DESIGN-SYSTEM | executor + designer consult | Visual encoding | standard / hard for visual go |
| L3 Axes | executor | Stage math | standard |
| L4 Trails + dataset | executor | Geometry + scrape later | standard |
| L5 Task charts | executor | UI shells | trivial–standard |
| Review | code-reviewer / critic | Independent of implementer | hard |
| Verify | test-engineer + verifier | Acceptance map | standard |

**Suggested default follow-up:** `$ultragoal` sequential phases 0–6 with checkpoint evidence per phase.  
**Parallel:** `$team` for L1∥L2 after phase 0 docs, then serial L3–L6.  
**Ralph:** only if user explicitly wants single-owner persist loop on a stuck phase.

### Goal-mode follow-up suggestions

- **`$ultragoal` (default)** — durable sequential delivery of phases with ledger.  
- **`$team`** — parallelize filters/color after docs gate.  
- **`$autoresearch-goal`** — only for residual live AA scrape research if fields still unknown.  
- **`$performance-goal`** — not primary (not a perf project).  
- **`$ralph`** — explicit fallback only.

### Team launch hints (when user chooses team)

```text
$team implement .omx/plans/prd-aa-density-suite.md phases 1-2 in parallel after phase 0 docs
# verification path: vitest filters+palette green; manual stage screenshot open vs closed
```

**Team verification path:** Team returns green vitest + build + short evidence notes per lane; Ultragoal checkpoints phase complete only when acceptance criteria for that phase are evidenced.

---

## Changelog

### Planner draft-0
- Superseded draft `docs/v1/wayfinder/RALPLAN-aa-density-suite.md`.  
- Locked #50 via remappable axes (Simon).  
- Folded decision + research docs.  

### Revise-1 (Architect ITERATE)
- Named **A′**: hard visibleSet fan-out + dual isScorable/hasMappedAxes contract.  
- Phase 1 requires `main.ts` subscribe + all consumers (projections/sweep/console/guide).  
- Encoding channel matrix; heat **opt-in** `?heat=1`.  
- Supersede multi-effort research default explicitly.  
- Phase 3 = adopt axis WIP under tests, not rewrite.  
- Expanded AC (I0/I4, empty multi-select = all, injectable referenceDate).  
- `sameFilters` store equality requirement.

### Revise-2 (Critic ITERATE)
- **Sweep gate** + visibleSet-backed markerStates; no filter-only clobber.  
- **Consumer seam:** preferred `setModels(visibleSet)` on console/guide/sweep.  
- Phase 2 includes sweep encoding + **Playwright FIX-B heat migration** / hard or tracked deferral.  
- Pin/hover clear when filtered out; empty visible-set UX.  
- `sameFilters` export site = filters.ts.  
- Risks + I6 for sweep/appearance consistency.
