# Session closeout — Pareto membrane + Atlas intelligence + push to both remotes

**Date:** 2026-08-08
**Repo:** `llm-3d-viz` (Forgejo SoT)
**Live:** https://viz.kyanitelabs.tech/
**Status:** Source **landed + pushed** to Forgejo `origin/main` at `a673e51` and GitHub `oss/public` at `7fe32d5`. Production Pages deploy live at `27f2fb4` (verified: membrane visible, `whitePct 1.22%`). Unit tests **271 pass** (32 files). Typecheck + build clean.

---

## 1. What this campaign delivered

### 1.1 Pareto frontier membrane + skirt (`c595528`)

The 3-objective Pareto frontier (cost × speed × intelligence) is genuinely a 2D surface, not a 1D line. The prior ridge tube read as a thin thread. Now frontier vertices are Delaunay-triangulated into a translucent membrane sheet with a faint skirt to the intelligence floor.

| Piece | Path |
|-------|------|
| Zero-dep Delaunay (Bowyer-Watson + hullEdges) | `src/lib/delaunay.ts` (NEW, 136 lines) |
| Membrane + skirt meshes | `src/viz/stage3d-three.ts` (constructor ~L276-305, rebuild ~L1190-1230) |
| Unit tests | `tests/delaunay.test.ts` (8 tests, incl. cocircular hexagon) |
| Regression guard | `scripts/verify-membrane.mjs` (WebGL readPixels whiteout check) |

**Design decision:** hand-rolled Delaunay over `delaunator` to keep runtime deps at three + kokoro-js. Cocircular robustness via 1e-9 in-circle tie-break. The 3-objective front is single-valued over (cost,speed) — no two frontier models share a cost×speed pair — so Delaunay lifts cleanly.

### 1.2 Atlas compositional constraint queries (`149c965`)

Atlas can now answer multi-axis questions like "smartest model under $3/M" or "fastest reasoning model on the frontier" — not just single-intent commands.

| Piece | Path |
|-------|------|
| Query catalog: 15+ filter/rank axes | `src/lib/atlas-agent/query-catalog.ts` (NEW, 398 lines) |
| Compositional branch in offline router | `src/lib/atlas-agent/offline-router.ts` |
| `query_catalog` LLM tool | `src/lib/atlas-agent/tool-dispatch.ts` |
| Extended ModelSummary with capability fields | `src/lib/atlas-agent/tools.ts` |
| Unit tests | `tests/atlas-query.test.ts` (39 tests) |

**Axes:** objective (min_cost/max_speed/max_intelligence), floor, openness, maxPrice, minTps, modality, minContext, reasoning, frontierOnly, minSweBench, minGpqa, provider, excludeProvider, family.

**Honest data-gap handling:** `unsupportedDataAxes`/`dropUnsupportedData` — when the user asks about an axis with no data (e.g. SWE-bench), Atlas reports it honestly instead of inventing.

**Verified live:** "smartest under $3/M" → Qwen3.8 Max / Grok 4.5 / Muse Spark. "Fastest reasoning on frontier" → Claude Sonnet / Fable / Opus.

### 1.3 LLM always-on via NUCBox Unsloth (`c2a66ac`)

Fresh visitors now get the LLM by default (was opt-in only). The NUCBox Unsloth preset (Ornith 35B) is the default on empty localStorage. Explicit config (including disable) is always respected.

| Piece | Path |
|-------|------|
| Default preset on empty storage | `src/lib/atlas-agent/llm-config.ts` |
| 45s timeout + AbortController per-request | `src/lib/atlas-agent/llm-loop.ts` |
| 60s failure backoff (skip dead endpoints) | `src/lib/atlas-agent/controller.ts` |
| Unit tests (incl. backoff test) | `tests/atlas-llm.test.ts` |

**Why 45s not 12s:** a 35B local model with tool-calling needs the budget — 12s aborted real responses. A dead endpoint fails fast at TCP-connect regardless, so a long timeout doesn't hurt fail-fast.

**Headless safety:** the `catch` path (no localStorage = headless/tests) returns disabled DEFAULT, so tests stay offline.

### 1.4 Modality data gap fill (`dbac442`)

Filled vision/audio/video modality from OpenRouter `architecture.input_modalities` (same legal source as pricing, just unused before).

| Piece | Path |
|-------|------|
| `applyOpenRouterModality` (union-only, never downgrades) | `scripts/lib/catalog-join.mjs` |
| Targeted OpenRouter-only backfill script | `scripts/enrich-modality.mjs` (NEW) |
| Catalog re-export | `data/atlas-catalog-snapshot.json` |

**Result:** 91 vision, 23 video, 12 audio models. **NOTE:** SWE-bench/GPQA remain null — no free legal source confirmed.

### 1.5 Filter-control parity (`1ae11ef`)

Atlas can now control family and provider filters with the same vocabulary as the UI.

- `family` constraint + detection ("solo the claude family", "isolate X")
- `provider` constraint ("only anthropic", "hide openai")
- Maps to store patches via `constraintFiltersPatch` in `offline-router.ts`

**Verified live:** "solo the claude family" → `families:['claude opus 5']`. "Only anthropic" → `providers:['Anthropic']`.

### 1.6 UI-action bus (`76960e6`)

View-local controls that aren't store-state are now reachable by the agent via an allow-listed bus.

| Piece | Path |
|-------|------|
| Bus: register/dispatch/list | `src/lib/atlas-agent/ui-actions.ts` (NEW, 68 lines) |
| `ui_actions` field on proposals | `src/lib/atlas-agent/types.ts` |
| Dispatch after store patch | `src/lib/atlas-agent/apply.ts` |
| "reset view/camera/recenter" intent | `src/lib/atlas-agent/offline-router.ts` |
| `ui_action` LLM tool | `src/lib/atlas-agent/tool-dispatch.ts` |
| `reset_view` handler (recenter camera + clear pin) | `src/main.ts` (~L382) |
| Unit tests | `tests/atlas-ui-actions.test.ts` (6 tests) |

### 1.7 Security scrub (`a673e51` + `7fe32d5`)

Found and removed a dead constant (`ATLAS_NUCBOX_UNSLOTH_DIRECT_BASE`) that hardcoded Simon's private Tailscale IP but was never imported. Scrubbed three pre-existing Tailscale IP occurrences from the public `oss/public` branch (`vite.config.ts`, `scripts/wire-atlas-nucbox.mjs`, voice RALPLAN doc).

### 1.8 Push to both remotes

- **Forgejo `origin/main`:** `638cf97..a673e51` (8 commits)
- **GitHub `oss/public`:** `87dbca0..7fe32d5` (merge + scrub commit)

---

## 2. Tests & verification

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | Clean |
| `npm test` | **271 pass** (32 files) |
| `npm run build` | Clean (~14s) |
| Production membrane verify | `whitePct 1.22%`, membrane 20 tris, skirt 12 tris |

---

## 3. Explicit non-goals / still open

| Item | Why open |
|------|----------|
| Public-site always-on LLM | Does the CF Worker forward `/api/atlas/llm` → NUCBox? Needs inspection. Graceful offline fallback works either way. |
| SWE-bench / GPQA data | No free legal source confirmed (AA Pro key exists; free tier hardcodes null). Filter code forward-compatible. |
| `v1.1.0` tag + releases | Ready to cut on request. Not done — Simon hasn't asked. |
| Cosmetic UI actions | Leaderboard expand, effort-step nav. One `registerUiAction` each. |
| Pre-existing decide-mode spec | Fails on baseline `638cf97` too. Not caused by this session. |
| Public HTTP MCP | Needs auth, rate limit. Local stdio is the product path. |

---

## 4. How to run (resume)

```bash
cd ~/workspaces/llm-3d-viz
npm install
npm run dev                    # local + Unsloth proxy if .env.local wired
node scripts/wire-atlas-nucbox.mjs   # once: pull NUCBox key into .env.local
npm test                       # 271 tests
npm run build
# verify production membrane:
CAPTURE_URL="https://viz.kyanitelabs.tech/" node scripts/verify-membrane.mjs
```

---

## 5. Related docs

| Doc | Role |
|-----|------|
| `HANDOFF.md` | Current resume point |
| `docs/deploy/STATUS-2026-08-08.md` | Deploy receipt (this session) |
| `docs/deploy/STATUS-2026-08-07.md` | Deploy receipt (prior session) |
| `docs/agents/dual-repo.md` | Product vs OSS repo model |
| `docs/v1/wayfinder/SESSION-CLOSEOUT-2026-08-07-atlas-agentic.md` | Prior session closeout |

---

## 6. Land receipt

| Field | Value |
|-------|-------|
| Forgejo commit | `a673e51` |
| GitHub commit | `7fe32d5` |
| Date | 2026-08-08 |
| Remotes | Forgejo `origin/main` + GitHub `oss/public` — both pushed |
| Production | `viz.kyanitelabs.tech` — deployed at `27f2fb4`, membrane verified |
| Tree state | Clean; `main` = `origin/main` (0 ahead, 0 behind) |
