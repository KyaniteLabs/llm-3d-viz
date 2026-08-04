# RALPLAN — AA-density graph suite

**Status:** **superseded by consensus** — see `.omx/plans/prd-aa-density-suite.md` (A′, Architect+Critic APPROVE)  
**Mode:** wayfinder chart → ralplan consensus complete (no execution until explicit handoff)  
**Map:** [MAP: AA-density graph suite…](https://git.kyanitelabs.tech/simon/llm-3d-viz/issues/47)  
**User ask:** “I want all of them” (filters · multi-effort · semantic color · multi-chart · cost/task) · Three only · remappable axes

---

## Principles

1. **Three is the 3D hero** — Plotly 3D is out of product scope.
2. **AA density, not AA clone** — many graphs + filters; our differentiator remains hybrid 3D + linked views.
3. **Semantic encoding over decoration** — color must mean a user-legible class; DESIGN-SYSTEM may be amended deliberately.
4. **Visible-set math** — filters recompute frontier + score over the visible set (frontier-math already says so).
5. **No invented cost-per-task** — only real AA (or measured) token usage × prices.

## Decision drivers (top 3)

1. Simon can **control density** (filters + default subset).
2. **Effort intensity** is first-class data, not name parentheses.
3. **Semantic color + multi-chart** make tradeoffs legible without relying on one muddy 3D cloud.

## Viable options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| **A. Full suite in one execution train** | Filters + multi-effort data + semantic color + chart inventory + cost/task data path | Matches “all of them” | Large; needs map decisions first |
| **B. Filters + semantic color only first** | Fast density win | Leaves effort + multi-chart fog | Under-delivers vs stated want |
| **C. Data-first (effort + cost/task scrape) then UI** | Honest metrics | Slow UI relief | Stage stays crowded longer |

**Chosen for planning:** **A via wayfinder** — decide everything, then one execution PR train ordered by map dependencies. B/C rejected as incomplete against “all of them.”

## Architecture shape (post-decision, for implementers)

```
visibleSet = filters(models)
  → Three hero (cost?, intel, tps) + semantic colors
  → 3 projections (existing)
  → additional 2D charts from inventory
  → console filters + legend
  → URL state
```

Cost axis: **decide in #50** after #49 research (recommendation: $/M on 3D, $/task secondary when data lands).

## Deliberate risks (pre-mortem lite)

1. **Multi-effort explodes N** → default filter must hide non-selected tiers.  
2. **Semantic color fights DESIGN-SYSTEM** → explicit amendment ticket #53.  
3. **Cost-per-task unavailable in JSON** → chart stays “coming” not fake.

## Test / acceptance (execution later)

- Filter: ≤ default N or frontier-only mode makes stage scannable.  
- Effort: ≥1 family with ≥2 tiers in data, switchable in UI.  
- Color: legend maps 1:1 to on-stage meaning; no pure decorative ramp.  
- Charts: every must-ship chart from #54 has data or explicit empty state.  
- Safari: preview on :4200 still works.

## ADR (summary)

| Field | Content |
|-------|---------|
| **Decision** | Chart decisions for full AA-density suite on Three via wayfinder map #47; no Plotly 3D; no implementation until map decisions close + user approves execution |
| **Drivers** | Simon “all of them”; AA multi-graph product shape; semantic color demand |
| **Alternatives** | Ship filters only; stay monochrome; film Plotly (rejected) |
| **Why** | Scope is multi-decision; wayfinder prevents thrash-implement |
| **Consequences** | DESIGN-SYSTEM may change; dataset expands; UI densifies |
| **Follow-ups** | Close research #48/#49; grill #51/#53/#54; then prototype #55 |

## Approval

**Ralplan consensus APPROVED 2026-08-04** (Architect → Critic on revise-2).  
Durable gate: `.omx/state/ralplan-consensus-aa-density-suite.json`.  
**Do not implement until Simon picks an execution lane** (`$ultragoal` default, `$team`, or explicit `$ralph`).
