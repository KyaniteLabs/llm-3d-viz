# Sol@xhigh audit — UI STATE — llm-3d-viz — 2026-08-08

## Verdict: FAIL  (1 CRIT / 5 HIGH / 6 MED / 3 LOW)

## Scope read
All requested files were read completely: `src/ui/console.ts`, `src/ui/filter-shelf.ts`, `src/ui/atlas-agent-panel.ts`, `src/ui/decide-panel.ts`, `src/ui/membership-table.ts`, `src/ui/stage-guide.ts`, `src/lib/url-state.ts`, `src/lib/share-copy.ts`, `src/lib/display-name.ts`, `src/config/edition.ts`, `src/config/fork-defaults.ts`, `src/config/app-branding.ts`, `src/main.ts`, and `src/state.ts`. Context read: `SPEC.md`, `DESIGN-SYSTEM.md`, `HANDOFF.md`. Supporting data-flow code read: `src/data/models.ts`, `src/lib/{decide,filters,format,provenance,score}.ts`, `src/lib/atlas-agent/{app-tools,apply,controller,kokoro-tts,llm-config,llm-loop,tool-dispatch,types,voice}.ts`, `workers/viz-kyanitelabs-proxy/src/index.js`, `tests/url-state.test.ts`, and `data/models.v0.draft.json`.

Tools run: read/search/find; four read-only adversarial audit lanes; read-only `npx tsx -e` probes for URL round trips, local-catalog membership, and Atlas weight overflow. `npx vitest run tests/url-state.test.ts` was attempted but did not start because the local `vite` package is absent; no test result is claimed. Verified without findings: other audited model/provider/family HTML interpolations use context-appropriate escaping; branding is assigned with `textContent`; TTS text is capped, its paid endpoint is same-origin and worker-origin-allowlisted/rate-limited; no audited interval/observer leak exists in the single-mount path; the three config files are static and in-range.

## Findings (CRITICAL → LOW)

### [CRITICAL] U01 — `families` / `fam` query value reaches `innerHTML` unescaped
- **File:** `src/ui/console.ts:698-700,864-866`
- **Evidence:** `state.filters.families.length === 1 ? \`<p class="preset-outcome">Focused curve · ${state.filters.families[0]} · ...</p>\`` is returned by `leaderboard()`, then assigned by `readout.innerHTML = ... this.leaderboard(...)`. `DecisionConsole` initially holds the full product catalog and `subscribe()` renders immediately, so the non-empty leaderboard branch executes before `main.ts` replaces it with the URL-filtered visible set.
- **Impact:** Exact untrusted string `<img src=x onerror=alert(document.domain)>` from `?families=%3Cimg%20src%3Dx%20onerror%3Dalert(document.domain)%3E` (or `fam=`) becomes the `readout.innerHTML` sink and executes on first paint; it need not match a real family. This is same-origin reflected XSS from a crafted share link.
- **Fix:** Wrap `state.filters.families[0]` with `escapeHtml()` and add a regression test using the exact payload; also reject unknown family/provider IDs at URL ingestion as defense in depth.

### [HIGH] U02 — URL list serializer double-encodes real provider/family names
- **File:** `src/lib/url-state.ts:67-81,285-290`
- **Evidence:** `joinList()` applies `encodeURIComponent(v)` before `URLSearchParams.set()`/`.toString()` encodes the value again, while `splitList()` only splits/trims the once-decoded `get()` result. Probe: `families=["Claude Opus 5"]` serialized as `families=Claude%2520Opus%25205`, then parsed as `["Claude%20Opus%205"]`.
- **Impact:** Refreshing or sharing a selected family silently empties/mangles scope. The live product catalog has affected values in 52/63 families and provider `Z AI`; the copied URL no longer represents the stage.
- **Fix:** Make list encoding symmetric. Minimal compatible change: guarded `decodeURIComponent` per token inside `splitList()` after splitting (preserving encoded commas), then assert `parseShareableState(new URLSearchParams(serializeShareableState(s).toString()))` for spaces, commas, `%`, `+`, and non-ASCII.

### [HIGH] U03 — Local-VRAM stage and scope/navigation UIs use different catalogs
- **File:** `src/main.ts:75-77,227,397,585`; `src/ui/filter-shelf.ts:36,72-94`; `src/ui/console.ts:73-86,175-183`
- **Evidence:** `catalogForFilters()` switches the stage to `allModels` when `vramMaxGb != null`, but both `new FilterShelf(..., models, ...)` and `new DecisionConsole(..., models, ...)` retain the cloud product catalog. Shelf preview/options and console family navigation therefore never see held-out local models.
- **Impact:** A fixed-date probe for Local · 24 GB produced 13 stage models from `allModels` but a shelf preview of 0 from `models`; stage labs were Meta/Mistral/OpenAI while the shelf exposed none. Users see a populated stage with “0 models in draft” and cannot navigate or edit its actual membership.
- **Fix:** Give both controllers the same catalog resolver used by rendering, or add `setCatalog(catalogForFilters(filters))` on VRAM-mode changes; calculate preview, provider/family options, and navigation from that active catalog.

### [HIGH] U04 — Atlas treats a deliberately empty visible set as the full catalog
- **File:** `src/ui/atlas-agent-panel.ts:74-83`
- **Evidence:** `setVisible([])` stores the empty set, but `ctx()` returns `visible: this.visible.length ? this.visible : this.catalog`.
- **Impact:** Select “None” (`providers=["__none__"]`) or any zero-match scope, then ask Atlas for visible metadata/ranking: Atlas receives the full product catalog and can shortlist or focus models explicitly excluded by the UI. Empty-but-initialized is conflated with not-yet-initialized.
- **Fix:** Track a separate `visibleInitialized` flag; after the first `setVisible`, pass `this.visible` verbatim even when empty.

### [HIGH] U05 — Atlas can inject unbounded weights that corrupt scoring state
- **File:** `src/ui/atlas-agent-panel.ts:274-290,335-349`; `src/state.ts:95-128`
- **Evidence:** The panel accepts `validateProposal(p)` and calls `applyProposalToStore`; the store copies `patch.weights` verbatim. The nested weights are not range-validated, and Atlas tool numeric coercion accepts any finite number. Probe: `{speed:1e308,cost:1e308,intelligence:1e308}` passed validation and entered the store; scoring then produced `NaN` for 9/119 model scores because weight totals/numerators overflowed.
- **Impact:** A BYOK/default LLM tool call followed by Apply can make leaderboard ordering, displayed scores, point sizes, and optimum selection invalid. The slider max and URL cap do not protect this ingress path; reload silently canonicalizes to different weights.
- **Fix:** Enforce finite `0..100` weights in the central store boundary and in Atlas proposal validation, reject malformed nested objects, and add overflow/negative tests.

### [HIGH] U06 — Shelf Apply overwrites concurrent and hidden filter fields from a stale draft
- **File:** `src/ui/filter-shelf.ts:16-26,52,58-69`
- **Evidence:** The shelf snapshots every filter into `this.draft`, never subscribes to store changes while open, and later writes `filters: cloneFilters(this.draft)` wholesale—including `openness`, `vramMaxGb`, and `excludeNonReasoning`, which the shelf does not render.
- **Impact:** Open the shelf under cloud defaults, activate “Local · 24 GB” (or let Atlas change scope), then press Apply: the stale draft silently resets VRAM/openness and exits the newly selected mode. Family/age changes from keyboard, table, console, or Atlas can be lost the same way.
- **Fix:** Rebase on current store state and write only fields actually changed by the shelf, or subscribe and surface an explicit conflict/refresh state instead of blind last-writer-wins replacement.

### [MEDIUM] U07 — Concurrent Atlas turns resolve out of order and overwrite newer intent
- **File:** `src/ui/atlas-agent-panel.ts:170-175,274-291,335-350`
- **Evidence:** Every Go/Enter starts `submit()`; there is no request sequence, cancellation, or in-flight guard around `await runAtlasTurn(...)`, and all completions mutate shared `pending`/`undoState` and one proposal box.
- **Impact:** Submit “cinema on” and then “cinema off” while the configured LLM is slow. If the older request resolves last, its low-impact proposal auto-applies after the newer command, leaving the final state opposite the latest intent. Two auto-applies also overwrite the single undo snapshot.
- **Fix:** Assign monotonically increasing turn IDs (and preferably abort the superseded request); ignore stale completions and disable/deduplicate submission while one turn owns the panel.

### [MEDIUM] U08 — Legacy `fam` alias survives canonical serialization and resurrects cleared scope
- **File:** `src/lib/url-state.ts:185-187,253-270`
- **Evidence:** Parsing accepts `fam`, but the serializer deletion list removes `families` and omits `fam`. Probe: clearing families from an existing `fam=Claude+Fable+5&me=0` URL serialized back to `fam=Claude+Fable+5`; reload restored `["Claude Fable 5"]`.
- **Impact:** “Show all” appears to work in the current session, but refresh/share restores the stale legacy family filter. Address bar and UI state disagree.
- **Fix:** Delete `fam` with the other owned keys and emit only canonical `families`.

### [MEDIUM] U09 — Decide floor/bias/anchor are dropped whenever Decide is temporarily off
- **File:** `src/lib/url-state.ts:329-342`
- **Evidence:** Serialization of `floor`, `anchor`, and `bias` is nested entirely inside `if (d.decideMode)`. Probe state `{decideMode:false,floorUserSet:true,intelligenceFloor:73,costSpeedBias:.75,floorAnchorModelId:"Model A"}` serialized to an empty query and reloaded as floor 50, bias 0, no anchor.
- **Impact:** After configuring Decide, turning it off for Explore and copying/reloading loses the setup; re-entering Decide differs from the state the user shared.
- **Fix:** Serialize non-default/user-set Decide fields independently of `decideMode` (while emitting `decide=1` only when active), or explicitly clear them in state when Decide is turned off so behavior is not falsely round-trippable.

### [MEDIUM] U10 — Membership table remains stale after filters change in table mode
- **File:** `src/ui/membership-table.ts:59-75`; `src/main.ts:291-300,571-665`
- **Evidence:** The table renders only when entering table mode. Row click re-renders with the same captured `visible`; double-click changes filters without re-rendering; `renderVisuals()` updates every other surface but not the membership table.
- **Impact:** Open table mode, apply a narrower shelf filter, then close the shelf: rows excluded from the stage remain. Clicking one stores a pinned ID that is not visible, desynchronizing table selection, console, stage highlight, and `window.__viz`.
- **Fix:** Re-render the table from `applyFilters(catalogForFilters(state.filters), ...)` on filter changes whenever table mode is active; never reuse the stale closure after a state mutation.

### [MEDIUM] U11 — Deferred chunk failure rejects `boot()` without a UI error boundary
- **File:** `src/main.ts:161-165,878-881`
- **Evidence:** DOMContentLoaded calls `void boot()` with no rejection handler. The later `await Promise.all([import("./viz/projections"), import("./viz/sweep")])` is unguarded.
- **Impact:** A transient CDN/deploy chunk miss can occur after the 3D stage painted; boot then rejects, linked 2D/sweep and later pointer/Plotly wiring never initialize, and the 4-second paint guard stays silent because visible 3D marks exist. The user gets a deceptively partial, non-interactive product plus an unhandled rejection.
- **Fix:** Catch the top-level boot promise and give deferred enhancements their own failure boundary; render an actionable banner and keep/install core pointer handlers even if projections fail.

### [MEDIUM] U12 — A valid empty scope is reported as a WebGL boot failure
- **File:** `src/main.ts:136-159,304-319,674-685`
- **Evidence:** `renderVisuals()` intentionally publishes `viz.visibleCount = 0` and renders “NO MODELS IN VIEW”, but the timer accepts success only when `n > 0 && h > 40`; it then appends “Stage failed to paint”.
- **Impact:** `?providers=__none__` or any legitimate zero-match filter shows both the correct empty-state guidance and a false hard-failure/reload banner. Reload reproduces it; an actually empty catalog is misdiagnosed rather than handled cleanly.
- **Fix:** Separate renderer readiness from data count. Treat an initialized stage with `visibleCount === 0` as a successful empty render, and test empty catalog plus empty filtered scope.

### [LOW] U13 — Filtered-out anchor disappears from the control while remaining active
- **File:** `src/ui/decide-panel.ts:91-112,209-225`
- **Evidence:** Anchor options are rebuilt only from filtered `this.models`; assigning a current anchor absent from those options sets the `<select>` visually to “— none —”, while state/export retain `floorAnchorModelId` and `floorSource: "anchor"`.
- **Impact:** Filter an anchored Anthropic model out with an OpenAI-only scope: the floor remains anchored and is exported as such, but the only anchor control says none.
- **Fix:** Keep the current product-catalog anchor as a labeled “out of scope” option, or explicitly clear/downgrade the anchor when membership excludes it.

### [LOW] U14 — Console has no teardown; remount double-binds behavior and leaks tooltips/subscriptions
- **File:** `src/ui/console.ts:139-167`
- **Evidence:** The constructor adds persistent root listeners, appends a tooltip to `document.body`, and discards the unsubscribe returned by `store.subscribe`; no `destroy()` exists.
- **Impact:** Constructing a replacement console on the same root leaves both controllers live. One family-chip click can be handled twice (first solos, second sees the new state and toggles back), while each remount retains another body tooltip and subscriber.
- **Fix:** Store listener functions/unsubscribe, expose `destroy()`, remove the tooltip and root listeners, and call teardown before replacement.

### [LOW] U15 — Successful global searches schedule a misplaced duplicate boot-failure timer
- **File:** `src/main.ts:304-319,439-472`
- **Evidence:** A verbatim second `boot-blank-guard` `setTimeout(..., 4000)` sits inside the `if (hit)` branch of the global-search keydown handler, in addition to the intended top-level guard.
- **Impact:** Every successful Enter search allocates another timer and may display a misleading stage-failure banner four seconds after search if layout is transiently zero-height.
- **Fix:** Delete the duplicate block at `454-469`; retain one boot-time guard with the corrected empty-scope condition from U12.
