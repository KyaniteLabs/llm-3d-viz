# Sol@xhigh audit — MATH / SCORING — llm-3d-viz — 2026-08-08

## Verdict: FAIL  (1 CRIT / 2 HIGH / 6 MED / 2 LOW)

## Scope read
- Required context: `/tmp/audit-shared.md`, `SPEC.md`, `DESIGN-SYSTEM.md`, `HANDOFF.md`.
- Primary scope: `src/lib/decide.ts`, `src/lib/pareto.ts`, `src/lib/delaunay.ts`, `src/lib/filters.ts`, `src/lib/intelligence-task-anchors.ts`, `src/lib/family-effort.shared.ts`, `src/lib/family.ts`, `src/lib/local-vram.ts`.
- Data-flow/caller scope: `src/data/models.ts`, `src/lib/score.ts`, `src/lib/url-state.ts`, `src/lib/axis-metrics.ts`, `src/lib/atlas-agent/app-tools.ts`, `src/lib/atlas-agent/apply.ts`, `src/lib/atlas-agent/tool-dispatch.ts`, `src/main.ts`, `src/ui/console.ts`, `src/ui/decide-panel.ts`, `src/viz/palette.ts`, `src/viz/projections.ts`, `src/viz/stage3d-three.ts`, `scripts/lib/catalog-join.mjs`.
- Contracts/tests read: `docs/research/frontier-math.md`, `.omx/plans/prd-decide-mode-v1.md`, `docs/v1/wayfinder/RALPLAN-decide-mode-v1.md`, `docs/v1/wayfinder/prototype-decide-mode.md`, and the focused Decide/Pareto/Delaunay/score/filter/anchor/family/VRAM/URL tests.
- Tools run: read/search/find; read-only `node -e` and `npx tsx -e` numeric counterexamples; seeded Delaunay topology fuzzing; current-catalog family/VRAM probes; `git show` of prior math patches; official Meta Llama 4 specification lookup. Focused Vitest was attempted but could not start because `vite` is absent (`ERR_MODULE_NOT_FOUND`); no packages were installed and no source was mutated.
- Verified while hunting adjacent defects: AA blend is `(7*cache + 2*input + output)/10`, null/non-finite price inputs are rejected before that derivation, the reasoning regex recognizes `reason|think|adaptive`, URL `w=` components are finite/non-negative and capped at 100, URL floor/bias are clamped, Pareto direction signs are correct, and zero cost is epsilon-floored in value-score/axis paths.

## Findings (CRITICAL → LOW)
### [CRITICAL] M001 — One finite extreme metric overflows the log domain and makes tick generation non-terminating
- **File:** `src/data/models.ts:127-136`; `src/lib/axis-metrics.ts:269-278,349-360,419-421,457-464`
- **Evidence:** `model.tps !== null && Number.isFinite(model.tps)` / `Number.isFinite(model.blended_price_per_M)` admits every finite magnitude; mapped-axis admission is `if (v === null || Number.isNaN(v)) return false;`; log padding is `max = max * Math.max(logPad, 1.06);`; tick generation is `for (let e = e0; e <= e1; e++) {`.
- **Impact:** With one normal row at cost `1` and one bad-but-finite row at `Number.MAX_VALUE = 1.7976931348623157e308`, `isScorable(bad) === true`. The padding is `10^((log10(MAX)-0)*0.07) = 3.782945540365725e21`; `MAX * padding === Infinity`; therefore `e1 = ceil(log10(Infinity)) === Infinity` and the synchronous tick loop never terminates. A single catalog value can hard-freeze the default stage; `price_in`/`price_out` mapping has the same path, and those fields even admit literal `Infinity` because `hasMappedAxes()` rejects NaN but not other non-finite values.
- **Fix:** Require `Number.isFinite(v)` in mapped-axis admission and raw-domain collection; compute padding in log space with a finite exponent cap (or clamp before exponentiation); make `niceLogTicks()` reject non-finite bounds and impose a finite iteration bound.

### [HIGH] M002 — The patched Bowyer–Watson super-triangle still deletes valid real triangles and leaves membrane holes
- **File:** `src/lib/delaunay.ts:19-44,78-114`
- **Evidence:** `const span = Math.max(maxX - minX, maxY - minY) || 1;`, `const delta = 20 * span;`, `let tris: Tri[] = [{ a: n, b: n + 1, c: n + 2 }];`, then `if (t.a >= n || t.b >= n || t.c >= n) continue;`.
- **Impact:** For ordinary S=1-scale points `[[0.36,-0.39],[-0.97,0.57],[0.12,0.20],[0.53,0.07]]`, point 2 is inside the 3-vertex hull, so a complete planar triangulation has `2n-2-h = 3` triangles. `delaunay2d()` returns only `[[0,1,2],[0,2,3]]`: summed area `0.3825` versus hull area `0.3875`, with the missing `[1,2,3]` area `0.005`. `hullEdges()` consequently labels edges through the interior point as the skirt boundary. A second non-collinear S=1 input `[[-0.47,0.24],[-0.36,0.27],[0.45,0.49],[0.87,0.62]]` has hull area `0.0073` but returns `[]`, blanking the entire membrane. Seeded general-position fuzzing found 123 incomplete triangulations in 2,000 point clouds. The final absolute `area < 1e-12` check also makes the same triangle scale-dependent: `[[0,0],[1e-7,0],[0,1e-7]]` returns `[]` although the unit-scaled triangle returns one face.
- **Fix:** Replace the home-grown triangulator with a robust maintained Delaunay implementation, or normalize to unit coordinates and enforce topology/area invariants (`T=2n-2-h`, triangle-area sum equals hull area) before accepting output; do not treat “inside the finite super-triangle” as proof that stripping super-connected faces preserves the real hull.

### [HIGH] M003 — Llama 4 MoE specials feed active parameters into a total-weight VRAM gate
- **File:** `src/lib/local-vram.ts:43-75,78-105`
- **Evidence:** `if (/\bLlama\s*4\s+Scout\b/i.test(name)) return 17;` and `if (/\bLlama\s*4\s+Maverick\b/i.test(name)) return 17;`; total parsing ends with `return parseParamsBillions(modelName);`; fit uses `const paramsB = parseTotalParamsBillions(modelName);` and `return paramsB <= tier.maxParamsB + 1e-9;`.
- **Impact:** Current catalog rows produce `parseTotalParamsBillions("Llama 4 Scout") === 17`, `parseTotalParamsBillions("Llama 4 Maverick") === 17`, and `fitsLocalVram(name, 24) === true` for both. Meta specifies Scout as 109B total and Maverick as 400B total; Q4 weights alone are about `109*0.5 = 54.5 GB` and `400*0.5 = 200 GB`, before runtime/KV overhead. The Local · 24 GB intent therefore recommends two models that cannot fit by roughly 2.3× and 8.3×.
- **Fix:** Give `parseTotalParamsBillions()` total-specific Scout/Maverick values (109/400) before the active-size fallback, and add regression tests asserting both fail every consumer tier; change the tier copy that still says “MoE active” to “MoE total stored parameters.”

### [MEDIUM] M004 — Weight safety exists only at URL parsing; Atlas can overflow the value-score with finite weights
- **File:** `src/lib/score.ts:107-115`; `src/lib/atlas-agent/app-tools.ts:215-245`; `src/lib/atlas-agent/apply.ts:83-88`; `src/lib/atlas-agent/tool-dispatch.ts:477-490`
- **Evidence:** Atlas returns `weights: opts.weights`, apply does `patch.weights = { ...p.weights } as ScoreWeights`, and score math uses `const total = Math.max(0, weights.speed) + Math.max(0, weights.cost) + Math.max(0, weights.intelligence);` followed by weighted products divided by `total`.
- **Impact:** Atlas input `{speed:1e308,cost:1e308,intelligence:1e308}` is JSON-finite, but total weight is `Infinity`. For normalized rows `low={speed:0,cost:1,intelligence:0}` and `high={1,0,1}`, correct equal-share scores are `1/3` and `2/3`; production returns `0` and `NaN` (`Infinity/Infinity`). The console share math also becomes NaN and score readouts can display `NaN`; the renderer demotes the non-finite score to its minimum size, reversing the intended visual signal.
- **Fix:** Add one canonical weight sanitizer (finite, non-negative, per-component cap) at the state/tool boundary and defensively inside `composite()`; use it for URL, sliders, presets, Atlas proposals, and direct store updates.

### [MEDIUM] M005 — `isScorable()` finite guards still admit physically invalid speed and Index values into Decide
- **File:** `src/data/models.ts:126-137`; `src/lib/decide.ts:66-90`; `src/ui/decide-panel.ts:247-257`
- **Evidence:** Admission is `model.tps !== null && Number.isFinite(model.tps)` and `model.aa_intelligence_index !== null && Number.isFinite(model.aa_intelligence_index)` with no range comparisons; Decide does `if (!isScorable(model)) return false;`; its chart evaluates `Math.log10(s + 0.1)`.
- **Impact:** A single row `{tps:-1, blended_price_per_M:1, aa_intelligence_index:60}` yields `isScorable === true`, `shortlistFromDecide([row],50,0,3).shortlist === [row]`, and chart `log10(-0.9) = NaN`; it is exported as rank 1 despite impossible speed. A row with `tps:10, index:101` is likewise recommended. `validateModels()` would reject these, but it is not invoked on module load/build and cannot defend these public helpers or later catalog mutation paths.
- **Fix:** Make `isScorable()` enforce `tps >= 0` and `0 <= aa_intelligence_index <= 100` (plus current finite/null/price checks), then reuse that single admission rule everywhere.

### [MEDIUM] M006 — “Decimal-safe” rounding is not magnitude-aware and changes Pareto membership
- **File:** `src/lib/pareto.ts:10-31`; `src/lib/decide.ts:76-85`
- **Evidence:** `const factor = 10 ** decimals;` followed by `return Math.round((value + Number.EPSILON) * factor) / factor;`.
- **Impact:** `roundTo(10.075,2)` returns `10.07`, not the intended published-cent value `10.08`. With A `(speed=100,cost=10.075,index=80)` and B `(100,10.074,80)`, B should be at 10.07 and dominate A at 10.08. Production rounds both to 10.07, so `dominates(B,A) === false` and `frontier([A,B])` incorrectly returns both rows. The same helper controls Decide’s cost×speed Pareto.
- **Fix:** Use magnitude-aware decimal rounding (for non-negative metrics, add `Number.EPSILON * Math.max(1, Math.abs(value))` before scaling, or use a tested exponent-shift helper) and add 10.075 plus current derived-price half-cent regressions.

### [MEDIUM] M007 — Invalid anchor metrics are converted into plausible floors and falsely labeled as anchor-derived
- **File:** `src/lib/decide.ts:51-54,141-145`; `src/ui/decide-panel.ts:91-107,131-148`
- **Evidence:** `if (!row || row.aa_intelligence_index === null) return null; return clampFloor(row.aa_intelligence_index);`; dropdown admission is `.filter((m) => m.aa_intelligence_index != null)`; `clampFloor()` says `if (!Number.isFinite(n)) return DEFAULT_INTELLIGENCE_FLOOR;`.
- **Impact:** For an anchor row named `bad`, Index `-7` produces floor `0`, `101` produces `100`, and `NaN`/`Infinity` each produce `50`. The UI then stores `floorAnchorModelId="bad"` and `floorSource="anchor"`, so export claims a measured anchor established a number that was actually clamped/defaulted. That violates Decide’s fail-closed provenance contract.
- **Fix:** `floorFromAnchor()` must return `null` unless Index is finite and within `[0,100]`; apply the same predicate to dropdown and URL anchor resolution. Clamp only user-entered floors, never source data.

### [MEDIUM] M008 — Arena model-key effort extraction is dead on the exact path meant to use it
- **File:** `src/lib/family-effort.shared.ts:115-140`; `src/lib/family.ts:45-48`
- **Evidence:** `hasToken` includes `/-(xhigh|max|high|medium|low|minimal)\b/i.test(modelKey)`; the first gate is `if (!hasToken && (effort === "none" || effort === "default")) { effort = "unspecified"; }`; the fallback is `if (keyEffort && effort === "unspecified") { effort = keyEffort[1].toLowerCase(); }`.
- **Impact:** `parseArenaIdentity({modelDisplayName:"Acme Pro", modelKey:"acme/acme-pro-max", rating:1500})` returns `effort_tier:"none"`; downstream `effortRank` is `0` instead of max rank `5`. A max-effort leaderboard row is sorted as the lowest rung and can join/rank against the wrong AA effort variant.
- **Fix:** Derive `hasToken` from display name only, or allow `keyEffort` to replace `none/default/unspecified`; add key-only cases for every tier.

### [MEDIUM] M009 — Unclamped age math lets an Atlas-supplied number empty or silently disable the catalog
- **File:** `src/lib/filters.ts:70-79,91-124`; `src/lib/atlas-agent/app-tools.ts:83-105`; `src/lib/atlas-agent/tool-dispatch.ts:153-169,444-447`
- **Evidence:** Filter math is `filters.ageEnabled ? monthsBefore(referenceDate, filters.ageMonths) : null`, `d.setUTCMonth(d.getUTCMonth() - months)`, then `if (!released || released < cutoff) return false;`; Atlas begins `const cleaned: Partial<ModelFilters> = { ...patch };` and only conditionally deletes invalid `vramMaxGb`.
- **Impact:** At reference `2026-08-08`, `ageMonths=-6` computes a future cutoff near `2027-02-08` and the current product catalog result drops from 80 valid six-month rows to `0`. Finite `ageMonths=1e308` creates an Invalid Date and returns all 85 age-unfiltered rows, silently disabling an enabled age gate. URL parsing caps this field, but Atlas bypasses that guard.
- **Fix:** Validate centrally as a finite integer in `[1,60]` before date arithmetic and reject invalid Atlas proposals; make `monthsBefore()`/`applyFilters()` fail deterministically rather than compare against Invalid Date.

### [LOW] M010 — `minimal` and `low` share an effort rank despite the documented “minimal below Low” order
- **File:** `src/lib/family.ts:17-27,50-67,74-90`
- **Evidence:** The rank table contains `low: 1` and `minimal: 1`; the documented drop rule says `effort_tier minimal (below Low)`; group ordering falls through to `a.model.localeCompare(b.model)`.
- **Impact:** With the user-visible non-reasoning filter disabled, the current GPT-5 family orders numerically as `low:1 -> minimal:1 -> medium:2 -> high:3`; alphabetic tie-breaking puts minimal after low, so the effort trail goes backward before rising. A numeric rank intended to encode effort is instead decided by spelling.
- **Fix:** Give `minimal` a distinct rank below `low` (and shift later ranks if integer ranks are desired); add a full ordered-ladder test including minimal.

### [LOW] M011 — Decide ranks with clamped bias but exports reasons from the raw bias
- **File:** `src/lib/decide.ts:56-59,97-124,200-242,249-264`
- **Evidence:** Ranking starts `const b = clampBias(bias);`; response reasons use `opts.bias < -0.25 ? "bias_cheap" : opts.bias > 0.25 ? "bias_fast" : "bias_balanced"`.
- **Impact:** With `bias=Infinity`, the request serializer and ranking both clamp to `0` (balanced), yet `buildDecideResponse()` emits `reasons:["on_pareto","bias_fast"]`. The JSON says the shortlist used fast bias when the numeric authority used balanced weights.
- **Fix:** Clamp once in `buildDecideResponse()` and use that same value for ranking, request output, and reason labeling.

## No-findings note
Not applicable — the audit fails on the findings above.
