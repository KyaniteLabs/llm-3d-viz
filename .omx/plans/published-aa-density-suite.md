# Published tracker artifacts — AA-density suite

**Date:** 2026-08-04  
**Map:** https://git.kyanitelabs.tech/simon/llm-3d-viz/issues/47  
**Consensus PRD:** `.omx/plans/prd-aa-density-suite.md`

## SPEC

| # | Title | Label |
|---|-------|-------|
| **#57** | SPEC: AA-density graph suite | `ready-for-agent` |

## Execution tickets (tracer bullets)

| # | Title | Blocked by | Label |
|---|-------|------------|-------|
| **#58** | docs + DESIGN-SYSTEM channel matrix | — | `ready-for-agent`, `wayfinder:task` |
| **#59** | visible-set filters E2E | #58 | same |
| **#60** | AA semantic color default + legend | #58, #59 | same |
| **#61** | remappable stage axes under tests | #59 | same |
| **#62** | family schema + multi-effort trails | #59, #60 | same |
| **#63** | cost/time per Index task chart shells | #59 | same |
| **#64** | scrape multi-effort + task metrics | #62, #63 | same |

## Dependency graph

```
#58 docs
  └─► #59 filters ─┬─► #60 color ─┐
                   ├─► #61 axes   │
                   ├─► #63 charts ┼─► #64 scrape
                   └──────────────┘
                         #62 trails (needs #59+#60)
```

## Frontier

Start **#58**, then **#59**. After #59: #60, #61, #63 can run in parallel; #62 after color; #64 last.

## Decision tickets closed as decided

#50 (axes remappable), #51 filters, #52 multi-effort, #53 color, #54 chart inventory.
