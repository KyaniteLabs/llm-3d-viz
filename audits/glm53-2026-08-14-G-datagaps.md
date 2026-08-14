# Data-gaps audit — llm-3d-viz catalog pipeline (GLM-5.3, 2026-08-14)

Auditor: GLM-5.3 (GJC critic/architect) · Read-only audit; only this file written.
Scope: full data-integrity review of the catalog pipeline feeding the speed×cost×intelligence stage, with special attention to the upcoming DeepSeek price change (~2026-08-16) and the Aug 8→14 silent vanish of 7 rows.

Method: read SPEC.md / DESIGN-SYSTEM.md refs / ADR-0001 / catalog-refresh.md + all pipeline and UI data code; ran read-only `node` analysis against `data/models.v0.draft.json` (307 rows), `data/aa-api-snapshot.json` (608 rows, 2026-08-14), `data/openrouter-snapshot.json` (411 models), `data/effort-gaps.generated.json`, git history, and `logs/`. No scrape, no network, no builds.

---

## Executive summary

**Verdict: the pipeline's honesty core is solid (no invented numbers, atomic writes, fail-closed guards), but the instrument is quietly blind on four fronts: (1) a cache-price=0 defect is putting materially wrong costs on the stage today for 8 rows including 4 DeepSeek rows — exactly the family about to reprice; (2) half of AA's raw rows (301/608) never reach the draft and nothing tells the operator which notable models are stuck there (192 are awaiting only a TPS measurement); (3) the two price sources already contradict each other ~3× on DeepSeek and nothing reconciles or alerts; (4) row removals/renames pass completely silently (proven by the 7-row vanish and the 6-day cron stall nobody noticed).**

Key counts (all computed, not estimated):

| Measure | Value |
|---|---|
| Draft rows (`data/models.v0.draft.json`) | 307 |
| Default product scope (CLOUD_LABS + floor ≥ 2026-01-01) | 127 |
| Raw AA snapshot rows | 608 |
| Raw rows dropped before draft | 301 (49.5%) |
| … of which missing only TPS (IQ+price present) | 192 |
| … of which TPS+price present, missing IQ | 4 (all Claude Sonnet 5 adaptive tiers) |
| … complete triple dropped by tier policy | 3 (GPT-5.6 Sol/Luna/Terra `max`) |
| Fields 100% null in draft | `gpqa`, `swe_bench`, `aider_pct`, `time_per_index_task_s`, `null_reason` |
| `arena_elo` null | 248/307 (80.8%); only 30/127 in default scope |
| `context_length` null | 191/307 (62.2%); 50/127 known in scope |
| `cost_per_index_task_usd` null | 179/307 (58.3%) |
| `price_cache_per_M` null / zero | 138 null (45%) + **8 zeros** |
| AA `coding_index` available but unmapped | 159/307 draft rows (90/127 in scope) |
| AA `agentic_index` available but unmapped | 136/307 draft rows (83/127 in scope) |
| Draft rows hidden by release floor | 150 (41 notable cloud rows from Sep–Dec 2025) |
| Held-lab 2026 rows invisible in default scope | 30 (22 labs) |
| Providers in neither CLOUD_LABS nor HELD_LABS | ByteDance Seed, Reka AI |
| Rows vanished Aug 8→14 (silently) | 7 (verified via git 0d9fe50→eb94789) |
| Rows added Aug 8→14 | 15 |
| Multi-effort families missing from ladders doc | 22 (ladders doc frozen 2026-08-08) |

---

## CRITICAL

### C1. Cache-price `0` flows into the 7:2:1 blend → up to 2.75× understated cost on the stage (8 rows, 4 in default scope, 4 of 6 DeepSeek rows)

`applyAaDerivedBlend` (`scripts/lib/catalog-join.mjs:84-103`) computes `blended = (7·cache + 2·in + 1·out)/10`. Cache gets **70% of the weight**. The guard at `catalog-join.mjs:92-94` accepts any finite cache price ≥ 0 — including `0`:

- AA reports `price_1m_cache_hit_tokens: 0` for **DeepSeek V4 Flash 0731, DeepSeek V4 Pro (all 3 tiers), Sapiens AI Agnes 2.5 Pro Alpha, Xiaomi MiMo-V2.5 ×3**.
- For DeepSeek V4 Flash 0731 the stage plots **$0.056/M blended**. With the null-cache fallback (cache=input) it would be $0.154/M — a **2.75× difference decided solely by whether AA emitted `0` vs `null`**.
- Cross-source contradiction: OpenRouter lists `deepseek/deepseek-v4-flash-0731` cache-read at $0.028/M (not 0) and `deepseek/deepseek-v4-pro` at $0.0986/M where AA says 0 — strong evidence AA's `0` is a placeholder/unmeasured sentinel, not a real "free cache" price. For `deepseek-v4-pro-0813` the two sources disagree 11× on cache ($0.04 vs $0.0036).
- The rows are re-derived every run and re-stamped `blended_price_per_M: aa/derived` (`catalog-join.mjs:100`), so the wrong value is *consistently, freshly* wrong.
- `price_cache_per_M` carries **no provenance stamp at all** (not in `mapAaApiModel` sources at `scripts/lib/aa-api.mjs:112-120`, not in `stampAaMeasured` at `catalog-join.mjs:384-400`, not even in the `Model["sources"]` key union at `src/data/models.ts:66-77`) — despite feeding 70% of the X axis.

Why CRITICAL: this is wrong-or-misleading data on the stage today, concentrated in DeepSeek — the family whose announced ~2026-08-16 price change makes the cost axis the live question. If DeepSeek's new cache price is non-zero and AA keeps emitting 0 (or updates late), the DeepSeek cluster sits dramatically off-frontier with no provenance trail explaining why.

Fix sketch: treat cache `0` as suspect — when OR cache-read exists and disagrees, or when cache==0 while in>0, fall back to input-price (conservative) or use OR cache with `openrouter/list` provenance; always stamp `price_cache_per_M` provenance.

---

## HIGH

### H1. 301/608 AA rows (49.5%) never reach the draft, and the drop is invisible to the operator

Breakdown of the 301 dropped rows (slug-matched against draft):

| Bucket | Rows | Meaning |
|---|---|---|
| IQ ✓, price ✓, **TPS missing** | 192 | measured-but-not-yet-timed — the "awaiting AA" pool |
| IQ ✓ only (no TPS, no price) | 93 | index published ahead of everything else |
| **TPS ✓, price ✓, IQ missing** | 4 | Claude Sonnet 5 adaptive low/medium/high/xhigh |
| nothing measured | 7 | e.g. Gemini 3 Deep Think, GPT-5.5 Pro (xhigh) |
| price only | 2 | |
| **complete triple, dropped by policy** | 3 | GPT-5.6 Sol/Luna/Terra (max) — `NON_USER_TIERS` (`scripts/expand-aa-multi-effort.mjs:278-285,288`) |

Notable current models stuck in the awaiting-measurement pool (invisible in the product): **Muse Spark 1.2 (xhigh)** (rel 2026-08-05, IQ 56.8), **GPT-5.5 Instant** (IQ 34.3), **Grok 4.20 0309** (both reasoning + non-reasoning), **DeepSeek V4 Flash Reasoning (high/max) + Non-reasoning**, **GLM-5-Turbo**, **GLM 5V Turbo**, **Qwen3 Max Thinking**, **Gemini 3 Deep Think**, **GPT-5.4 Pro (xhigh)** (price only), plus fresh 2026-08-12 releases **K-EXAONE 2.0 0803, Solar Open2 250B, A.X-K2, Motif 3 (IQ 47.4)**.

Visibility surfaces that should carry this and don't:
- `data/effort-gaps.generated.json` — only 5 gap entries, all derived from the 9-family ladders doc + 2 heuristics; the 192-row awaiting-TPS pool is absent (D17 `partial_tiers` at `expand-aa-multi-effort.mjs:345-362` only captures rows missing *only* IQ, i.e. the mirror image of the dominant bucket — the Claude Sonnet 5 case — not the TPS-missing case).
- `logs/catalog-coverage.txt` — describes the *draft's* nulls, never the pre-admission drop; written to gitignored `logs/` (`catalog-auto-update.sh:134-139`), human-read only.
- No "dropped rows" report, no log line naming dropped notable models.

### H2. GLM-5.3 and ByteDance Seed 2.1 Turbo: no watchlist for announced-but-unmeasured models; Seed is also unlisted in scope vocabulary

Confirmed absent from the AA snapshot (608 rows): no GLM-5.3, no Seed 2.1 (only `Seed-OSS-36B-Instruct` and `Doubao Seed Code` exist). So the pipeline *cannot* show them — that's honest — but:

- There is no **expected-models watchlist** (the ladders file is per-family effort tiers, not arrival expectations). Nothing will tell Simon "Z.ai shipped GLM-5.3 four days ago and AA still hasn't measured it" — it requires remembering.
- **ByteDance Seed is in neither `CLOUD_LABS` nor `HELD_LABS_FOR_LATER`** (`src/data/catalog-scope.ts:11-23,53-76`; Reka AI likewise). When Seed 2.1 Turbo is eventually admitted it will be invisible in the default scope *and* untracked by the held-labs vocabulary — a scope-list drift with no lint keeping the two lists exhaustive against the draft's actual providers.

### H3. Price-source divergence is unbounded, unalerted, and the overlay is fill-only — the DeepSeek Aug-16 change will silently pick a winner

Trace of the price-change path (asked explicitly):

1. **No stale-artifact path.** Every run rebuilds from scratch: `loadAaModels` (`scripts/expand-aa-multi-effort.mjs:107-138`) live-fetches AA (fixture only under `AA_FIXTURE_JSON`, which cron never sets); `mapAaApiModel` re-reads prices; `blended_price_per_M` starts `null` each build (`scripts/lib/aa-api.mjs:101`) so `applyAaDerivedBlend` re-derives it and re-stamps `aa/derived` provenance every run. Hash change → rebuild → rsync → restart (`scripts/catalog-auto-update.sh:127-132,157-201`). ✅ Correct.
2. **But the OpenRouter overlay can never propagate a price *change*** — `applyOpenRouterPricing` fills only missing sides (`scripts/lib/catalog-join.mjs:235-239` early-returns when in/out/blend all present). Since AA supplies in/out for 100% of admitted rows, OR prices are currently cosmetic (0 price overlays this build; all 188 OR stamps are context_length 116 + modality 72). Whichever source updates first after DeepSeek's cut, the other is ignored forever.
3. **The sources already disagree ~3× today**: AA says V4 Pro 0.43/0.87 while OR says 1.168/2.336; AA says V4 Pro 0813 1.32/3.96 while OR says 0.435/0.87. No divergence metric, log line, or status flag exists. When the Aug-16 change lands, the operator has no way to notice which source reflected it, or that they now disagree more.
4. Secondary staleness: `cost_per_index_task_usd` is AA-*measured* under whatever prices were live at measurement time; a list-price cut does not recompute it, so the task-economy basis will mix new list prices with old measured cost/task for a while (honest per provenance, but worth a caveat in the UI).
5. Note on `changed` semantics in `.cache/catalog-sync/last-status.json`: `data_date` is re-stamped to *today* on every row each run (`aa-api.mjs:93`), so the draft hash changes at least daily → `changed:true` → daily rebuild+deploy even with zero data movement. "Changed" means bytes-changed, not data-changed.

### H4. Scope invisibility: 30 held-lab 2026 rows, 2 unlisted providers, and a release floor that cuts mid-generation

- **30 rows across 22 held labs** are 2026-current but invisible in the default product scope: Ling 3.0 Flash/Tiny + Ring-2.6-1T (InclusionAI), Mistral Small 4 / Medium 3.5, Step 3.7 Flash, Thinking Machines Inkling (xhigh), Upstage Solar Pro 3/4, Cohere Command A+, IBM Granite 4.1, Xiaomi MiMo-V2.5(-Pro), LongCat 2.0, Mercury 2, etc.
- **Release floor hides 150/307 draft rows**, including 41 notable cloud rows from Sep–Dec 2025: the entire Claude 4.5 family incl. **Claude Opus 4.5**, GPT-5.1/5.2 (incl. xhigh), **Gemini 3 Flash Preview (2025-12-17 — two weeks shy of the floor while Gemini 3.7 Flash shows)**, Kimi K2 Thinking, GLM-4.6/4.7, MiniMax-M2.1, Nemotron 3 Nano 30B. The floor is a deliberate product decision (`catalog-scope.ts:32`), but it severs generational context: comparisons like "3.7 Flash vs 3 Flash" or "GPT-5.6 vs GPT-5.2" are impossible in the default view while `?catalog=all` still hides everything pre-2026.

### H5. Silent vanish of 7 rows Aug 8→14 — no diff/alert surface exists (and `scripts/catalog-diff.ts` does not exist)

Verified by git diff `0d9fe50`→`eb94789` (299→307): vanished = Jamba 1.6 Large/Mini, Jamba 1.7 Large (AI21 deprecations), HyperNova 60B 2605 (Multiverse), Ling-3.0-flash (renamed → "Ling 3.0 Flash"; rename = remove+add under spine key), NVIDIA Nemotron 3 Super 120B A12B (Reasoning) (renamed → "Nemotron 3 Super…"), DeepSeek V4 Flash (Non-reasoning) (still in AA snapshot but lost its TPS measurement → no longer admissible).

- The only shrink guards are gross-count gates at >50% (`expand-aa-multi-effort.mjs:312-327`; `catalog-auto-update.sh:117-124`). A 2.3% shrink sails through; nothing records *which* rows left.
- `src/lib/catalog-diff.ts` is the **browser** localStorage ignition diff; `main.ts:209-219` uses only `newIds` ("N new since DATE") — `removedIds` is computed and never displayed, and it's per-visitor, not operator telemetry.
- The refresh commit message ("refresh catalog to 2026-08-14 (307 rows)") does not mention the vanish; the operator learned about it from manual inspection.

---

## MEDIUM

### M1. SPEC §5's switchable intelligence axes are dead schema while AA publishes two usable sub-indices that the mapper drops

`gpqa`, `swe_bench`, `aider_pct` are hard-coded `null` on the API path (`scripts/lib/aa-api.mjs:104-106`; the old HTML path `mapAaRow` at least mapped gpqa). Meanwhile the AA free API actually exposes, per the snapshot:
- `artificial_analysis_coding_index` — non-null for **220/608** raw, **159/307** draft rows, **90/127** default-scope rows;
- `artificial_analysis_agentic_index` — non-null for **154/608** raw, **136/307** draft, **83/127** scope rows;
- `performance.median_end_to_end_response_time_seconds` — unmapped, though it could make `time_per_index` *measured* instead of the current TTFT+1000/TPS estimate (`src/lib/axis-metrics.ts` ECONOMY_BASIS "task" labels the axis "(est.)" because 0/307 rows have measured wall time).

SPEC §5 promises "switchable `arena_elo`/`gpqa`/`swe_bench`/`aider_pct`". Reality: only `arena_elo` exists (19.2%), and it is not even in `AxisMetricId` — the atlas-agent honestly declines SWE/GPQA filters (`src/lib/atlas-agent/query-catalog.ts:374-385`), which is correct but confirms the dead surface.

### M2. Arena Elo coverage is thin and match failures evaporate

389 arena entries → 88 attaches (23% match rate) → only **59 survive admission** (30 in default scope, 24% of 127). Failure codes (`arena_no_family`, `arena_no_tier_match`, `arena_ambiguous_family` — `catalog-join.mjs:312-378`) are logged to stdout only (`log_sample` of 8 in the build summary); not persisted to `effort-gaps.generated.json` (which stores only `arena.ok/entries/attaches/error`). Which 330 arena models failed to match, and why, is unrecoverable after the run.

### M3. `context_length` 62% null despite the OR overlay; silent match failures

191/307 unknown (only 50/127 known in scope). `applyOpenRouterContext` (`catalog-join.mjs:493-509`) fills only exact matches from `matchOpenRouterModel` (`catalog-join.mjs:152-187`), whose `PROVIDER_TO_ORG` map (`catalog-join.mjs:132-145`) covers 12 labs — missing ByteDance, Reka, Amazon, Microsoft, StepFun, Tencent, InclusionAI, Xiaomi, AI21, Cohere, IBM, Upstage, etc. Unmatched rows are not counted or logged (no analog to arena logs), so nobody knows whether 62% null is fundamental or a fixable matching gap.

### M4. Effort-ladder tracking is stale and under-declared

`data/expected-effort-ladders.json` is frozen at 2026-08-08 with 9 families. The draft now has **31 multi-effort families**; 22 are untracked, including every new-this-week family (Gemini 3.7 Flash low/med/high, Grok 4.6, Muse Glimmer, DeepSeek V4 Pro 0813) and long-standing ladders (GPT-5.5 five tiers, GPT-5.4 ×3, Claude Opus/Sonnet 4.6-4.8, GLM-5.2, Gemini Grok 4.3, Nova 2.0, gpt-oss). `effort-gaps.generated.json` therefore reports only 5 gaps (Fable 4 missing tiers; Sonnet 5 4 missing + 4 partial; 3 heuristic singletons). Biggest genuine holes: **Claude Fable 5** max-only, **Claude Sonnet 5** missing low/medium/xhigh IQ (partial tiers correctly recorded), **Grok 4.6 / Muse Glimmer** high-only, **DeepSeek V4 Pro 0813** max-only.

### M5. `null_reason` + incomplete-models UI is dead code; vocabulary never exercised

The draft has zero rows with `null_reason` (admitted rows are complete by construction), so: `validateModels`' rule "excluded rows require null_reason" (`src/data/models.ts:236-242`) can never fire; `incompleteModels()`/`incompleteAxisCoverage()`/`AXIS_REASON_LABELS` (`models.ts:276-285,303-346`), though wired into `src/ui/console.ts:657`, always render empty. The frontier-math §5.2 per-axis reason vocabulary (`not_measured`/`unpublished`/`not_applicable`) exists in exactly one place and is never written by any producer. Either the pipeline should emit a "known, awaiting measurement" annex (see H1) or this UI surface should be retired.

### M6. Provenance schema drift: type union, unstamped fields, unused kinds

- `Model["sources"]` origin union is `"aa" | "arena" | "openrouter"` (`src/data/models.ts:75`) but the data's dominant origin is **`aa-api`** (1663 stamps) — accepted by the runtime validator (`models.ts:253`) yet impossible to express in the declared type. The JSON import is cast (`models.ts:108`), so the compiler never catches it.
- The sources key union omits `price_cache_per_M`, `context_length`, `modality`, `cost_per_index_task_usd` even though the data carries stamps for the latter three (188 stamps) — and `price_cache_per_M` has **no stamp anywhere** (see C1). `FIELD_SHORT` in `src/lib/provenance.ts:24-34` lacks the same keys, so the inspector falls back to raw field names ("context_length: OpenRouter (list)").
- `kind: "derived_list_blend"` is declared in three places (`models.ts:75,256-260`; `catalog-join.mjs:274-279`; `provenance.ts:21`) with **0 occurrences** in the current draft (OR price overlay attached nothing). Declared-but-unused.
- Semantics note: origin `aa` now only ever means "derived by our pipeline from aa-api inputs" (all 307 blend stamps); both `aa` and `aa-api` render identically as "Artificial Analysis" in the UI (`provenance.ts:10-15`), which is fine for display but makes the two origins indistinguishable to the analyst.

### M7. Observability holes: no failure alerting (the 6-day cron stall proved it), coverage report unread, raw inputs unversioned

- The Aug 8–14 stall: 18+ cron runs aborted at the lock (`logs/catalog-cron.stdout`: "flock: command not found" → "already running (overlap)" every 8h for 6 days). Every failure dutifully wrote `ok:false,stage:lock` to `last-status.json` — and nothing read it. There is no notification channel (no push, email, or Forgejo-issue filed by the script), even though the repo has an issue-tracker skill/API documented.
- `logs/catalog-coverage.txt` is regenerated every run into a gitignored dir; no threshold, no diff-vs-yesterday, nobody is tasked to read it.
- Raw inputs (`data/aa-api-snapshot.json`, `data/openrouter-snapshot.json`, arena parquet) are gitignored — the only longitudinal record of what AA *used to* publish is the previous draft commits. The 7-row vanish is reconstructible only via git archaeology.
- GPT-5.6 max-tier drops (H1 bucket) are policy-intentional but uncounted in any output; the build summary prints `partials_in_memory` but not tier-filtered rows.

---

## LOW

- **L1.** Stale comment at `src/data/models.ts:147-152`: "currently ~47 from 119" — actual default-scope scorable is 127. Test thresholds bind to `CLOUD_SCORABLE_FLOOR` so behavior is fine; the number in the comment misleads readers.
- **L2.** `data/atlas-catalog-snapshot.json` is a byte-identical copy of the draft (446KB duplicated and committed; `expand-aa-multi-effort.mjs:396`). If it is an export artifact, it could be generated on demand rather than tracked.
- **L3.** `time_per_index` axis is hardcoded `available: true` (`src/lib/axis-metrics.ts`) while 0% of rows have measured wall time — honest via the "(est.)" label, but `available` no longer means "dataset carries this metric".
- **L4.** `mapAaApiModel` openness heuristic (`scripts/lib/aa-api.mjs:67`) guesses "open" from name keywords on the free tier (no open-weights flag); e.g. a closed model named "…OSS…" would mislabel. Coverage report shows open 39 / closed 268 — plausibly mislabeled at the margins.
- **L5.** Repo-root screenshot clutter (`tmp-*.png`, `tmp-look/`) predates this audit; no data impact.

---

## Lane-by-lane reference

**1. Null rates (draft, N=307).** 100% present: `aa_intelligence_index`, `tps`, `ttft`, both price sides, `blended_price_per_M`, `release_date`, `reasoning`. Null: `gpqa`/`swe_bench`/`aider_pct`/`time_per_index_task_s`/`null_reason` 100%; `arena_elo` 80.8%; `context_length` 62.2%; `cost_per_index_task_usd` 58.3%; `price_cache_per_M` 45.0% (+8 zeros). Product-relevant per SPEC §5: cost/speed/intelligence core fully covered (by admission design); `ttft` used as selectable axis and in task-time estimate; `arena_elo`, `cost_per_index_task_usd`, `context_length` partially covered with visible honesty (coverage badge, `src/lib/provenance.ts:97-109`); gpqa/swe/aider/time-measured are dead schema (M1).

**2. Scope.** See H4. CLOUD_LABS=11 labs (236 draft rows; 127 after floor). HELD_LABS=22 labs (66 draft rows; 30 post-floor). Unlisted: ByteDance Seed, Reka AI.

**3. Admission blind spots.** See H1/H2. GLM-5.3 and Seed 2.1 Turbo confirmed absent from the AA snapshot itself (not a pipeline bug — but no watchlist, H2).

**4. Freshness/DeepSeek.** See C1 + H3. Verdict: no stale-price path in the artifact (verified rebuild-from-scratch, blend re-derivation, provenance re-stamp); risks are source-lag divergence (H3), fill-only overlay (H3), stale measured cost/task, and the cache=0 defect (C1). Rename/deprecation: no diff surface (H5); `scripts/catalog-diff.ts` does not exist.

**5. Effort ladders.** See M4. Ladder families vs draft: Fable 5 max-only (missing low/med/high/xhigh); Sonnet 5 have {max,high} (missing low/med/xhigh/none; partials recorded); Opus 5, Sol/Luna/Terra, Gemini 3.5 Flash, DeepSeek V4 Pro, Kimi K3 complete. 22 families untracked.

**6. Schema/provenance.** See M1/M5/M6 + C1 provenance note.

**7. Observability.** See M7/H5.

---

## Recommendations (ranked)

1. **Fix the cache=0 blend defect before the DeepSeek repricing lands (~Aug 16).** Treat cache `0` as suspect; cross-check OpenRouter `input_cache_read`; prefer conservative input-price fallback when sources disagree or one is 0; stamp `price_cache_per_M` provenance. (C1)
2. **Add an operator-side row diff + one alert channel.** A pipeline step diffing previous vs new draft by spine key (with fuzzy rename detection), logged and filed as a Forgejo issue or push notification on any removal/rename; alert on repeated cron failure (the 6-day stall must never be silent again); consider lowering the human-ack threshold for shrink from 50% to ~5%. (H5, M7)
3. **Map AA `coding_index`/`agentic_index` (and `median_end_to_end_response_time_seconds`) into the schema** with honest provenance — it delivers most of SPEC §5's promised switchable-intelligence value with zero new sources, and makes the task-time axis measured for 159/136 rows. (M1)
4. **Surface the pre-admission drop:** add an "awaiting measurement" annex to `effort-gaps.generated.json` (rows missing exactly one triple element, esp. the 192 awaiting TPS) plus an announced-models watchlist (GLM-5.3, Seed 2.1 Turbo first entries). (H1, H2)
5. **Price-divergence canary:** when AA and OR matched-model prices diverge >25%, log it, flag it in `last-status.json`, and show it in the inspector. Directly de-risks the Aug-16 change. (H3)
6. **Reconcile scope vocabulary:** add ByteDance Seed + Reka AI to HELD_LABS (or CLOUD), add a test that every draft provider appears in exactly one list; refresh `expected-effort-ladders.json` (22 missing families); fix the `Model.sources` origin union to include `aa-api` and the missing field keys; update the stale 119/47 comment. (H2, M4, M6, L1)
7. **Decide the fate of dead surfaces:** either emit `null_reason`-carrying annex rows so the per-axis incomplete UI lives, or delete `incompleteModels`/`AXIS_REASON_LABELS` dead paths; drop or populate `gpqa`/`swe_bench`/`aider_pct`. (M1, M5)
