# Session closeout — Atlas agentic site + SEO/GEO + MCP/CLI + data honesty

**Date:** 2026-08-07  
**Repo:** `llm-3d-viz` (Forgejo SoT)  
**Live:** https://viz.kyanitelabs.tech/  
**Status:** Source **landed** on Forgejo `origin/main` at commit `e38f57a` (2026-08-07). Production Pages deploy was already live from earlier in the campaign and HTTP-smoke green 2026-08-07; not re-deployed in this land pass. Unit tests **207 pass**. Production Ultra QA was **11/11** earlier in the campaign (not re-run in this pass).

---

## 1. What this campaign delivered

### 1.1 Product / Decide surface

| Deliverable | Where |
|-------------|--------|
| Local VRAM tier intents (8 / 12 / 24 GB) | `src/lib/local-vram.ts`, filters, console intents |
| Non-reasoning effort rungs off by default | `fork-defaults.ts` `excludeNonReasoningDefault` |
| Y-axis intelligence **task callouts** outside cube | `intelligence-task-anchors.ts` + Three stage labels |
| **Decide** shortlist / floor / bias | existing + Atlas apply path |

### 1.2 Atlas agent (decision surface, not pure chat)

| Piece | Path |
|-------|------|
| Pure catalog tools | `src/lib/atlas-agent/tools.ts` |
| Full-app control tools | `src/lib/atlas-agent/app-tools.ts` |
| Offline NL router | `src/lib/atlas-agent/offline-router.ts` |
| LLM tool loop (OpenAI + Anthropic **protocols**, any host) | `llm-loop.ts`, `tool-dispatch.ts` |
| BYOK config (localStorage only) | `llm-config.ts` |
| NUCBox Unsloth preset + Vite same-origin proxy | `ATLAS_PRESET_NUCBOX_UNSLOTH`, `vite.config.ts`, `scripts/wire-atlas-nucbox.mjs` |
| Host apply + undo | `apply.ts`, `atlas-agent-panel.ts` |
| Host-owned impact gating | `shouldAutoApplyProposal()` in `types.ts` |
| Voice: Kokoro free neural TTS + Web Speech STT | `kokoro-tts.ts`, `voice.ts` |
| UI dock | `src/ui/atlas-agent-panel.ts` |

**Commands Atlas understands (offline, examples):**  
`floor 50` · `floor from Claude` · `cheapest eligible` · `why is X out` · `cinema on/off` · `pin <model>` · `open weights only` · `local 12 gb` · `task economy` · `reset scope`

**Apply policy:** navigation (cinema, pin, economy) auto-applies; floor / filter wipes require **Apply**. Model-supplied `auto_apply` cannot force high-impact writes.

### 1.3 SEO / GEO / AIEO

| Asset | Path |
|-------|------|
| Meta, OG, Twitter, JSON-LD, noscript | `index.html` |
| `robots.txt`, `sitemap.xml` | `public/` |
| `llms.txt`, `llms-full.txt`, `about.md` | `public/` |
| OG image PNG + SVG | `public/og-image.png`, `og-image.svg` |
| Link headers / content-types | `public/_headers` |

**Deployed** to Cloudflare Pages production (2026-08-07). Verified live:

- `/llms.txt` → `text/plain`
- `/about.md` → `text/markdown`
- `/og-image.png` → `image/png`
- `/sitemap.xml` → `application/xml`

**Caveat:** Cloudflare **Managed** robots may still prepend AI-crawler Disallows at the zone layer; content discovery via `llms.txt` still works.

### 1.4 CLI + MCP (local)

| Command | Purpose |
|---------|---------|
| `npm run atlas:cli -- meta\|search\|get\|eligible\|rank\|floor\|compare` | Read-only catalog tools |
| `npm run atlas:mcp` | stdio JSON-RPC MCP server |
| `npm run catalog:snapshot` | `data/atlas-catalog-snapshot.json` |
| `npm run catalog:coverage` | Field null-coverage report |

Snapshot IDs use product FNV `cat_*` (`catalogSnapshotIdSyncForTests`). CLI `get` missing model → exit **2**.

MCP client sketch:

```json
{
  "command": "npx",
  "args": ["tsx", "bin/atlas-mcp-server.ts"],
  "cwd": "/path/to/llm-3d-viz"
}
```

`ATLAS_MCP_FULL=1` exposes UI-control tools (proposals only; no remote store).

### 1.5 Data honesty (P0)

| Piece | Path |
|-------|------|
| Coverage stats (pure) | `src/lib/catalog-coverage.ts` |
| Coverage CLI | `scripts/catalog-coverage-report.mjs` |
| Provenance + Arena + est. task time | `src/lib/provenance.ts` |
| Inspector / tooltip / method strip | `console.ts`, `main.ts` |
| Task axis labeled **(est.)** | `axis-metrics.ts`, economy chip `s/task≈` |
| Auto-update hook | `catalog-auto-update.sh` → `logs/catalog-coverage.txt` |

**Catalog truth (302 rows, 2026-08-07):** IQ/TPS/price **100%**; cost/task **39%**; Arena **19%**; measured task wall time / GPQA / SWE / Aider **0%**.

### 1.6 Cinema UX fixes (root-caused in Ultra QA)

| Bug | Fix |
|-----|-----|
| Cinema hid inspector → Atlas disappeared; users stuck | Floating inspector shell for Atlas only |
| Pointerenter auto-exit after layout reflow | Removed; use FAB / Atlas / key **C** |
| Exit FAB not descendant of `.app-shell` | `html.is-cinema` class + CSS |

### 1.7 Deploy

| Surface | Result |
|---------|--------|
| CF Pages `llm-3d-viz` production | Deployed 2026-08-07 (multiple redeploys for fixes) |
| Custom domain `viz.kyanitelabs.tech` | Worker → Pages; SEO assets live |
| VPS rsync | Attempted; connection flaky — public path is Pages |

Receipt: `docs/deploy/STATUS-2026-08-07.md`

---

## 2. Tests & Ultra QA evidence

| Gate | Result |
|------|--------|
| `npx vitest run` | **207** tests pass |
| CLI/MCP smoke tests | `tests/atlas-cli-mcp.test.ts` |
| Host apply safety | `tests/atlas-apply.test.ts` (`shouldAutoApplyProposal`) |
| Coverage / provenance | `tests/catalog-coverage.test.ts` |
| Production Playwright Ultra QA | **11/11** (reduced-motion: no-preference) |
| Screenshot | `docs/v1/wayfinder/ultraqa-prod.png` |

---

## 3. Explicit non-goals / still open

| Item | Why open |
|------|----------|
| Public HTTP MCP on viz domain | Needs auth, rate limit, host; stdio is the local product |
| CF Managed robots AI allow-list | Zone dashboard / Content Signals, not only `public/robots.txt` |
| GPQA / SWE-bench / Aider fills | Need careful leaderboard joins; do not invent |
| Measured Index-task wall time | Free AA API has no field; estimate remains disclosed |
| Open-weight density + VRAM metadata | Separate enrichment pipeline |
| Full SPA control (3D/2D/table tabs, global search chrome) | Decision surface only; wording updated |
| GitHub OSS mirror | Intentional separate tip; **not** an auto-mirror of Forgejo `origin/main` |
| VPS origin | Pages is public path; VPS rsync was flaky |

---

## 4. How to run (resume)

```bash
cd ~/workspaces/llm-3d-viz
npm install
npm run dev                    # local + Unsloth proxy if .env.local wired
node scripts/wire-atlas-nucbox.mjs   # once: pull NUCBox key into .env.local
npm run catalog:coverage
npm run atlas:cli -- rank --floor 50 --objective min_cost
npm test
npm run build
# public (approval-aware ops; already done 2026-08-07):
# npx wrangler pages deploy dist --project-name=llm-3d-viz --branch=main --commit-dirty=true
```

---

## 5. Related docs

| Doc | Role |
|-----|------|
| `docs/agents/mcp-cli-api-requirements.md` | MCP/CLI architecture + status |
| `docs/v1/wayfinder/RALPLAN-atlas-agent-voice.md` | Atlas ralplan |
| `docs/v1/wayfinder/LEARNINGS-2026-08-07-atlas-agentic.md` | Learnings (this campaign) |
| `docs/deploy/STATUS-2026-08-07.md` | Deploy receipt |
| `HANDOFF.md` | Points here as current resume |

---

## 6. Land receipt

| Field | Value |
|-------|-------|
| Commit | `e38f57a` |
| Subject | `feat: Atlas agentic Decide surface, SEO/GEO, catalog CLI/MCP` |
| Date | 2026-08-07 |
| Remote | Forgejo `origin/main` — https://git.kyanitelabs.tech/simon/llm-3d-viz |
| Tree state after land | Clean except untracked artifacts (`w7-l1-l8-desktop.png`, `w7-l1-l8-final.png`) left as-is |
| Production | Already deployed earlier in campaign; HTTP smoke green 2026-08-07 (no re-deploy in this land pass) |

The previous "large uncommitted dirty tree" is **landed**, not outstanding.
