# Research: AA cost-per-task availability

**Ticket:** [Research: AA cost-per-task field availability and scrape path](https://git.kyanitelabs.tech/simon/llm-3d-viz/issues/49)  
**Date:** 2026-08-03  
**Method:** AA methodology public text (2026) + our v0 extraction notes. Live page re-fetch flaky this session.

## AA definitions (methodology)

1. **Price (Blended)** — USD per **1M tokens**, 7:2:1 cache hit : input : output  
   \((7·cache + 2·input + output) / 10\)

2. **Cost per Task** — weighted-average **USD to complete one Artificial Analysis Intelligence Index task**, using tokens consumed across the Index workload × token prices (incl. reasoning/answer where applicable), weighted by eval weights, ÷ task count.

Related public charts on AA home/model pages:

- Cost per Intelligence Index Task (by token type)
- Cost to run full Intelligence Index
- Time per Intelligence Index Task

## What we already store

| Field | Present? |
|-------|----------|
| `price_in_per_M`, `price_out_per_M`, `blended_price_per_M` | Yes |
| Tokens used per Index task | **No** |
| Cost per task USD | **No** |
| Time per task | **No** |

## Scrape path feasibility

- **Token prices:** already proven via public embedded JSON / JSON-LD on AA model pages (v0 method, ToS-safe GET of public pages).
- **Cost-per-task:** AA documents the metric publicly. Whether it appears in the same `currentModel` / RSC payloads as a single number needs a live field dump on one model page when AA is reachable. If only rendered in charts without embedded series, capture is harder (must not invent).

## Recommendation for cost-axis ticket (#50)

Until cost-per-task is in the dataset:

- Keep **3D hero cost axis = blended $/M** (rate card; already locked math).
- Plan **secondary chart** “Quality vs $/task” as **blocked on data task**, not as fake estimate.
- Do **not** recompute $/task from $/M alone (lies about reasoning burn).

## Done criteria met?

Yes for decision enablement: metric exists at AA; we lack fields; acquisition is “same public page JSON if present, else dedicated extraction task.” Live field confirmation is residual, not blocking the *architecture* decision.
