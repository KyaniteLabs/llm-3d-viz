# Decision package: intelligence-floor decision mode + atlas AI

**Map:** [#128](https://git.kyanitelabs.tech/simon/llm-3d-viz/issues/128)  
**Date:** 2026-08-05  
**Authority:** grilled #131–#133; remaining tickets closed on Simon request with best-practice defaults.

## Product loop (locked)

1. **Intelligence floor** on AA Intelligence Index only (default **50** on first paint).
2. Set via **anchor model/effort**, **numeric refine**, or **AI propose → user confirm**.
3. **Eligible for pick surface:** Index ≥ floor **and** cost + speed present (fail-closed). Multi-effort is **per-row**.
4. **Decide mode UI:** live **cost × speed** chart of eligibles + **cheap↔fast bias**; **Pareto** ridge; **shortlist of 3** from near ridge.
5. Decide mode **hides** classic value-score weight sliders.
6. **Suite priors** (from public inverted boards) are **suggest-only** with sources + confirm — never override user floor; not auto-applied at first paint.
7. **Internal AI:** tools over catalog, structured finals, offline path without LLM.
8. **Consumers:** versioned **DecideRequest / DecideResponse JSON** + in-app export; HTTP later.

## Ticket index

| Ticket | Status |
|--------|--------|
| #131 floor definition | closed (grill) |
| #133 cost×speed surface | closed (grill; D re-lock) |
| #129 task-intel datasets | closed (research asset) |
| #130 atlas AI patterns | closed (research asset) |
| #132 baseline vs floor | closed (auto-default) |
| #134 internal AI surface | closed (auto-default) |
| #135 routing protocol | closed (auto-default) |
| #136 prototype | **open** — acceptance criteria on issue |

## Research assets

- `docs/research/task-intelligence-baseline-datasets.md`
- `docs/research/atlas-grounded-product-ai.md`

## Next

Prototype #136, then ralplan / to-spec / to-tickets for implementation if desired.
