# PRD — Data stewardship improvements v2 (llm-3d-viz)

Status: ralplan consensus draft · Planner: main lane (GLM-5.3) · 2026-08-14
Evidence: session assessment (quantified), context snapshot `.omx/context/data-stewardship-v2-20260814T220000Z.md`, audit `audits/glm53-2026-08-14-G-datagaps.md` (baseline), prior plan `.omx/plans/prd-data-quality-remediation-v1.md` (executed + gated).

## RALPLAN-DR summary

**Principles**
1. Honesty core immutable — no invented metrics; corrections need a source stamp, not a guess.
2. Every non-null field provable — provenance coverage goes to 100%, including legacy gaps.
3. Coverage lifts are source-driven — add mappings/sources only where a real publisher exists; report the rest.
4. Right-sized — reuse the overlay/manual-additions/annex patterns already proven today; no new infra.
5. Testability — each workstream lands with fixture tests; 407-green invariant holds.

**Decision drivers**
1. `openness` is the only field-level correctness debt and already forces a workaround (D-H4 lab list).
2. Provenance at 87% (404 unstamped fields) undermines the "provably honest" claim.
3. Longitudinal record is absent (raw snapshots untracked, no release tags) — reproducibility B.

**Viable options**
- **A (chosen): seven-workstream program over the existing pipeline** (W1–W7 below), sequenced integrity → provenance → completeness → reproducibility.
  - Pros: every item maps to a proven pattern; independently shippable; worst items first. Cons: multi-session effort (~4–6 focused days); W7 brushes UI boundary.
- **B: only the mechanical fixes (W1–W3)** — one session, closes the visible debts; leaves reproducibility + coverage ceilings.
  - Pros: fast. Cons: assessment value decays; coverage gaps (Arena 19%, context 38%) persist silently.
- **C: platform rebuild with HF/OpenRouter-first ingestion + a real open-weights flag upstream** — highest ceiling, violates right-sized/D3 again (rejected for same reasons as prior plan's Option C).

## Goal
Move every stewardship dimension to ≥A−: integrity (fix `openness`), provenance (100% stamp coverage), completeness (ingest findable data; lift source-driven coverage), reproducibility (tagged releases + archived raw snapshots).

## Workstreams

### W1 — Truth-source `openness` (integrity) *(amended per Architect)*
- Replace the name-keyword guess with a curated lab-class overlay in the scope module: lab → `open | closed | mixed`, plus a **persistent per-family exception list** (lint-checked, survives manual-row supersede — the override channel's fatal flaw). `mixed` resolves closed-by-default per-family unless excepted.
- Provenance: new origin `curated` (enum extended; **never** `provider` — curation is not a provider statement); every non-null openness stamped.
- The D-H4 scope consumer **derives** its exemption set from this map (one module, decoupled concerns) rather than reading raw lists.
- Report the flip count in the build summary; manual-override precedence documented (manual additions win while alive; per-family exceptions are the durable channel).
- Tests: overlay inheritance incl. mixed-labs; exception precedence + survival post-supersede; stamp presence; D-H4 derivation regression.

### W2 — Provenance completion (100% stamps) *(amended per Architect)*
- Stamp the 404 legacy unstamped fields: modality (AA-path rows — origin aa-api/list; openrouter where the overlay supplied it) and AA-side `price_cache_per_M` (aa-api/measured).
- The hard gate is a **vitest meta-assertion over the built draft** (plus an optional fatal exit inside the expand script) — NOT in the non-fatal coverage-report path. Failure message names the ingestion point that must stamp, so legitimate future sources fix forward instead of fighting the gate.
- Tests: fixture rows from each path carry stamps; gate fires on a deliberate gap fixture with an actionable message.

### W3 — Seed 2.1 Turbo preliminary row (completeness, findable data)
- Manual-additions row from OUR OpenRouter snapshot: prices $0.50/$2.50 per M (list), context 262,144, modality text+vision+video, provider-published benchmarks if any exist on the ByteDance card (research step inside the ticket; only exact-schema matches, provider/list provenance, PRELIMINARY marking like GLM-5.3).
- Watchlist entry flips to `tracked_via_manual_row`. Held-lab caveat documented (visible under `?catalog=all`).
- Tests: row vets clean; OR overlay enriches prices on next AA publication (supersede path unchanged).

### W4 — Cost-per-task staleness flag (quality)
- When `cost_per_index_task_usd` is non-null and any price side moved >25% since its measurement date, mark the row's cost/task as stale in the gaps doc (`stale_cost_task` list) — data flag only; UI surfacing deferred to the UI/UX line.
- Tests: price-move fixture flips staleness; no price move → no flag.

### W5 — Dataset release tagging + raw snapshot archive (reproducibility) *(amended per Architect)*
- Tag each deployed catalog state as `data/YYYY-MM-DD-HHMM` with guards: **abort-and-alert (non-fatal) when the working tree is dirty with data changes** — script the data commit before tagging instead of tagging a tree that may not contain the deployed bytes; singleton lock already prevents tag overlap.
- Tag retention: 30-day prune **with keep-N-recent survivors** — the latest 12 `data/*` tags always survive as rollup anchors so the longitudinal record is capped, not erased; the raw archive prunes fully at 30 days.
- Archive raw snapshots: compress `data/aa-api-snapshot.json` + `openrouter-snapshot.json` per run into a gitignored `archive/raw/` with 30-day pruning.
- Tests: tag name derivation + dry-run creation; dirty-tree guard fires; archive write + prune window (both artifacts).

### W6 — Source-driven coverage lifts (completeness)
- Arena: analyze the persisted failure codes + top unmatched names; fix mapping gaps that are mechanically fixable (name bridges), report the rest. Target: attach rate 23% → ≥35%.
- Context/modality: grow `PROVIDER_TO_ORG` guided by `unmatched_by_provider` histogram (ByteDance, Reka, Amazon, Microsoft, StepFun, Tencent, InclusionAI, Xiaomi, AI21, Cohere, IBM, Upstage first). Target: context 38% → ≥55%.
- Targets are aspirational gates reported in coverage, not hard build failures. The W6 residual report names the ceilings no mapping can lift (coding 52%, agentic 44%, cost/task 42% — AA-publish-limited).
- Tests: new org mappings match fixtures; arena bridge fixes attach fixture pairs.

### W7 — Second-source intelligence signal (data layer only)
- Compute + persist an AA-Index ↔ Arena-Elo consistency report in the gaps doc (per-family delta ranking, both directions), titled as a **consistency measurement — not a replacement score**, so the single-source risk is measured, not just documented. UI surfacing explicitly out of scope (UI/UX audit line owns presentation).
- Tests: fixture pairs compute deltas; missing Elo → row omitted cleanly.

## Sequencing
W1 → W2 (both touch provenance plumbing; single owner) → W3 (independent, can parallel W2) → W4 ∥ W5 (independent) → W6 (needs telemetry steady-state) → W7 last (consumes Arena improvements from W6).

## Acceptance criteria
1. `openness` matches the curated lab map for 100% of rows (except explicit overrides), provenance-stamped, flip count reported.
2. A vitest meta-assertion over the built draft hard-gates `unstamped_non_null_fields = 0` (never the non-fatal coverage report); suite green.
3. Seed 2.1 Turbo visible under `?catalog=all` with preliminary provenance.
4. Staleness list appears in the gaps doc on a simulated price move.
5. A `data/` tag exists for the next deployed state; archive dir holds pruned raw snapshots.
6. Arena attach ≥35% and context ≥55% OR a documented per-provider residual report explaining the ceiling.
7. AA↔Arena consistency report present with per-family deltas.

## Risks & mitigations
- Openness curated map drifts as labs change posture → the map lives beside CLOUD_LABS/HELD_LABS in one scope module; exhaustive-lint pattern extended to it; weekly review line already exists.
- Archive growth → 30-day prune, compressed, gitignored.
- Arena/context targets miss → report residuals instead of forcing mappings (honest ceiling).
- W7 misread as a quality downgrade of AA Index → report framed as consistency measurement, never a replacement score.

## Amendment log
- **Rev 1 (Architect, APPROVE with amendments):** W1 — origin `curated` (new enum), lab→open|closed|mixed + persistent per-family exceptions surviving supersede, mixed→closed default, D-H4 derives from the map. W2 — gate moved to a vitest meta-assertion (+ optional fatal expand exit), actionable failure message. W5 — dirty-tree tag guard (commit-before-tag or abort+alert), tag retention/prune. All folded above.

## ADR
- **Decision:** seven-workstream stewardship program on existing patterns; openness via a curated lab-class truth map in one scope module (policy derives from it); provenance hard-gated to 100%; coverage lifts source-driven with reported ceilings; reproducibility via tags + pruned raw archive.
- **Drivers:** the only field-level correctness debt; the 87% provenance ceiling; absent longitudinal record.
- **Alternatives:** mechanical-only (B — leaves ceilings), platform rebuild (C — violates right-sized/D3).
- **Consequences:** ~4–6 focused days; one new curated map to maintain; archive dir ops note; W7 presentation deferred to UI/UX line.
- **Follow-ups:** UI/UX audit line consumes W7 report + W4 flag; v2 live-data phase may subsume W5 with a real store.

## Follow-up staffing
- `$ultragoal` sequential (W1→W2, then W4/W5 parallel lanes via team-equivalent subagents); W3, W6, W7 single-owner each. Reasoning: standard; W1 xhigh (truth-source semantics).
