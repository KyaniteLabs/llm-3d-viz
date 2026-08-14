# PRD — Data-gaps & data-quality remediation v1 (llm-3d-viz)

Status: ralplan consensus draft · Planner: main lane (GLM-5.3) · 2026-08-14
Evidence base: `audits/glm53-2026-08-14-G-datagaps.md` (all counts computed) · context snapshot `.omx/context/data-quality-remediation-20260814T171310Z.md`
Already fixed pre-plan (commit 9bbc16e): C1 cache=0 blend defect; cron flock stall; manual-additions overlay (GLM-5.3 row, provider provenance).

## RALPLAN-DR summary

**Principles**
1. **Honesty first** — no invented/reconstructed metrics; visibility without admission; nulls carry reasons.
2. **Alert, don't auto-mutate** — AA stays the authoritative spine; cross-source canaries inform the operator, never silently overwrite.
3. **Close the operator loop** — every silent failure mode the audit proved (6-day stall, 7-row vanish, invisible 49.5% drop) gets a durable, readable signal.
4. **Right-sized** — no new infrastructure; files + Forgejo Issues API only; ship P0 before the Aug-16 DeepSeek repricing.
5. **Testability** — every workstream ships fixture-backed tests; the 327-green suite stays green.

**Decision drivers (top 3)**
1. DeepSeek repricing ~2026-08-16: price truth + change detection must be live before it lands.
2. Proven silent failure modes: trust in the instrument requires signals, not post-hoc git archaeology.
3. Content value: 192 notable invisible models + dead SPEC §5 intelligence axes are the biggest product gaps.

**Viable options**
- **A. Phased full remediation (CHOSEN)** — P0 (canary + diff/alert) by Aug 16; P1 (annex, watchlist/scope, schema) next; P2 (secondary axes, ladders, polish, H4 policy decision). Bounded scope, existing patterns (generated gaps doc, manual-additions overlay, issue-tracker docs) de-risk each lane.
  - Pros: meets deadline; retires H1/H2/H3/H5 outright and makes H4 a decided, reported question rather than a silent one; each phase independently shippable. Cons: ~4–6 focused engineer-days total; alert thresholds need tuning; H4 policy outcome still requires a human decision.
- **B. Hotfix-only (canary + diff, defer rest)** — cheapest; leaves H1/H2/H4 and all Ms open; audit value decays as sources drift.
  - Pros: 1 day. Cons: blind spots persist; next incident still silent in the uncovered lanes.
- **C. Ingestion rebuild with local history DB** — full longitudinal store, replay, multi-source merge authority.
  - Pros: strongest long-term. Cons: heavy infra vs a curated static-catalog product; contradicts D3 (curated dataset, no scraping infra growth); revisit at v2 live-data phase.

Invalidation rationale for B/C: B fails driver 2–3 (proven silent modes remain uncovered in annex/scope/schema lanes); C fails principle 4 (right-sized; D3 scope) and delays driver 1.

---

## Goal
Close the audit's findings so the catalog is **complete-as-published, price-true, and self-alerting**, with the DeepSeek repricing as the first live verification event. **HIGH coverage is explicit, not blanket:** H1→WS3, H2→WS4, H3→WS2, H5→WS1 close fully. **H4 splits:** its *visibility* half closes via the WS3 `hidden_by_scope` report (counts + notable names, reporting-only); its *policy* half — the release floor (deliberate product decision, `catalog-scope.ts:32`) and held-lab membership — is surfaced as an explicit **P2 product decision item (D-H4)** for Simon, informed by that report. MEDIUMs: addressed in WS5/WS6 or deferred with rationale below.

## Workstreams

### WS1 — Draft diff + alert channel (H5, M7) — **P0** *(amended per Architect A1/A3/A4)*
Row-level diff previous→new draft by spine key, **computed inside `expand-aa-multi-effort.mjs` pre-write** (where `prevRowCount` is read — the shell has no pre-overwrite copy):
- `data/catalog-diff.generated.json` (tracked): added[], removed[] (rename detection via `normalizeFamily` + provider match, **including manual→AA supersede as rename, not removal** — GLM-5.3 fixture required), price_deltas[] (|Δ| > 10%), counts, hash pair.
- Alert via Forgejo Issues REST API (`docs/agents/issue-tracker.md`; label `needs-triage`), **one aggregated issue per run** (never per-event), signature-deduped across runs. Token extraction from `~/.git-credentials` with browser UA per the issue-tracker doc; alongside every alert fire a **macOS local notification** (`osascript display notification`) — the Forgejo issue is the durable trail, the notification is the push.
- **Alert step reachable from every exit path**: invoked via failure `trap`/wrapper in `catalog-auto-update.sh`, not appended at the end (the dying process must still alert; the next-run observer catches hard crashes).
- **Stall detection is silence-based**: status-history file (append per run, incl. lock-overlaps classified separately from failures); alert when *no `ok:true` in ≥24h* — catches crashes that write nothing; 2-consecutive-failure rule dropped as overlap-fragile.
- **Silence check is independent of the monitored process** *(Critic F3)*: a separate hourly cron entry (`scripts/catalog-silence-check.sh`, read-history → alert only) so total death (removed crontab, host down while cron owner lives elsewhere… host-off remains a named residual — nothing local can alert from a powered-off machine; mitigation: Forgejo issue trail shows last-known state on next visit).
- Shrink gate tuning: keep >50% hard-abort; add >5% → alert+continue.
- Tests: fixture drafts (add/remove/rename/price-move/manual-supersede-rename); aggregated-issue trigger matrix incl. dedup; silence-window detection over scripted history; failure-path trap integration (`SKIP_BUILD=1 SKIP_DEPLOY=1` + forced failure → alert attempt, non-fatal without token).

### WS2 — Price-divergence canary + cache truth completion (H3, C1-followups) — **P0, staged** *(amended per Architect A2/A3/A5/A6)*
- **Stage 1 (canary+diff, lands first):** after join, for every AA↔OR matched row: per-side (in/out/cache) divergence ratio; records live in the **gaps doc** (`price_divergences`) — never a second writer to `last-status.json` (shell owns it). Canary alerts on **delta vs previous run** (ratio moved), not just level — that is the "a source just changed" signal Aug 16 needs. **Persistent divergences don't go permanently quiet** *(Critic F4)*: each record carries `first_seen` + `age_days`, and the ops review line in HANDOFF recurs weekly while any divergence older than 7 days persists (aging counter mirrors the watchlist design).
- **Stage 2 (baseline cycle):** one full cron cycle observing recorded divergences/deltas = calibration baseline.
- **Stage 3 (cache refinement, separate final commit):** when AA cache is 0/absent AND OR `input_cache_read` > 0, use OR cache with `openrouter/list` provenance in the 7:2:1 blend — lands **after** the baseline so its own blend movement (>25% for ~146 rows leaving the conservative fallback) is not confused with the DeepSeek repricing; the aggregated-issue design plus calibration run absorbs the expected alert burst.
- Stamp `price_cache_per_M` provenance in all paths (aa-api / openrouter / `aa/derived` fallback-distinguishable). **P0 includes** the `price_cache_per_M` sources-key union addition (`models.ts`) + `FIELD_SHORT` label (`provenance.ts`) — no inspector-raw-name window during the verification window (pulled forward from WS6 per Architect).
- Tests: divergence fixtures (agree / 3× / cache-zero+OR-present / delta-changed vs level-flat); blend provenance stamping; no behavior change when sources agree; C1 regression intact.

### WS3 — Pre-admission visibility annex (H1, M5) — **P1** *(amended per Architect tension resolution)*
- **Default: report-only.** `effort-gaps.generated.json` gains `awaiting_measurement`: rows missing exactly one triple element (192 no-TPS / 4 no-IQ / 2 price-only buckets), each with family, provider, release_date, missing axis, AA slug — **reporting only, never admitted** (principle 1). Keeps scope policy out of the pipeline (no layering inversion).
- **`hidden_by_scope` section (closes H4's visibility half):** report-only counts + notable names of floor-hidden and held rows, bucketed precisely: (a1) all floor-hidden draft rows = 150 across all labs; (a2) floor-hidden **cloud-lab** rows = 109; (a3) notable cloud rows ≥2025-09 = 41; (b) held (not-in-CLOUD_LABS) 2026 rows = 30. No scope change — this feeds decision item **D-H4 (P2)**: Simon decides floor/held-lab policy (e.g. generation-scoped floor, `?catalog=all` floor relaxation, promoting specific labs), with the report as evidence.
- `NON_USER_TIERS` drops counted + named in build summary (3 today: GPT-5.6 Sol/Luna/Terra max).
- **Draft emission is probe-gated, off by default**: emit `null_reason` rows only if the cloud+floor subset is ≤ ~40 rows AND product confirms UI value; if emitted, scope-filter **by importing the existing scope module** (never re-hardcoded lists) so WS4 scope moves propagate. Note: the draft contract for null_reason rows is already exercised in production by the GLM-5.3 manual row (validateModels requires null_reason on excluded rows — GLM-5.3 satisfies it). Otherwise incomplete-UI retirement decision moves to P2.
- Tests: annex bucketing from AA fixture; emission cap + scope-import filter; incomplete-UI render with fixture row (if emission on); scorable count unchanged either way.

### WS4 — Watchlist + scope vocabulary (H2, M4-lite, L1) — **P1**
- `data/model-watchlist.json`: announced models (first entries: ByteDance Seed 2.1 Turbo 2026-08-10; GLM-5.3 as supersede-regression case), with provider, announced_date, expected source, notes. Pipeline reports days-without-AA-measurement into gaps doc.
- ByteDance Seed + Reka AI → `HELD_LABS_FOR_LATER`; new test: every draft provider appears in exactly one of CLOUD_LABS/HELD_LABS (exhaustive-lint).
- Fix stale 119/47 comment (`src/data/models.ts` CLOUD_SCORABLE_FLOOR docblock).
- Tests: watchlist supersede interplay with manual-additions; scope-exhaustiveness lint on current draft.

### WS5 — Secondary intelligence axes + measured task time (M1) — **P2**
- Map AA `artificial_analysis_coding_index` → `coding_index`, `artificial_analysis_agentic_index` → `agentic_index` (0–100 validated, `aa-api/measured` provenance), `performance.median_end_to_end_response_time_seconds` → `time_per_index_task_s` measured (existing `taskTimeInfo` already prefers measured — verified by Architect).
- Data layer only; axis-switching UI is explicitly out of scope. **Fold in the one-string `(est.)` axis-label fix** in `axis-metrics.ts` (label becomes wrong for measured rows — not UI work, honesty fix).
- Dead axes: RETAIN `gpqa`/`swe_bench`/`aider_pct` as deprecated nullable fields + SPEC §5 amendment note; do not wire UI.
- Tests: mapper fixtures incl. null-passthrough; range validation; measured-vs-estimated task-time selection (locks existing behavior); label string update.

### WS6 — Schema/provenance cleanup + coverage telemetry (M2, M3, M6, M4) — **P1/P2**
- `Model.sources` type union: add `"aa-api"` origin; add keys `price_cache_per_M`, `context_length`, `modality`, `cost_per_index_task_usd`; `FIELD_SHORT` labels to match (inspector stops showing raw field names).
- Arena match-failure persistence: counts by code + top-N unmatched model names into gaps doc (from 23% attach rate — first measurable improvement target).
- OR overlay telemetry: context/modality match counts + unmatched-provider histogram (M3; tells us whether 62% context-null is fixable by org-map growth).
- Refresh `expected-effort-ladders.json`: add the 22 untracked multi-effort families (draft scan + curated expected_tiers).
- Tests: type-union fixture through `validateModels`; arena-log persistence; ladder-generation regression.

### WS7 — Hygiene (L2–L4) — **P2 stretch**
Snapshot file dedupe or generation-on-demand; time-axis `available` honesty; openness-heuristic caveat comment; repo-root tmp cleanup. Individually droppable.

## Phasing & sequencing *(amended)*
- **P0 (ships before 2026-08-16, staged per A3):** ① canary+diff+alert wiring (WS1 + WS2-stage-1, single owner — same files); ② one calibration cron cycle (baseline divergences/deltas recorded); ③ cache-refinement commit (WS2-stage-3) + P0-pulled `price_cache_per_M` schema bits. Diff computed inside expand pre-write; alert step on a failure trap; silence-based stall detection live from ①.
- **P1 (by ~2026-08-19):** WS3 (report-only default), WS4, WS6-schema-half. Sequence WS3 → WS6 with a single owner for the gaps-doc build block (both restructure it).
- **P2 (by ~2026-08-26):** WS5, WS6-rest, WS7.
- Parallelizable: WS3 ∥ WS4 ∥ WS5 after P0 (coordinate expand-script commits per workstream; five workstreams touch it — small PR-sized commits each).

## Acceptance criteria (product-level) *(amended)*
1. A simulated DeepSeek-style price fixture (AA updated, OR stale) produces: correct new blends, a **delta** divergence record (not just level), a diff entry, and **exactly one aggregated alert payload** with local notification side-effect.
2. Removing a cloud-lab row in a fixture produces a named removal in the aggregated alert; a forced pipeline failure alerts via the trap path; **24h of no `ok:true` in the history file fires the silence alert**; lock-overlap alone never fires.
3. `awaiting_measurement` annex lists the audit's exact buckets (fixture-verified) without admitting any non-triple row (scorable count unchanged); manual→AA supersede classifies as rename (GLM-5.3 fixture).
4. Every draft provider is in exactly one scope list (test-enforced).
5. `coding_index`/`agentic_index`/measured task-time present with provenance for the audit's counts; inspector shows friendly labels for all stamped fields incl. `price_cache_per_M` from P0 onward.
6. Full suite green incl. new tests; `CLOUD_SCORABLE_FLOOR` unchanged by WS3/WS4/WS5 (visibility ≠ admission).
7. `hidden_by_scope` reports the audit's counts from fixture (buckets a1=150 all-lab / a2=109 cloud / a3=41 notable cloud; b=30 held 2026 rows) with zero scope/policy change and zero draft rows added; decision item D-H4 recorded open in HANDOFF until Simon rules.

## Principle-2 carve-out (recorded for future readers)
WS2-stage-3's OR-cache fill is a deliberate, provenance-stamped exception: it fills an AA sentinel-0/absent cache slot (C1 evidence: 0 = placeholder) with an OpenRouter *list* price — list-price completion from a sanctioned source (ADR-0001), never a mutation of an AA *measured* value. "Alert, don't auto-mutate" governs measured axes and existing non-sentinel values.

## Risks & mitigations *(amended)*
- Forgejo token absent in cron env → extraction documented (browser UA); alert degrades to loud log + `osascript` notification still fires locally; alert step never fails the pipeline.
- **Alert burst on cache-refinement landing** → calibration cycle (baseline committed as an artifact; git ordering proves stage-3 landed after it) + aggregated-per-run issues + delta-only canary (A3/A5); expected one-time burst on stage-3 commit, absorbed by design.
- Silence-window false positives during intentional downtime (deploy pauses) → window tuned to 24h (3 missed runs); overlap excluded.
- Annex flood → report-only default; draft emission probe-gated ≤40 + product confirmation.
- Divergence canary misreads batching lag → delta + level both recorded; one-week operator review after Aug 16; never auto-mutates.
- Manual watchlist staleness → gaps-doc aging counter; weekly ops review line in HANDOFF.

## Amendment log (consensus iterations)
- **Rev 1 (Architect A1–A6):** trap-path alerting, silence detection, single-writer status, aggregated issues + calibration staging, delta canary, token/notification delivery, WS3 report-only default + scope-module emission, `(est.)` label fold-in, P0 cache-key pull, manual-supersede fixture. Doc-path typo (`docs/agents/agents/`→`docs/agents/`) corrected in WS1 text.
- **Rev 2 (Critic F1–F6):** H4 explicitly split — visibility half closed by WS3 `hidden_by_scope` report, policy half surfaced as P2 decision item D-H4; Goal/Option-A claims corrected accordingly. Independent silence-check entry (`catalog-silence-check.sh`), host-off named residual. Divergence aging (`first_seen`/`age_days`) + weekly recurring review. Principle-2 carve-out recorded. Calibration baseline committed as artifact (git-ordering proves sequencing — see Risks).
- **Rev 3 (Architect re-confirm, non-blocking notes adopted):** (a) silence-alert dedup spans BOTH entry points — hourly checker and trap path share one alerted-signature store; (b) divergence records get a one-run grace before drop so batching-lag flaps don't reset `age_days`; (c) `hidden_by_scope` computes held = **not-in-CLOUD_LABS** (not strictly in-HELD_LABS) so unlisted providers (ByteDance Seed, Reka) aren't undercounted if WS3 lands before the WS4 vocab fix — or land the two-line vocab fix first.

## ADR
- **Decision:** Phased remediation (Option A) on existing file-based pipeline + Forgejo alerting; AA-authoritative with cross-source canaries; annex-visibility for pre-admission rows; new AA sub-indices mapped data-layer-only.
- **Drivers:** Aug-16 deadline; proven silent failure modes; content-value gaps (see DR).
- **Alternatives:** hotfix-only (B — insufficient), history-DB rebuild (C — overkill, violates D3 scope) (see invalidation above).
- **Why chosen:** only option satisfying all three drivers under principles 1/2/4.
- **Consequences:** +~4–6 engineer-days; two new tracked generated files (diff, watchlist); alert channel dependency (graceful degradation); SPEC §5 amendment (dead axes deprecated, coding/agentic added).
- **Follow-ups:** UI/UX audit line consumes WS5 data axes; v2 live-data phase revisits Option C; atlas-agent filters can adopt coding/agentic after WS5.

## Follow-up staffing (post-approval)
- **Default:** `$ultragoal` durable sequential execution, ledger per workstream; P0 first as single goal.
- **Parallel option:** `$team` with 2 lanes post-P0 (WS3+WS6 ∥ WS4+WS5); WS1/WS2 single-owner (they touch the same files).
- **Fallback:** `$ralph` persistent single-owner verification loop only if ultragoal unavailable.
- Reasoning levels: WS2 xhigh (price semantics), WS1 high (shell+API), WS3–WS6 standard/high.
- Available agent roster this session: general-purpose (planner/architect/critic roles), Explore (read-only sweeps). Specialist note: route vision/UI follow-ups to kimi k3 via kimi-cli per Simon's routing; GLM 5.3 max sub-agents for audits.
