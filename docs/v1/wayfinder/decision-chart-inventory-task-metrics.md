# Decision: chart inventory priority — cost/time per task (Simon 2026-08-03)

**Ticket:** #54 Decide AA-style chart inventory for v1  
**Related:** #49 cost-per-task research, #50 3D cost axis

## Locked must-ship charts (in addition to Three hero + existing 3 projections + filters/effort curves)

1. **Cost per task ranking** — weighted-average USD per Artificial Analysis Intelligence Index task (AA “Cost per Intelligence Index Task”). Lower is better. Rank/bar (or ordered list) of models in the **visible set**.

2. **Time per task** — AA “Time per Intelligence Index Task” (or equivalent time-to-complete Index work). Chart form TBD in layout prototype (rank, bar, or scatter vs Index) but the **metric is in-scope for v1**.

## Data dependency

- Neither metric is in `models.v0` today (only blended $/M, tps, ttft, Index).
- Implementation must **not invent** values from $/M alone.
- Empty/skeleton UI is allowed until a scrape/task lands real fields (see #49).
- Schema fields to add when data exists (suggested): `cost_per_index_task_usd`, `time_per_index_task_s` (names flexible).

## Relationship to 3D hero cost axis

- Simon prioritizes **task-based** decision charts.
- Research recommendation still holds for 3D until data: hero may stay **$/M** or switch later (#50 still open) — these two charts are **required surfaces** regardless.

## Explicitly not locked by this message

- Full multi-chart layout chrome (#55)
- Semantic color (#53)
- Whether 3D cost axis becomes $/task (#50)
