# HANDOFF — llm-3d-viz

**Last updated:** 2026-08-08 (membrane + Atlas intelligence + push — all shipped to both remotes + production)

## What this is

Interactive **3D LLM benchmark visualization** (speed × cost × intelligence). Three.js stage, Pareto frontier **membrane** (2-objective surface), multi-effort trails, Decide mode, Atlas decision agent with **compositional queries** + **always-on LLM**, shareable URL state.

- **Repo (Forgejo SoT):** https://git.kyanitelabs.tech/simon/llm-3d-viz
- **OSS (public MIT):** https://github.com/KyaniteLabs/llm-3d-viz (`oss/public` branch)
- **Live:** https://viz.kyanitelabs.tech/
- **Run:** `npm install && npm run dev`
- **Tests:** `npm test` (271 unit tests, 32 files)

## Current state (2026-08-08) — resume here

**Everything pushed and deployed.** Local `main` = `origin/main` = `a673e51`. `oss/public` = `7fe32d5` on GitHub. Production deployed to `viz.kyanitelabs.tech` (Cloudflare Pages main, commit `27f2fb4`).

### This session's commits (all on `origin/main` + `oss/public`)

| Commit | Summary |
|--------|---------|
| `c595528` | Pareto frontier membrane + skirt — true 2-objective surface (zero-dep Delaunay) |
| `149c965` | Atlas compositional constraint queries (filter+rank over 15+ axes) |
| `c2a66ac` | LLM always-on via NUCBox Unsloth (Ornith 35B) + fail-fast resilience |
| `dbac442` | Modality data gap fill from OpenRouter (91 vision / 23 video / 12 audio) |
| `1ae11ef` | Filter-control parity (solo family, only/hide provider) |
| `76960e6` | UI-action bus — agent parity for view-local controls (reset_view etc.) |
| `2a4c8a3` | Membrane whiteout regression guard script |
| `a673e51` | Remove dead constant leaking private Tailscale IP (security scrub) |

### Gates (all green)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | Clean |
| `npm test` | **271 pass** (32 files) |
| `npm run build` | Clean (~14s; chunk-size warning cosmetic/pre-existing) |
| Production membrane verify | `whitePct 1.22%` (healthy; whiteout ≈50%) |

## Key architecture (this session)

### Pareto membrane (`src/lib/delaunay.ts` + `stage3d-three.ts`)
The 3-objective Pareto front is genuinely 2D. Delaunay triangulation over (cost,speed) projection, lifted by y=intelligence. Zero-dependency Bowyer-Watson (cocircular-robust via 1e-9 tie-break). `membraneMesh` (translucent, opacity 0.12, depthWrite false, renderOrder 2) + `skirtMesh` (hull→floor, additive, renderOrder 1). Spine tube kept on top.

### Atlas compositional queries (`src/lib/atlas-agent/query-catalog.ts`)
15+ filter/rank axes: objective (min_cost/max_speed/max_intelligence), floor, openness, maxPrice, minTps, modality, minContext, reasoning, frontierOnly, minSweBench, minGpqa, provider, excludeProvider, family. Honest data-gap handling (`unsupportedDataAxes`/`dropUnsupportedData`). Wired into `offline-router.ts` (fires on ≥2 axes) + `tool-dispatch.ts` (`query_catalog` LLM tool).

### LLM always-on (`llm-config.ts` + `llm-loop.ts` + `controller.ts`)
Default preset: NUCBox Unsloth (Ornith 35B, same-origin `/api/atlas/llm/v1`, apiKey "proxy"). 45s timeout (35B + tool-calling needs budget). 60s failure backoff (skips dead endpoints). Headless/no-localStorage stays disabled (tests stay offline).

### UI-action bus (`src/lib/atlas-agent/ui-actions.ts`)
`registerUiAction`/`dispatchUiAction` allow-listed bus for view-local controls. `reset_view` registered in `main.ts` (recenter camera + clear pin). Extensible: leaderboard expand, effort-step nav, etc.

## Still open (parked — do not pretend done)

| Item | Notes |
|------|-------|
| **Public-site always-on LLM** | Does `viz-kyanitelabs-proxy` Worker forward `/api/atlas/llm` → NUCBox? If not, public site gracefully falls back to offline (current behavior). Needs Worker inspection. |
| **SWE-bench / GPQA data** | Still null (0/302). Need confirmed legal source (AA Pro? official leaderboards?). Filter code is forward-compatible — lights up when data lands. |
| **`v1.1.0` tag + releases** | Membrane + Atlas + modality are notable enough for a minor bump. Ready to cut on request. Forgejo API release + `gh release create`. |
| **Cosmetic UI actions** | Leaderboard `<details>` expand, console effort-step nav — one `registerUiAction` each. |
| **Pre-existing decide-mode spec** | `tests/decide-mode.spec.ts` "Decide mode v1" aria assertion fails on baseline `638cf97` too — NOT caused by this session. |
| CF Managed robots AI blocks | Zone-level; `llms.txt` still live |
| Public HTTP MCP | Local stdio only; needs auth + rate limit |

## Quick commands

```bash
npm run dev
npm test                              # 271 unit tests
npx tsc --noEmit                      # typecheck
npm run build                         # ~14s
npm run catalog:coverage
npm run atlas:cli -- meta

# verify production membrane (deterministic pixel check):
CAPTURE_URL="https://viz.kyanitelabs.tech/" node scripts/verify-membrane.mjs

# deploy (operator): npx wrangler pages deploy dist --project-name=llm-3d-viz --branch=main --commit-dirty=true
```

### NUCBox Atlas LLM (local only)

```bash
node scripts/wire-atlas-nucbox.mjs   # writes .env.local (gitignored)
npm run dev                          # proxy /api/atlas/llm → NUCBox:8890
# UI: Atlas → NUCBox Unsloth (default preset)
```

## Dual-repo model

- **Product SoT:** Forgejo `origin` only. Push is approval-gated.
- **Open source:** GitHub `oss` remote, `oss/public` branch. Intentional publish only — scrub private IPs/secrets before push.
- See `docs/agents/dual-repo.md`.

## Agent docs

- Issues: `docs/agents/issue-tracker.md`
- Domain: `docs/agents/domain.md`
- Dual-repo: `docs/agents/dual-repo.md`
- MCP requirements: `docs/agents/mcp-cli-api-api-requirements.md`

## Session history

- 2026-08-08 (this session): `docs/v1/wayfinder/SESSION-CLOSEOUT-2026-08-08-membrane-atlas-push.md`
- 2026-08-07: `docs/v1/wayfinder/SESSION-CLOSEOUT-2026-08-07-atlas-agentic.md`
