# HANDOFF — llm-3d-viz audit + hardening (2026-08-08)

## Status: ALL 4 Sol@xhigh audits complete. 15 findings patched + deployed. Remaining are lifecycle/edge-case.

## What was done this session

### Sol@xhigh adversarial audit — 4 domains, all FAIL
| Domain | Verdict | Findings |
|--------|---------|----------|
| Data Pipeline | FAIL | 2 CRITICAL, 4 HIGH, 3 MEDIUM |
| Math/Scoring | FAIL | 3 HIGH, 2 MEDIUM, 2 LOW |
| UI State | FAIL | 1 HIGH, 5 MEDIUM, 3 LOW |
| Viz/Rendering | FAIL | 5 HIGH, 5 MEDIUM, 1 LOW |

Reports at `/tmp/audit-{data,math,ui,viz}.out.txt`.

### Patched (15 findings, 6 commits, all live)

**Security & Ops (6 HIGH + 2 Sol-specific):**
1. **Stored XSS** (`console.ts`) — `escapeHtml()` on all catalog-derived innerHTML sinks (model IDs, display names, providers, families, tiers, axis labels, option values)
2. **Boot DoS** (`url-state.ts`) — removed redundant `decodeURIComponent` in `splitList()` + `parseDecideFromParams()` (URLSearchParams already decodes; `%` throws URIError)
3. **TTS credit-burn** (`workers/viz-kyanitelabs-proxy/src/index.js`) — origin allowlist (`viz.kyanitelabs.tech`, `llm-3d-viz.pages.dev` only) + per-IP KV rate limit (10 req/min). Non-allowlisted → 403. KV namespace `TTS_RATE_LIMIT` created.
4. **Empty-catalog auto-deploy** (`catalog-auto-update.sh`) — `MIN_ROWS=50` floor + >50% shrink threshold guard before build/deploy
5. **Pages approval gate** (`catalog-auto-update.sh`) — requires `DEPLOY_PAGES=1` in addition to `CLOUDFLARE_API_TOKEN` + `PAGES_PROJECT` (closes cron auto-publish bypass)
6. **rsync --delete safety** (`catalog-auto-update.sh`) — rejects root/broad `DEPLOY_DIST` destinations

**Data Pipeline (1 CRITICAL + 3 HIGH):**
7. **Cost formula** (`aa-api.mjs`, `catalog-join.mjs`) — correct AA 7:2:1 blend: `(7*cache + 2*input + 1*output) / 10`. Extracts `price_1m_cache_hit_tokens` (available for 209/595 models). Conservative fallback when cache=null. Sol blend: $9.50→$4.35.
8. **Reasoning regex** (`aa-api.mjs`) — dropped trailing `\b` so `(Reasoning)` matches. 49 models now correctly flagged.
9. **Null OpenRouter prices** (`catalog-join.mjs`) — reject null/non-numeric before `Number()` (was `Number(null)===0` → falsely free)
10. **OpenAI xhigh cap** (prior session, retained) — `NON_USER_TIERS` filter, durable across cron

**Math/Scoring (3 HIGH + 1 MEDIUM):**
11. **Atlas empty filter scope** (`query-catalog.ts`, `tools.ts`) — use `ctx.visible` directly, don't fall back to full catalog when `visible=[]`
12. **Decimal anchor floor** (`decide.ts`) — removed `Math.round` from `clampFloor` (IQ 62.5 was rounded to 63, excluding the anchor from its own floor)
13. **isScorable finite guards** (`models.ts`) — `Number.isFinite` checks prevent Infinity/NaN from entering axis domains
14. **URL weight cap** (`url-state.ts`) — clamp each weight to [0,100] (prevents 1e308 → Infinity total → NaN scores)

**Viz/Rendering (1 HIGH):**
15. **Delaunay super-triangle** (`delaunay.ts`) — increased from 4×span to 20×span (fixes incomplete meshes, false hull edges)

### Config reverted
- `~/.gjc/agent/config.yml` `task.agentModelOverrides` → `{}` (was Sol@xhigh for all task agents; spendy default)

### Deployments
- **Cloudflare Pages**: 4 deploys this session, all verified live (`viz.kyanitelabs.tech` HTTP 200)
- **Worker**: deployed 2× with origin allowlist + KV rate limit (verified: non-allowlisted origin → 403, allowlisted → passes)
- **Forgejo origin**: pushed all 6 commits to `simon/llm-3d-viz` main

## Remaining unpatched findings (prioritized)

### HIGH — deferred (lifecycle/structural, lower real-world urgency)
| # | Finding | Files | Impact |
|---|---------|-------|--------|
| V3 | `Stage3DThree.destroy()` leaks listener + scene resources | `stage3d-three.ts:352-383` | Only on stage switch/HMR remount |
| V4 | `SweepScheduler.destroy()` doesn't unsubscribe from store | `sweep.ts:115-143` | Same — stacks schedulers on remount |
| V5 | Plotly stage/projection: no teardown at all | `stage3d.ts:503-513`, `projections.ts:376-462` | Same — leaks WebGL contexts |
| M3 | MoE VRAM uses active params instead of total | `local-vram.ts:50,87` | Qwen3-235B-A22B admitted to 24GB tier |
| D9 | Identity normalization cross-model match | `family-effort.shared.ts:87` | k2-v2 → k2 → Kimi k2 pricing on MBZUAI row |

### MEDIUM — deferred
| # | Finding | Files |
|---|---------|-------|
| D7 | Free API fields asserted as facts (context_length: 128000) | `aa-api.mjs:89`, `catalog-scope.ts:49` |
| D11 | Admission accepts impossible axis values | `catalog-join.mjs:418`, `models.ts:127` |
| D12 | max/xhigh sorted wrong (moot — max removed) | `family.ts:23-24` |
| D10 | Bare "Max" product names → false effort tiers | `family-effort.shared.ts:29` |
| U3 | "None" then one selection → "All" | `filter-shelf.ts:222-270` |
| U4 | Stale share copy with current URL | `main.ts:538-548` |
| U5 | "Multi-effort only" can emit one-row family | `filters.ts:96-139` |
| U6 | Default Decide state round-trips as user-authored | `url-state.ts:130,313` |
| V6 | Hover highlighting destroys Decide/cinema opacity | `stage3d-three.ts:1050-1110` |
| V7 | Absolute Delaunay epsilon rejects valid small triangles | `delaunay.ts:31-34` |
| V8 | Label collision O(n²) per orbit frame | `stage3d-three.ts:231-242` |
| V9 | Point rendering O(n²) scans | `stage3d-three.ts:1002-1004` |
| V10 | Camera APIs accept NaN/Infinity | `stage3d-three.ts:395-430` |
| M4 | Published-precision quantization not decimal-safe | `pareto.ts:12`, `decide.ts:78` |

### LOW — deferred
U7 ageMonths not serialized · U8 month-end age overflow · U9 share text injection · M6 empty shortlist accepted · M7 empty anchor table crash · V11 label NMS pre-clamp + fake width

## Cron state
- `crontab -l` block `# BEGIN llm-3d-viz-catalog-sync` at 06:07/14:07/22:07 local
- Script self-loads `.env` for `AA_API_KEY`
- Empty-catalog guard + Pages gate now active in cron runs
- No reinstall needed (script updated in-place)

## Live verification
- `viz.kyanitelabs.tech` → HTTP 200
- TTS non-allowlisted origin → HTTP 403 ✓
- TTS allowlisted origin → passes (503 if OPENAI_API_KEY not set as Worker secret — it was never set)
- 299 rows, 0 OpenAI max, GPT-5.6 Sol blend = $4.35

## Next steps
1. **Viz lifecycle HIGHs (V3-V5)**: implement `destroy()` teardown for Stage3DThree (remove resize listener, dispose scene resources), SweepScheduler (store + call unsubscribe), and Plotly stage/projections (`Plotly.purge()`). ~200 lines across 4 files.
2. **MoE VRAM (M3)**: parse total params separately from active in `local-vram.ts`.
3. **Identity normalization (D9)**: separate Arena-channel suffix stripping from canonical slug matching.
4. **Worker secret**: set `OPENAI_API_KEY` via `wrangler secret put` if TTS should be live.
