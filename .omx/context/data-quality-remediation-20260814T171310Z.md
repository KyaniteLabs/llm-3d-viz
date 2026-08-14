# Context — data-quality remediation (llm-3d-viz)

Snapshot: 2026-08-14T17:13Z · Trigger: `$ralplan "full data gaps and data quality remediation improvement optimization and mitigation plan"`

## Task statement
Turn the findings of the 2026-08-14 data-gaps audit (`audits/glm53-2026-08-14-G-datagaps.md`) into a phased, testable remediation plan covering data gaps, data quality, optimization, and mitigation — ending in a durable consensus handoff (no execution in this session).

## Desired outcome
A consensus-approved PRD + test spec that: (1) closes every HIGH finding and the highest-value MEDIUMs; (2) ships price-truth + change-detection protections before the DeepSeek repricing lands (~2026-08-16); (3) preserves the pipeline's honesty core (no invented metrics, AA-authoritative spine); (4) is executable via `$ultragoal`/`$team` without further scoping.

## Known facts / evidence
- Audit complete: 1 CRITICAL (C1 cache=0 blend defect — **already fixed & deployed 2026-08-14**, commit 9bbc16e, DeepSeek V4 Flash 0731 blended 0.056→0.154 $/M, 327/327 tests), 5 HIGH (H1–H5), 7 MEDIUM (M1–M7), 5 LOW. Full text with computed counts + file:line cites in the audit file.
- H1: 301/608 AA rows never reach draft invisibly (192 missing only TPS; 3 complete triples dropped by NON_USER_TIERS policy).
- H2: no announced-models watchlist (GLM-5.3 now tracked via the NEW manual-additions overlay, commit 9bbc16e; ByteDance Seed 2.1 Turbo untracked; ByteDance Seed + Reka AI in neither scope list).
- H3: AA↔OpenRouter price divergence ~3× today (V4 Pro 0.43/0.87 vs 1.168/2.336; 0813 reversed); OR overlay is fill-only (0 price overlays last build) so price *changes* never propagate from OR; no divergence metric/alert.
- H4: 30 held-lab 2026 rows + 150 floor-hidden rows (41 notable late-2025 cloud) invisible in default scope.
- H5: 7 rows vanished Aug 8→14 silently; only gross >50% shrink gates; no row-diff surface; cron stalled 6 days silently (flock bug — **already fixed** 9bbc16e/eb94789); `last-status.json` failures are written but never read.
- M1: AA publishes coding_index (90/127 scope rows) + agentic_index (83/127) + median_end_to_end_response_time (→ measured task time) — all unmapped; gpqa/swe_bench/aider_pct 100% null dead schema vs SPEC §5 promise.
- M2: Arena Elo matches 23% (88/389), failure codes not persisted. M3: context_length 62% null, OR org map covers 12 labs, match failures unlogged. M4: ladders doc frozen 2026-08-08, 22 multi-effort families untracked. M5: null_reason/incompleteModels UI dead code. M6: sources type union drift (aa-api missing, price_cache_per_M key absent, no cache stamp anywhere). M7: no alert channel; coverage report unread; raw snapshots gitignored.
- L1 stale 119/47 comment; L2 snapshot byte-duplication; L3 time-axis available flag; L4 openness heuristic; L5 repo clutter.

## Constraints
- Honesty core is non-negotiable: never invent Index/tok/s/price; nulls preserved with reasons; AA stays the authoritative spine for measured axes (ADR-0001).
- No new infrastructure (no DB, no services) — build on existing pipeline files + Forgejo Issues REST API (docs/agents/issue-tracker.md) for alerting.
- Product SoT: Forgejo `simon/llm-3d-viz` (origin); public Cloudflare Pages publish stays double-gated.
- Live deadline: DeepSeek repricing effective ~2026-08-16 (announced ~Aug 6; output ~$1.32/M peak, half off-peak).
- Cron runs 3×/day on macOS (mkdir+PID lock now); deploy = build → private VPS rsync (approval-gated Pages stays off).

## Unknowns / open questions
- How many of the 192 awaiting-TPS rows are cloud-scope (annex flood risk)? Probe in execution.
- Does the Forgejo token work from cron env (AA_API_KEY precedent says yes, needs verification)?
- Alert thresholds (divergence %, shrink %, consecutive failures) need tuning defaults + operator tolerance.
- SPEC §5 dead-axis decision: retire gpqa/swe_bench/aider_pct vs retain-deprecated (Architect input).

## Likely codebase touchpoints
scripts/expand-aa-multi-effort.mjs · scripts/lib/{catalog-join,manual-additions,aa-api,arena-hf,openrouter-api}.mjs · scripts/catalog-auto-update.sh · scripts/catalog-coverage-report.mjs · data/{effort-gaps.generated.json,expected-effort-ladders.json,manual-additions.json,+ model-watchlist.json} · src/data/{models.ts,catalog-scope.ts} · src/lib/provenance.ts · src/lib/axis-metrics.ts (read-only boundary: UI changes minimized) · tests/ · docs/agents/issue-tracker.md · .env (Forgejo token)
