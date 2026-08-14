# Test spec — data-quality remediation v1

Companion to `.omx/plans/prd-data-quality-remediation-v1.md`. Baseline: 327/327 green (2026-08-14, commit 9bbc16e). Suite-level invariants first, then per-workstream.

## Global invariants (every workstream must hold)
1. `npx vitest run` fully green; no skips added.
2. `npx tsc --noEmit` clean.
3. `CLOUD_SCORABLE_FLOOR` (scorable, default scope) **does not decrease** from visibility/watchlist work (WS3/WS4/WS5 add no scorable rows).
4. Honesty: no new producer writes `aa_intelligence_index`, `tps`, or `ttft` from any non-AA origin (grep-level guard test over `scripts/` remains valid; extend to new files).
5. Draft admission: every admitted row either passes `canAdmitPlotTriple` or arrives via `vetManualRows`-vetted manual path.

## WS1 — diff + alerts *(amended: A1/A3/A4)*
- Unit: `draft-diff.mjs` classify(add | remove | rename(pair) | price_delta>10%) from fixture draft pairs; rename detection via normalizeFamily+provider. Fixtures: (a) Jamba-deprecation, (b) Ling-rename, (c) **manual→AA supersede (GLM-5.3 manual row out, AA row in → rename, NOT cloud-lab removal)**.
- Unit: alert policy matrix — cloud-lab removal fires; held-lab removal doesn't; price Δ 24% no / 26% yes; shrink 4.9% no / 5.1% yes; **one aggregated payload per run regardless of event count; signature dedup across runs**.
- Unit: **silence detection** over status-history file — no `ok:true` for 24h → fire; `lock` overlap entries never count as failure; recent `ok:true` → no fire; empty history → no fire.
- Unit: **independent silence-check script** (`scripts/catalog-silence-check.sh`) — reads history, fires exactly the same alert path, exits 0 on healthy history; testable standalone without the main pipeline. **Dedup is shared across both entry points** (hourly checker + trap path write one alerted-signature store; persistent silence → one issue total, not 24/day).
- Integration: forced-failure trap path — `catalog-auto-update.sh` with `SKIP_BUILD=1 SKIP_DEPLOY=1` + induced failure (e.g. bad AA fixture) → alert attempted, non-fatal when `FORGEJO_TOKEN` unset (loud-log + exit code preserved).
- Unit: alert payload includes local-notification side-effect call (mocked osascript invocation shape).

## WS2 — divergence canary + cache truth *(amended: A2/A3/A5)*
- Unit: canary fixtures — (a) AA/OR agree → zero records; (b) V4-Pro-style 3× disagreement → record per side with ratio; (c) **level-high but delta-flat (same ratio as previous run) → recorded, NOT alerted**; (d) delta-changed (ratio moved vs previous gaps doc) → alerted.
- Unit: **divergence aging + flap grace (WS2 records)** — record carries `first_seen` + `age_days`; age >7 days persists across runs (not re-alerted, still present, counted for the weekly review line); absent exactly one run then reappearing keeps original `first_seen` (age_days continuity); absent two+ runs → dropped cleanly.
- Unit: canary state lives in gaps doc (`price_divergences` with previous-ratio carry); **assert `last-status.json` is never written by expand** (single-writer invariant).
- Unit (stage 3, separate commit): cache AA=0 + OR=0.028 → blend uses OR cache, stamped `openrouter/list`; both absent → input-fallback stamp `aa/derived` (distinguishable).
- Unit: `price_cache_per_M` provenance present on every row where the field is non-null (fixture sweep); **P0: `price_cache_per_M` key in Model sources union + `FIELD_SHORT` label (inspector-friendly from day one)**.
- Regression: existing C1 tests pass; sources-agree case byte-stable vs pre-change expected blends.
- Live check (P0 exit): post-2026-08-16 AA refresh → gaps doc carries DeepSeek delta records; blends match AA's new list prices; **calibration baseline committed as an artifact (`data/effort-gaps.generated.json` state at baseline, commit message marked) so git ordering mechanically proves stage-3 landed after the baseline cycle**.

## WS3 — awaiting-measurement annex *(amended: report-only default)*
- Unit: AA fixture with known buckets (n no-TPS, n no-IQ, n price-only) → `awaiting_measurement` lists exactly those, with family/provider/release_date/missing-axis/slug. **No draft rows emitted by default.**
- Unit: `NON_USER_TIERS` counter names Sol/Luna/Terra max drops on current fixture.
- Unit (only if probe passes ≤40 + product confirms): emission uses the **imported scope module** (fixture: moving a lab between lists changes emission without pipeline edits — no re-hardcoded lists); `incompleteModels()` renders them in a jsdom console render; non-cloud annex rows never emitted.
- Count check: scorable count unchanged before/after annex (visibility ≠ admission).
- Unit: **`hidden_by_scope` report (H4 visibility half)** — fixture draft → counts + notable names of floor-hidden cloud rows and held-lab 2026 rows; **held is computed as not-in-CLOUD_LABS** (unlisted providers like ByteDance Seed count as held even pre-WS4-vocab-fix); asserts zero draft rows added, zero scope constants touched; D-H4 decision item remains open (presence check in HANDOFF fixture).

## WS4 — watchlist + scope
- Unit: watchlist aging — announced_date + no-AA-family for N days → gaps-doc entry with day count; GLM-5.3 manual row supersede keeps watchlist entry satisfied (no false "missing").
- Unit: scope exhaustive lint — current draft providers each in exactly one list; fixture adding an unknown provider fails the test with a named message (ByteDance Seed + Reka listed in HELD).
- Lint: stale 119/47 comment gone (`models.ts` docblock matches computed count pattern).

## WS5 — secondary axes
- Unit: mapper — coding_index/agentic_index mapped with null passthrough; range guard rejects >100/<0 fixture rows loudly at validation (or clamps to null — per implementation note, prefer reject+log).
- Unit: `time_per_index_task_s` measured value preferred by `taskTimeInfo` (existing function switches from `(est.)` label to measured label).
- Schema: `validateModels` accepts new fields + provenance keys; type-union round-trip fixture compiles (tsc).

## WS6 — schema/provenance + telemetry
- Unit: `FIELD_SHORT` covers every key the pipeline can stamp (test enumerates producer stamps vs label map — no raw field names in inspector output).
- Unit: arena failure persistence — counts by code + top-N names written to gaps doc from fixture entries (incl. `arena_no_family` case).
- Unit: OR overlay telemetry — context/modality match/unmatched histogram from fixture (M3 visibility, no behavior change).
- Regression: ladders refresh keeps existing 9 families' entries intact; new families' expected_tiers validated against draft-published tiers (no invented tiers — only observed + curated notes).

## WS7 — hygiene
- Snapshot dedupe: build output unchanged semantically (`atlas-catalog-meta.json` still truthful); tsc/tests green.

## Observability acceptance (whole plan)
- Simulated end-to-end P0 scenario (fixture: DeepSeek-style AA price update + one vanished cloud row): one run produces — updated blends, ≥1 **delta** divergence record, ≥1 diff entry (price + removal), **exactly one aggregated alert payload** (with local-notification side-effect), clean exit 0 without Forgejo token.
- Failure-path scenario: induced pipeline crash → trap-path alert attempt; scripted 24h history with zero `ok:true` → silence alert fires once.
