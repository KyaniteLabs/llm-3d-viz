# Test spec — data stewardship v2

Companion to `.omx/plans/prd-data-stewardship-v2.md`. Baseline: 407/407 green (2026-08-14).

## Global invariants
1. vitest fully green; tsc clean; CLOUD_SCORABLE_FLOOR unchanged except where a workstream admits rows (W3 admits one held-lab row → `?catalog=all` only, floor unchanged).
2. No producer writes aa_intelligence_index/tps/ttft from non-AA origins (existing grep-guard extended to new files).
3. Honesty: W3 benchmarks only exact-schema matches with provider/list + PRELIMINARY marking.

## W1 — openness truth source
- Unit: curated-map inheritance with **fixtures generated from the actual curated map** (not a hardcoded lab list); mixed-lab classes default closed; per-family exceptions override and SURVIVE manual-row supersede; manual-row explicit value wins while the row is alive.
- Unit: provenance stamp present on every non-null openness with **origin `curated`** (enum extended; never `provider`); validator accepts the new origin.
- Regression: D-H4 scope behavior derived from the same map (exemption set identical to OPEN_WEIGHT_LABS semantics).

## W2 — provenance completion
- Unit: AA-path modality stamped (aa-api/list); OR-overlay modality stamped (openrouter/list); AA-side price_cache_per_M stamped (aa-api/measured).
- Unit: **vitest meta-assertion over the built draft** — fixture with one deliberately unstamped non-null field fails with a message naming the ingestion point; optional fatal expand exit covered by a script fixture.

## W3 — Seed 2.1 Turbo
- Unit: row vets clean (AA-only fields null); prices/context/modality from OR snapshot values; PRELIMINARY in source string; watchlist flips to tracked_via_manual_row.
- Integration: simulated AA publication of the family supersedes the row (supersede regression, name-bridged like GLM-5.3).

## W4 — cost/task staleness
- Unit: price side +30% after measurement date → row listed in gaps-doc stale_cost_task; unchanged prices → absent.

## W5 — tags + archive
- Unit: tag name derivation + dry-run creation (no push in tests); **dirty-tree guard fires (abort + non-fatal alert) when data files are modified-uncommitted**; **tag retention prune** (30-day-old data/* tags pruned in dry-run **except the latest 12, which always survive as rollup anchors**).
- Unit: archive write/prune window (31-day-old file pruned, 5-day kept).

## W6 — coverage lifts
- Unit: new org-map entries match fixtures (ByteDance, Reka, Amazon, Microsoft, StepFun, Tencent, InclusionAI, Xiaomi, AI21, Cohere, IBM, Upstage).
- Unit: arena name-bridge fixes attach previously-failing fixture pairs; unfixable ones still logged.
- Coverage report shows attach-rate and context-coverage percentages.

## W7 — consistency report
- Unit: fixture families with both scores compute deltas (both directions); Elo-null families omitted; report sorted by |delta|; **title/header asserts 'consistency measurement — not a replacement score'**.

## Observability acceptance
- One full simulated cycle: openness flips reported, zero unstamped fields (gate green), Seed row visible under ?catalog=all in a jsdom boot, staleness list present after price move, tag + archive artifacts exist, coverage percentages printed, consistency report present.
