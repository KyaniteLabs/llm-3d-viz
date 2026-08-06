# PRD — Production decide mode (intelligence floor + cost×speed)

**Status:** **CONSENSUS APPROVED** (Architect B′ + Critic APPROVE on revise-3) — **pending Simon execution approval**  
**Gate date:** 2026-08-05  
**Execution:** not started  
**Slug:** `decide-mode-v1`  
**Wayfinder map:** https://git.kyanitelabs.tech/simon/llm-3d-viz/issues/128  
**Decisions:** `docs/v1/wayfinder/decision-intelligence-floor-mode.md`  
**Prototype:** `docs/v1/wayfinder/prototype-decide-mode.md`  
**Mirror:** `docs/v1/wayfinder/RALPLAN-decide-mode-v1.md`

---

## RALPLAN-DR summary

### Principles (5)

1. **User-agnostic floor** — set by user (anchor / number); never inferred from skill.  
2. **Fail-closed metrics** — only measured AA Index, cost, speed.  
3. **Single ranking authority in Decide** — cost×speed Pareto + bias shortlist only; classic value-score optimum is **suppressed** (not soft-de-emphasized).  
4. **Prototype promotes math** — pure decide helpers are canonical.  
5. **Offline-first** — no product AI in v1 UI (omit AI button).

### Decision drivers

1. Production Decide mode matching map #128 core loop.  
2. Three hero + catalog honesty.  
3. Stable JSON export without HTTP.

### Options

| Option | Summary |
|--------|---------|
| A | Full map (real AI + priors + HTTP) — train 2 |
| B | Productize prototype as-is — rejected (dual ranking, trust debt) |
| C | Prototype only — rejected |
| **B′** | Offline decide + hard single authority + URL + honest export — **CHOSEN** |

### Pre-mortem

1. Sparse Pareto → copy + status.  
2. Dual ranking → R7 hard rule.  
3. Provenance bugs → floorSource state machine + tests.  
4. Share URL omit floor → R9 required.

---

## Requirements

| ID | Requirement |
|----|-------------|
| R1 | First paint **Explore** (decideMode false). `decide=1` deep-link opens Decide. |
| R2 | Entering Decide: if floor was never user/anchor-set this session, set floor **50** and source `default`. Re-entering Decide **keeps** last floor/source. URL values win over defaults. |
| R3 | Floor = AA Index; controls: numeric + anchor row (model id). |
| R4 | Eligible: Index ≥ floor AND isScorable (cost+speed); multi-effort per-row. |
| R5 | Cost×speed eligibles; Pareto; bias −1..+1; shortlist N=3. |
| R6 | Hide weight sliders **and** value-score leaderboard / “CURRENT OPTIMUM” readout in Decide. |
| R7 | **Hard stage rule when decideMode:** (a) no classic value-score optimum size/glyph/color primacy; (b) no “current optimum” a11y from value-score; (c) stage authority = below-floor dim + cost×speed Pareto callout + shortlist callout only. |
| R8 | Export DecideRequest/Response v1 with correct `floor_applied.source` and non-local `catalog_snapshot_id` (see contracts). |
| R9 | URL schema (below). |
| R10 | **Omit** AI propose button in v1 UI (train 2). |

---

## Contracts

### floorSource state machine (AppState)

| Event | source |
|-------|--------|
| Init enter Decide without prior user/anchor/url | `default` (floor 50) |
| Numeric/slider change | `user` |
| Anchor model selected | `anchor` |
| URL restore with floor | `user` (or `anchor` if anchor param present) |
| `prior` / `ai_confirmed` | **out of v1 contract** — not emitted |

Export and in-memory response use the **same** stored `floorSource`.

### catalog_snapshot_id (single algorithm)

v1 algorithm:  
`sha256` (hex, first 16 chars) of a stable canonical JSON of all **product catalog** rows’ `(model, aa_intelligence_index, tps, blended_price_per_M, data_date)` sorted by model id.  
Prefix: `cat_` + hex.  
**Never** bare `"local"` on export path. Unit test asserts ≠ `local`.

### DecideResponseV1

```ts
{
  schema_version: "1.0",
  floor_applied: { aa_intelligence_index: number, source: "user" | "anchor" | "default" },
  eligible_ids: string[],
  pareto_ids: string[],
  shortlist: { id: string, rank: number, reasons: string[] }[],
  catalog_snapshot_id: string, // cat_<16hex>
  refusals: string[]
}
```

### URL schema (ShareableState)

| Param | Meaning | Omit when |
|-------|---------|-----------|
| `decide=1` | Decide on | Decide off |
| `floor=<0..100>` | Intelligence floor | Decide off AND floor is default 50 unused; **when decide=1 always write floor** |
| `bias=<-1..1>` | Cost/speed bias | `0` |
| `anchor=<modelId>` | Floor anchor | none |

Parse: clamp floor/bias; unknown anchor → ignore anchor, keep floor.  
Round-trip tests required. Preserve existing filter/axis/weight params.

### Pure API names

Use existing helpers (`shortlistFromDecide`, `buildDecideResponse`, …); optional thin `runDecide` facade is fine but not required.

---

## Architecture seam

```
visibleSet → shortlistFromDecide / buildDecideResponse
  → Stage (R7) | Decide UI | Export | URL
```

All outcomes from pure decide path only.

---

## Phases

1. decide.ts: floorSource plumbing, snapshot id, drop prior/ai from v1 types, tests  
2. URL + state lifecycle (R1/R2/R9)  
3. Stage + console R6/R7 suppression  
4. Decide UI polish + sparse copy + export  
5. Playwright decide smoke (small, not full render suite)  
6. SPEC pointer  

---

## Testing / acceptance

**External behavior only.**

| # | Criterion |
|---|-----------|
| T1 | Unit: eligibility, Pareto, bias rank |
| T2 | Unit: each floorSource transition → export source matches |
| T3 | Unit: catalog_snapshot_id ≠ `local` and stable for fixed catalog fixture |
| T4 | Unit: URL round-trip decide/floor/bias/anchor |
| T5 | Smoke: Decide on → floor 50 default → weights **and** value-score optimum UI hidden |
| T6 | Smoke: B3 asserts (decideMode dataset; leaderboard hidden; no "Current optimum" a11y; no optimum semanticClass under Decide) |
| T7 | Smoke: shortlist ≤3; export schema_version 1.0 |
| T8 | Human: share URL restores decide state; below-floor dimmed |

Prior art: `tests/decide.test.ts`, `tests/url-state.test.ts`.

---

## ADR

| Field | Content |
|-------|---------|
| **Decision** | B′ production Decide: offline floor + cost×speed shortlist sole authority; URL; honest export; no AI UI v1 |
| **Drivers** | Map #128; prototype; fail-closed; Architect/Critic pins |
| **Alternatives** | A full AI; B as-is; C prototype only |
| **Why** | Ships conversation product without dual-ranking trust debt |
| **Consequences** | URL + state + stage/console mode branches; SPEC update |
| **Follow-ups** | Atlas AI tools; suite priors; HTTP; multi-role |

---

## Consensus log

| Pass | Verdict | Notes |
|------|---------|-------|
| Architect 1 | ITERATE | Plan missing / dual ranking / provenance |
| Planner revise-1 | B′ written | |
| Critic 1 | ITERATE | Hard R7, floorSource SM, snapshot algo, URL schema |
| Planner revise-2 | pins applied | this file |
| Critic 2 | (below) | |

## Approval

**Status:** CONSENSUS APPROVED — Critic-3 ACCEPT. Execution blocked until Simon handoff.  
**Do not implement until explicit execution approval.**

---

## Critic-2 residual pins (revise-3) — APPROVE gate

### B1 — catalog_snapshot_id input set
Hash the **loaded product catalog** after catalog-scope filter (`filterProductCatalog` / default product set), **before** shelf/UI filters (`visibleSet`).  
Helper: `catalogSnapshotId(productCatalog)`.  
`main` (or export path) **must** pass this id into every `buildDecideResponse` / export. Never hash `visibleSet`. T3 uses fixed product-catalog fixture.

### B2 — URL floor + anchor conflict
If `anchor` resolves to a catalog row with Index → **floor number = that Index**, `floorSource = "anchor"`; query `floor` is ignored for the number.  
If `anchor` unknown/missing Index → ignore anchor; use clamped `floor`; `floorSource = "user"`.  
Serialize when source is anchor: write **both** `anchor` and resolved `floor` for stable round-trip.

### B3 — T6 concrete (Three product path)
Replace soft T6 with:
1. `document.documentElement.dataset.decideMode === "1"`.
2. Console: `.value-leaderboard` and value-score optimum readout **hidden or absent** (not merely opacity).
3. Stage a11y/status must **not** contain `Current optimum` while Decide is on.
4. No mesh/point `semanticClass === "optimum"` (value-score) while Decide active; encoding uses floor dim + Pareto/shortlist only.

R7 applies to **Three product path** only; Plotly stage is non-product (no dual implementation).

### Consensus log update
| Critic 2 | ITERATE | B1–B3 residual |
| Planner revise-3 | pins above | |
| Critic 3 | **APPROVE** | B1–B3 executable |

