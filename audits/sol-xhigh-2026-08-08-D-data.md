# Sol@xhigh audit — DATA PIPELINE — llm-3d-viz — 2026-08-08

## Verdict: FAIL (2 CRIT / 10 HIGH / 7 MED / 0 LOW)

## Scope read
Target/source files fully opened: `scripts/refresh-catalog.mjs`, `scripts/expand-aa-multi-effort.mjs`, `scripts/catalog-auto-update.sh`, `scripts/install-catalog-cron.sh`, `scripts/lib/catalog-join.mjs`, `scripts/lib/aa-api.mjs`, `scripts/lib/arena-hf.mjs`, `scripts/lib/openrouter-api.mjs`, `scripts/lib/aa-extract.mjs`, `scripts/enrich-modality.mjs`, `scripts/wire-atlas-nucbox.mjs`, `scripts/export-catalog-snapshot.mjs`, `scripts/catalog-coverage-report.mjs`, `src/data/models.ts`, `src/data/effort-gaps.ts`, `src/data/catalog-scope.ts`, and the imported `src/lib/family-effort.shared.ts`. Context/support inspected: `SPEC.md`, `DESIGN-SYSTEM.md`, `HANDOFF.md`, `package.json`, the validation hook in `vite.config.ts`, relevant tests, and prior fix history. Spot-checked all four requested JSON documents plus `data/aa-api-snapshot.json`, `data/openrouter-snapshot.json`, and `data/atlas-catalog-meta.json`; inspected representative rows and ran structural summaries rather than dumping every row. Tools: `read`, `find`, `search`, four read-only architect lanes, read-only `git show/blame/status`, focused in-memory `node` reproductions, one `npx tsx --eval` validation reproduction, and the coverage reporter to stdout. No source mutation, server, build, test, install, deploy, formatter, commit, or push was run.

## Findings (CRITICAL → LOW)
### [CRITICAL] D01 — The next normal refresh deterministically writes an invalid all-zero context catalog and then fails every build
- **File:** `scripts/lib/aa-api.mjs:84-100`; `src/data/models.ts:151-163`; `vite.config.ts:10-16`; `scripts/expand-aa-multi-effort.mjs:237-243`
- **Evidence:** The mapper emits `// Free API omits context window — 0 signals unknown` followed by `context_length: 0`. The build validator rejects exactly that shape: `if (!Number.isFinite(row.context_length) || row.context_length <= 0) { throw ... }`. The refresh nevertheless executes `fs.writeFileSync(dataPath, ...)` before `npm run build`; Vite calls `validateModels(models)` at build start.
- **Impact:** An in-memory run over the committed AA/OpenRouter snapshots produced 299 admitted rows, 119 default-product rows, and **119/119 with `context_length: 0`**; the real validator returned `Error: models[0] (Gemini 3.5 Flash (high)): context_length is required and must be positive`. Thus the first cron refresh after this fix overwrites the currently valid draft, then build fails; every later refresh repeats. Context is also an actual Atlas predicate (`minContext`), contrary to the mapper comment that it is unused.
- **Fix:** Represent unknown context as `null`, make context consumers fail closed on unknown, and overlay a validated source such as OpenRouter `context_length` where identity is exact. Validate the complete candidate in memory before atomically replacing the draft.

### [CRITICAL] D02 — Canonical refresh can replace the catalog with `[]` and exit successfully; the cron guard runs only after the destructive write
- **File:** `scripts/lib/aa-api.mjs:163-177`; `scripts/expand-aa-multi-effort.mjs:101-113,237-243`; `scripts/refresh-catalog.mjs:16-22`; `scripts/catalog-auto-update.sh:56-74`
- **Evidence:** A successful response with a renamed/missing field becomes `const batch = Array.isArray(json.data) ? json.data : [];` and still returns `{ ok: true, models, ... }`. The fixture path likewise uses `raw.data || []`. Expansion unconditionally writes `scorable` to the source file; `refresh-catalog.mjs` merely forwards the child status. Only the shell wrapper checks `MIN_ROWS`, after expansion has already overwritten the file.
- **Impact:** Concrete input `AA_FIXTURE_JSON` containing `{}` (or HTTP 200 `{results:[...]}`) yields zero mapped/scorable rows, writes `[]`, and exits 0 through `npm run catalog:refresh`. The cron path aborts deployment, but leaves the corrupt draft on disk for a manual deploy/commit. A killed process can also leave truncated JSON because the write is not atomic.
- **Fix:** Reject empty/unexpected response shapes and enforce the row/shrink/schema gates inside expansion before writing. Write draft, gaps, and snapshots to temporary siblings and rename only after the entire transaction validates.

### [HIGH] D03 — Reasoning and effort-name heuristics corrupt live rows in both directions
- **File:** `scripts/lib/aa-api.mjs:63-68,106-108`; `src/lib/family-effort.shared.ts:25-35,41-51`; `data/models.v0.draft.json:223-247,1170-1194,14008-14032`
- **Evidence:** Reasoning is `reasoning: /\b(reason|think|adaptive)/i.test(name)`, which matches the `reason` substring inside **Non-reasoning**. Effort parsing accepts bare words anywhere: `/\bmax\b/`, `/\bhigh\b/`, `/\bmedium\b/`, etc. Shipped examples are `"Qwen3 14B (Non-reasoning)" ... "reasoning": true`, `"Qwen3 Max" ... "family_id": "Qwen3", "effort_tier": "max"`, and `"GPT-5.6 Sol (xhigh)" ... "reasoning": false`.
- **Impact:** Current-data checks found **61/61** explicitly Non-reasoning rows marked true, **59/60** simple parenthetical effort rows marked false, and nine edition names such as Qwen Max/Mistral Medium misparsed as effort tiers. Reasoning filters and TTFT caveats lie; families/trails collapse onto false tiers; 39 two-row families contain only the same `none` tier.
- **Fix:** Parse explicit negation first; treat explicit effort markers as reasoning; use structured provider metadata where available. Limit tier recognition to parentheticals, `* effort`, or slug-terminal tokens—never arbitrary edition words such as “Max” or “Medium”. Add corpus tests for the three shipped rows above.

### [HIGH] D04 — Automatic refresh never applies the available modality overlay; the committed catalog is falsely text-only
- **File:** `scripts/lib/aa-api.mjs:84-90`; `scripts/expand-aa-multi-effort.mjs:189-217,237-243`; `scripts/enrich-modality.mjs:21-49`; `scripts/lib/catalog-join.mjs:170-196`
- **Evidence:** AA mapping hard-codes `modality: ["text"]`. Expansion applies `applyOpenRouterPricing` but never `applyOpenRouterModality` before writing. Modality enrichment exists only as a separate manual writer, and its own message says to re-export the snapshot manually.
- **Impact:** The committed draft has 0 vision/audio/video rows. The committed OpenRouter snapshot contains 249 multimodal entries; applying the existing join in memory attaches non-text modalities to **88 catalog rows**. A query such as “fastest model with vision” therefore reports the axis unsupported or returns nothing despite Gemini/Claude/Qwen multimodal records, and every refresh resets any prior manual enrichment.
- **Fix:** Apply the same exact-identity modality overlay inside the refresh transaction, validate vocabulary/array shape, persist provenance, and include modality coverage in the deploy gate.

### [HIGH] D05 — OpenRouter-derived 7:2:1 cost ignores the API’s cache-read price and can overstate cost by ~2×
- **File:** `scripts/lib/catalog-join.mjs:204-240`; `data/openrouter-snapshot.json:65-91`
- **Evidence:** Pricing reads only `hit.pricing.prompt` and `.completion`; the cache slot falls back to `price_in_per_M` because OpenRouter `input_cache_read` is never copied into `price_cache_per_M`. The committed Muse Spark 1.2 record supplies prompt `0.00000125`, completion `0.00000425`, and `input_cache_read: "0.00000015"`.
- **Impact:** Concrete missing-AA-price row: code emits `(1.25×7 + 1.25×2 + 4.25)/10 = $1.55/M`; the source-supported AA blend is `(0.15×7 + 1.25×2 + 4.25)/10 = $0.78/M`, a **98.7% overstatement** that moves the model off the cost frontier. The live OpenRouter snapshot has 235 models with `input_cache_read`.
- **Fix:** Parse/validate `pricing.input_cache_read`, convert it to $/M, stamp its provenance, and use it in the cache slot; fall back to input only when the cache field is genuinely absent.

### [HIGH] D06 — Optional-source failures are treated as publishable catalogs and silently wipe overlays
- **File:** `scripts/lib/arena-hf.mjs:70-86`; `scripts/lib/openrouter-api.mjs:23-33`; `scripts/expand-aa-multi-effort.mjs:169-217,237-243`
- **Evidence:** Arena failure returns `{ ok:false, entries:[] }`, but expansion simply skips `applyArenaElo` and continues. OpenRouter failure similarly becomes `or.models || []`. Both source mappers initialize overlay fields to null; final `scorable` is still written and deployed. Successful-but-drifted payloads are worse: OpenRouter returns `ok:true, models:[]` when `body.data` is not an array.
- **Impact:** One HF 500, missing `python3/pyarrow`, parquet parse failure, or response-schema rename turns every `arena_elo` null; an OpenRouter failure removes prices/modalities and can drop rows. The row-count guard does not detect same-count Arena loss, so the degraded catalog is built and deployed as “success”.
- **Fix:** When a source is enabled, fail the refresh on fetch/parse/zero-count regressions, or reuse a last-known-good snapshot with explicit stale timestamp/provenance and an age ceiling. Never silently convert source failure into valid empty data.

### [HIGH] D07 — The CLI/MCP snapshot is stale for every row and refresh never updates it
- **File:** `scripts/export-catalog-snapshot.mjs:10-35`; `scripts/expand-aa-multi-effort.mjs:243-280`; `scripts/catalog-auto-update.sh:56-114`; `data/models.v0.draft.json:3-20`; `data/atlas-catalog-snapshot.json:3-20`
- **Evidence:** Snapshot export is a separate copy command, absent from expansion and auto-update. Source Jamba 1.6 Large says `data_date: 2026-08-08`, `tps: 56.33`, `ttft: 1370`, blend `2.6`; snapshot says `2026-08-07`, `55.47`, `1380`, blend `3`.
- **Impact:** A key-by-key comparison found 0 added, 0 removed, but **299/299 rows changed**. CLI/MCP/Atlas consumers serve old speed, latency, cost, reasoning and Arena values while the app imports the new draft. Meta reports only count/export time and has no source hash, so equal count 299 conceals the drift.
- **Fix:** Export snapshot+meta as part of the same validated atomic transaction as the draft, and include source SHA-256/data date that consumers verify.

### [HIGH] D08 — `SKIP_BUILD=1` still deploys stale `dist` and marks the new data hash as successfully deployed
- **File:** `scripts/catalog-auto-update.sh:12-14,98-114,116-167`
- **Evidence:** The documented value is “`SKIP_BUILD=1 scrape only`”, but the code merely skips the build block and then proceeds into rsync/restart/Pages. It finally writes `after_hash` and `{"ok":true,"changed":true,...,"deployed":true}`.
- **Impact:** With changed catalog data and `SKIP_BUILD=1`, the old `dist` is deployed, the new source hash is recorded, and the next normal run sees no change and skips build/deploy. The deployment can remain permanently stale while status says the new hash was deployed.
- **Fix:** Make `SKIP_BUILD` exit before every deployment with `deployed:false`; maintain separate scraped/built/deployed hashes and advance each only after that stage succeeds.

### [HIGH] D09 — The >50% shrink guard compares against the last scrape, not the last successful deployment
- **File:** `scripts/catalog-auto-update.sh:68-85,105-167`
- **Evidence:** `echo "$row_count" >"$STATE_DIR/last-rows"` runs immediately after the guard, before build, rsync, restart, health or Pages success.
- **Impact:** From a last deployed 299 rows, a 160-row scrape drops 46% and passes; if its build fails, `last-rows` is still 160. A later 85-row scrape drops only 46% from 160, remains above `MIN_ROWS=50`, and may deploy—**72% below the last good catalog**. The guard can be bypassed by staged degradation plus any downstream failure.
- **Fix:** Compare to and update a `last-deployed-rows` value only after successful build/deploy/health, while tracking scrape counts separately for diagnostics.

### [HIGH] D10 — Network calls have no deadline or overlap lock, so one stalled response can freeze and stack the cron pipeline
- **File:** `scripts/lib/aa-api.mjs:145-173`; `scripts/lib/openrouter-api.mjs:23-31`; `scripts/lib/arena-hf.mjs:70-83`; `scripts/catalog-auto-update.sh:47-61`; `scripts/install-catalog-cron.sh:20-26`
- **Evidence:** All three clients call bare `fetch(..., { headers })` with no `AbortSignal`; the cron invokes the shell job directly with no `flock`/PID lock. Only the post-deploy health `curl` has `--max-time`.
- **Impact:** A server that accepts the connection and never completes headers/body leaves the job pending with no terminal status. Eight hours later cron starts another writer/build/deployer against the same files; concurrent non-atomic writes can truncate or cross-pair draft/gaps outputs.
- **Fix:** Add bounded abort signals to fetch and parquet/body parsing, a whole-refresh timeout, and a non-blocking singleton lock that records an overlap failure instead of starting a second writer.

### [HIGH] D11 — The `rsync --delete` “safety” check allows destructive roots such as `/root`, `/opt`, and `/srv`
- **File:** `scripts/catalog-auto-update.sh:116-129`
- **Evidence:** The deny-list blocks only `""`, `/`, `/var*`, `/usr*`, `/etc*`, `/home`, `~`, and `$HOME`; it then runs `rsync -az --delete ... "${DEPLOY_HOST}:${DEPLOY_DIST}/"`.
- **Impact:** Concrete misconfiguration `DEPLOY_DIST=/root` passes the guard and deletes remote `/root` contents not present in local `dist`; `/opt`, `/srv`, `/bin`, `/boot`, and other broad paths also pass. This is irreversible remote data loss from the exact condition the comment claims to prevent.
- **Fix:** Replace the deny-list with a strict allow-list/canonical remote check requiring the dedicated `.../sites/llm-3d-viz/dist` path before permitting `--delete`.

### [HIGH] D12 — Empty/invalid price components can become a valid zero or positive blend
- **File:** `scripts/lib/catalog-join.mjs:84-99,204-240`
- **Evidence:** OpenRouter checks only `== null` before `Number(...)`; `Number("") === 0`, so empty strings pass finite/non-negative checks. AA-derived blend checks finite input/output but not non-negativity, and accepts any finite cache value.
- **Impact:** Reproduction with `pricing:{prompt:"",completion:""}` produced input `0`, output `0`, blend `0`; a row with IQ/TPS then passes admission as falsely free and dominates the frontier. Separately cache `-1`, input `10`, output `10` produces positive blend `2`, hiding an impossible negative component.
- **Fix:** Require non-empty numeric source values and every component `>=0` before arithmetic; reject/quarantine the entire price tuple when any supplied component is invalid.

### [MEDIUM] D13 — OpenRouter’s shared pricing/modality identity index can select the wrong organization
- **File:** `scripts/lib/catalog-join.mjs:103-116,129-160`
- **Evidence:** The index registers a bare slug first-wins, candidates try bare `slug` before provider-qualified IDs, names share the same map, and fallback accepts unbounded `id.endsWith(slug)`.
- **Impact:** Concrete rows `foo/model-x` then `bar/model-x`, catalog `{provider:"Bar", slug:"model-x"}` selected Foo’s $1/$2 prices and audio modality instead of Bar’s $10/$20 and vision. No bare collision exists in the current 400-row snapshot, but the next provider collision silently corrupts both cost and modality because both overlays share this matcher.
- **Fix:** Index canonical full IDs separately, derive an explicit provider→OpenRouter organization mapping, require provider-compatible exact matches, remove unbounded suffix/name fallback, and record the matched OpenRouter ID in provenance.

### [MEDIUM] D14 — Missing Arena ratings coerce to Elo 0
- **File:** `scripts/lib/arena-hf.mjs:29-44`; `scripts/lib/catalog-join.mjs:278-329`
- **Evidence:** `const rating = Number(row.rating); if (!Number.isFinite(rating)) return null;` accepts both `null` and `""` because they coerce to zero. Arena attachment accepts finite zero.
- **Impact:** `{model_name:"Model X",category:"overall",rating:null}` reproduced an entry with `rating:0`, which attaches and displays/sorts as a measured Elo instead of missing.
- **Fix:** Reject null/blank and wrong-typed ratings before conversion; enforce a plausible positive Elo range and preserve missing as null.

### [MEDIUM] D15 — AA pagination reports success when `maxPages` truncates a still-open result set
- **File:** `scripts/lib/aa-api.mjs:138-177`
- **Evidence:** The loop ends when `page > maxPages`, but the function unconditionally returns `{ ok:true, models, ... }`; it never checks that the last `pagination.has_more` was false. Pagination values are also not type-validated.
- **Impact:** A mocked two-page cap where both pages returned `has_more:true` produced `{ok:true,count:2,pages:2}` and silently omitted all later models. A real increase beyond 20 pages would publish a truncated catalog unless the coarse shrink guard happened to trip.
- **Fix:** Track the terminal pagination object; if the cap is reached with `has_more:true`, return a fatal truncated result. Validate integer page/boolean `has_more` and deduplicate stable IDs across pages.

### [MEDIUM] D16 — Coverage reporting overstates readiness and multi-effort coverage while omitting the fields currently broken
- **File:** `scripts/catalog-coverage-report.mjs:16-29,46-93`
- **Evidence:** “Present” means only non-null/non-empty; `decide_ready` checks only non-null, not finite/range/admission. Multi-effort counts families with `c >= 2` rows, not two distinct tiers. `KEYS` omits `context_length`, `modality`, `reasoning`, identity uniqueness and invalid-value counts.
- **Impact:** `{aa_intelligence_index:"",tps:"",blended_price_per_M:""}` counts decide-ready even though admission rejects it. On the committed data the report printed **66** multi-effort families; only **27** have at least two distinct tiers, while 39 are duplicate `none`-tier reasoning/non-reasoning pairs. It also gives no warning that the catalog is 100% text-only or that the next refresh maps every context to zero.
- **Fix:** Reuse production admission/schema predicates, count distinct normalized effort tiers, report invalid/duplicate/unknown buckets, and include context/modality/reasoning coverage with regression thresholds.

### [MEDIUM] D17 — Effort-gap output claims no partial cards even when four measured Sonnet tiers exist
- **File:** `scripts/expand-aa-multi-effort.mjs:50-79,245-250`; `data/effort-gaps.generated.json:89-112`; `src/data/effort-gaps.ts:16-19,42-50`
- **Evidence:** `buildEffortGaps` accepts `partialByFamily`, but its only call passes `new Map()`, so `partial_tiers` is always empty. Current gaps show Claude Sonnet 5 missing low/medium/xhigh with `"partial_tiers": []`.
- **Impact:** The committed AA snapshot actually contains Sonnet low, medium, high and xhigh cards with finite TPS and blend but null IQ. The UI’s promised “Cards exist without Intelligence Index” explanation never appears, making a partial-data join look like wholly unpublished efforts.
- **Fix:** Build `partialByFamily` from joined rows rejected only for missing intelligence (record tier/slug/missing axes) before filtering to `scorable`, and pass it into gap generation.

### [MEDIUM] D18 — Build validation covers only the default cloud slice and omits core schema/uniqueness checks
- **File:** `vite.config.ts:8-16`; `src/data/models.ts:106-124,151-209`; `src/data/catalog-scope.ts:78-104`
- **Evidence:** Vite validates `models`, which resolves to default `cloud` scope in the Node build, not `allModels`. `validateModels` never asserts unique model/spine keys, modality array/vocabulary, openness enum, valid release date, finite individual prices, or required source URL/date fields.
- **Impact:** A malformed 2026 held-lab row (for example Mistral with `modality:"text"`, duplicate model ID, or NaN-like wrong type) is excluded from build validation but bundled and exposed by `?catalog=all`; string modality then corrupts enrichment (`new Set("text")` becomes `t,e,x`). Current exact model IDs are unique, so this is a latent gate failure rather than a current duplicate.
- **Fix:** Validate `allModels` against one runtime schema before filtering, including unique stable identity/spine, enum/array shape, all finite/range constraints, and valid calendar dates.

### [MEDIUM] D19 — Committed source hard-codes the forbidden private Tailscale endpoint
- **File:** `scripts/wire-atlas-nucbox.mjs:16-20`; `vite.config.ts:41-44`
- **Evidence:** Both default to a hardcoded private Tailscale IP (redacted) when no environment override exists.
- **Impact:** This violates the explicit no-private-Tailscale-IP repository invariant, leaks internal topology, and causes every external/local clone to target a private host by default. The Vite default is also active without running the wiring helper.
- **Fix:** Remove the address from committed source; require an environment value or use loopback, and keep private routing only in gitignored operator configuration.

## No-findings note
Not applicable: the audit found 19 actionable defects. Verified sound points: for valid finite inputs the AA formula is correctly `(7×cache-hit + 2×input + 1×output)/10`; the divisor is the constant 10, so there is no division-by-zero path, and reasoning tokens are charged through the output-price slot rather than a separate divisor. The current 299-row draft has 299 unique exact `model` strings, every requested required key, numeric-or-null metric types, no empty/negative prices, valid calendar release dates, and no derived-blend arithmetic mismatches. The four requested JSON roots have the expected array/object shapes; expected ladder tiers are non-empty strings; gap families are unique and join current model families. Current draft and gap `data_date` both equal 2026-08-08, but the Atlas snapshot does not match the draft as documented in D07.
