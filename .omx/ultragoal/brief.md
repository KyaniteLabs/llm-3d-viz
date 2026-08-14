# Ultragoal brief — data-quality remediation execution

Created: 2026-08-14T17:5xZ (ZCode session; adapted runtime)
Source of truth: consensus-approved plan `.omx/plans/prd-data-quality-remediation-v1.md` + test spec `.omx/plans/test-spec-data-quality-remediation-v1.md` + consensus record `.omx/state/ralplan-consensus-data-quality-remediation.json` (gate complete: Architect APPROVE+CONFIRM, Critic APPROVE).

## Objective (aggregate pointer)
Execute the consensus-approved data-quality remediation plan under its principles (honesty first; alert don't auto-mutate; close the operator loop; right-sized; testability), its phasing (P0 before 2026-08-16 DeepSeek repricing; P1 by ~08-19; P2 by ~08-26), and its test spec. Constraints immutable: AA-authoritative spine, no invented metrics, no new infrastructure, 327-green suite stays green, CLOUD_SCORABLE_FLOOR unchanged by visibility work.

## Runtime adaptation (recorded deviation)
The `omx` CLI and Codex goal tools (get_goal/create_goal/update_goal) are unavailable in this ZCode session; tmux team panes cannot be created ($TMUX unset). Per the team skill's own boundary, native subagents are the sanctioned parallelism surface here. Therefore:
- Leader (this session) maintains `.omx/ultragoal/goals.json` + `ledger.jsonl` manually under the ultragoal artifact contract (no hidden goal mutation; checkpoints carry evidence; steering is explicit and evidence-backed).
- P0 executes single-owner (leader), as the plan requires.
- P1/P2 lanes run as native subagents with strict file-ownership boundaries from the plan; the leader checkpoints from their evidence.
- Codex-goal snapshots required by `omx ultragoal checkpoint --codex-goal-json` are replaced by leader attestation + verifiable evidence (tests, commits) in the ledger; the deviation is recorded per checkpoint.

## Stories
- G001 (P0): WS1 diff+alerts (+silence check, trap wiring) + WS2 stage-1 canary + stage-2 calibration cycle; stage-3 cache refinement only after baseline artifact. Deadline 2026-08-16.
- G002 (P1): WS3 annex + hidden_by_scope; WS4 watchlist + scope vocab; WS6 schema half. WS3→WS6 single-owner sequencing.
- G003 (P2): WS5 secondary axes + est-label fix; WS6 rest (arena/OR telemetry, ladders); WS7 hygiene; surface D-H4 decision to Simon.
- G004 (steer, user rider 2026-08-14): include Qwen3.8 27B benchmarks honestly (manual-additions mechanism; provider-published numbers only, exact-benchmark field mapping; never the AA Index).

## Success criteria
The plan's 7 acceptance criteria + global invariants (test spec) verified; final cleanup/review gate before G003 completion (ai-slop-cleaner pass, independent code-review subagents, architecture-invariant audit per ultragoal final gate).
