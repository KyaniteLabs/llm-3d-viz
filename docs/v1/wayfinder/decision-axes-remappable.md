# Decision: stage axes remappable (closes #50)

**Date:** 2026-08-04  
**Source:** Simon session (“make axes changeable so we don’t have to choose”) + ralplan consensus  
**Tickets:** #50 (3D cost axis), map #47  

## Locked

- **X / Y / Z metrics are user-selectable.** No permanent product lock on a single cost definition.
- **Default mapping** (product landing):  
  - X = blended $/M (7:2:1)  
  - Y = AA Intelligence Index  
  - Z = speed (tok/s)
- **Also selectable when data exists:** input $/M, output $/M, TTFT; stubs for cost/time per Index task until fields ship.
- **Value-score weights** remain classic speed / cost / intelligence (blended $/M) independent of display axes.
- Cost-per-task and time-per-task remain **must-ship charts** (`decision-chart-inventory-task-metrics.md`) regardless of 3D axis choice.

## Supersedes

- Permanent choice “3D cost = $/M **or** $/task only” as a one-shot product decision.
- Research recommendation to keep $/M forever on the hero is softened to: **default $/M**, user may remap when ready.

## Implementation authority

Execution train: `.omx/plans/prd-aa-density-suite.md` Phase 3 (adopt axis WIP under tests).
