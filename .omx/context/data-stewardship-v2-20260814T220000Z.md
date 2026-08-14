# Context — data stewardship improvements v2 (llm-3d-viz)

Snapshot: 2026-08-14T22:00Z · Trigger: `$ralplan` → fill `$wayfinder`/`$to-spec`/`$to-tickets`

## Task
Turn the 2026-08-14 data-stewardship assessment (session transcript, quantified against the live 308-row catalog) into a consensus-approved, spec'd, ticketed improvement program.

## Assessment facts (computed today)
- Provenance: 2,710 field stamps (5 origins) but 404 non-null fields unstamped (modality 236, AA-side price_cache_per_M 168).
- Integrity debt: `openness` mislabels whole labs (39 open/269 closed; Qwen/GLM/DeepSeek/Kimi flagged closed) — AA name-keyword heuristic, audit L4; D-H4 already works around it lab-level (OPEN_WEIGHT_LABS).
- Completeness: coding 52%, agentic 44%, cost/task 42%, context 38%, Arena 19%; 102 rows awaiting only TPS; benchmark trio on 1 row (GLM-5.3 preliminary).
- Findable-unshown data: Seed 2.1 Turbo fully specced in our OpenRouter snapshot ($0.5/$2.5 per M, 256K ctx, text+image+video) — held lab → `?catalog=all` only.
- Single-source risk: intelligence + speed have no second measurement source.
- Reproducibility: raw snapshots gitignored; no tagged dataset releases.
- Staleness blind spot: cost_per_index_task measured under old prices never flagged when list prices move.
- Arena attach rate 23%; OR match telemetry (unmatched_by_provider histogram) now live to guide org-map growth.

## Constraints
- Honesty core immutable (no invented metrics; AA-authoritative spine; nulls reasoned).
- No new infrastructure (files + Forgejo + existing patterns).
- W7 touches UI → boundary with the queued UI/UX audit line; data-layer first.
- Suite green invariant (407 tests currently); CLOUD_SCORABLE_FLOOR stability for non-admitting work.
- Forgejo tracker conventions: docs/agents/issue-tracker.md (wayfinder map/children/blocking via "Blocked by: #n" body lines; labels by numeric id).

## Unknowns
- Openness truth source: curated lab list vs HF weights metadata vs both (Architect input).
- Whether OR context/modality org-map growth suffices to lift coverage materially (telemetry-guided, iterative).
- Arena attach failures: how many are fixable mapping vs genuinely unlisted AA families (persisted counts exist, names to analyze).
