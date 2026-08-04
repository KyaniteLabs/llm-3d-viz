# Research: AA multi-effort / reasoning-intensity inventory

**Ticket:** [Research: AA multi-effort / reasoning-intensity row inventory](https://git.kyanitelabs.tech/simon/llm-3d-viz/issues/48)  
**Date:** 2026-08-03  
**Method:** repo dataset + `docs/research/dataset-v0-sources.md` + prior AA field mapping (public embedded JSON). Live AA HTTP was not re-fetched this session (edge timeouts); findings are source-doc grounded.

## What AA does

- Publishes **separate model rows** per reasoning/effort configuration (name suffixes like `(max)`, `(high)`, `(xhigh)`, `(Reasoning)`, non-reasoning variants on model pages).
- Metrics that **move with effort:** Intelligence Index, often TTFT (thinking time), sometimes output speed; **token list prices** may be identical across effort for the same API model while **cost-per-task** and latency change with token burn.
- Provider comparison pages treat each effort row as its own product identity.

## What our v0 dataset did

Policy in `dataset-v0-sources.md`:

> where AA tracks multiple effort levels, the **max/high** variant was chosen for frontier comparability.

Result:

| Fact | Value |
|------|--------|
| Scorable rows | 33 |
| Families with multiple effort rows in JSON | **0** (collapsed) |
| Name tags present on max/high rows | max, high, xhigh, Reasoning, max effort |
| Structured field for effort tier | **None** (only boolean `reasoning` + free-text `model` name) |

## Implications for product

1. Multi-effort UI requires a **dataset expansion** (new rows), not just UI.
2. Schema should add at least: `family_id` (or base name), `effort_tier` enum, keep `reasoning: boolean`.
3. Default visible set should **not** show every tier of every family (density problem Simon reported) — e.g. default max/high only, with effort control to expand.

## Residual unknown (live pull)

Exact current AA matrix (which families have low/medium/high/max today) needs a fresh catalog scrape when network to artificialanalysis.ai is available. That does not block designing schema + UX; it blocks final row counts.

## Recommendation for later tickets

- Schema + UX decision ([Decide multi-effort representation…](https://git.kyanitelabs.tech/simon/llm-3d-viz/issues/52)) can proceed with **family_id + effort_tier + default = max/high**.
- Task ticket (not yet filed) later: expand `models.v0` with multi-effort rows from AA.

## Supersession (ralplan A′ · 2026-08-04)

Product lock in `decision-filters-and-effort-curves.md` **supersedes** “default max/high only” as the density control: **all tiers plottable** on the same graph; density is **age ≤6 months + provider + family** filters. Effort-tier multiselect is out of the AA-density train unless reopened. Scrape expansion remains #64.
