# HANDOFF — llm-3d-viz

**Last updated:** 2026-08-07 (land close — source landed Forgejo `e38f57a`)

## What this is

Interactive **3D LLM benchmark visualization** (speed × cost × intelligence). Three.js stage, Pareto ridge, multi-effort trails, Decide mode, Atlas decision agent, shareable URL state.

- **Repo (Forgejo SoT):** https://git.kyanitelabs.tech/simon/llm-3d-viz  
- **Live:** https://viz.kyanitelabs.tech/  
- **Run:** `npm install && npm run dev`  
- **Tests:** `npm test` (207 unit tests as of closeout)

## Resume here (2026-08-07)

**Source landed:** commit `e38f57a` on Forgejo `origin/main` (`simon/llm-3d-viz`) — `feat: Atlas agentic Decide surface, SEO/GEO, catalog CLI/MCP`. Production deploy was already live and HTTP-smoke green 2026-08-07.

**Full campaign closeout + file map (includes Land receipt):**  
→ [`docs/v1/wayfinder/SESSION-CLOSEOUT-2026-08-07-atlas-agentic.md`](docs/v1/wayfinder/SESSION-CLOSEOUT-2026-08-07-atlas-agentic.md)

**Learnings (ops + product doctrine):**  
→ [`docs/v1/wayfinder/LEARNINGS-2026-08-07-atlas-agentic.md`](docs/v1/wayfinder/LEARNINGS-2026-08-07-atlas-agentic.md)

**Deploy receipt:**  
→ [`docs/deploy/STATUS-2026-08-07.md`](docs/deploy/STATUS-2026-08-07.md)

### Landed this train (summary)

- Atlas: offline tools + optional OpenAI/Anthropic-protocol LLM (BYOK) + NUCBox Unsloth via Vite proxy  
- Atlas: decision-surface control (floor, filters, pin, cinema, economy) with host apply gating + undo  
- Voice: free Kokoro TTS (browser) + gesture STT  
- SEO/GEO: llms.txt, about.md, sitemap, meta/JSON-LD, OG PNG — **deployed to production**  
- CLI + MCP stdio (`npm run atlas:cli` / `atlas:mcp`)  
- Catalog coverage report + inspector provenance / Arena / est. task time  
- Cinema: recoverable exit (FAB + Atlas stays visible); no pointerenter trap  

### Production Ultra QA (2026-08-07)

11/11 Playwright checks on `viz.kyanitelabs.tech` (coverage badge, Atlas cinema, floor Apply, provenance, static content-types). Evidence: `docs/v1/wayfinder/ultraqa-prod.png`.

### Still open (parked — do not pretend done)

| Item | Notes |
|------|--------|
| CF Managed robots AI blocks | Zone-level; `llms.txt` still live |
| Public HTTP MCP | Local stdio only; needs auth + rate limit |
| Secondary data fills | GPQA / SWE-bench / Aider / measured Index task time still empty (do not invent) |
| VPS origin | Pages is public path; VPS rsync was flaky |
| GitHub OSS mirror | Intentional separate tip; **not** an auto-mirror of Forgejo |

### Quick commands

```bash
npm run dev
npm test
npm run catalog:coverage
npm run atlas:cli -- meta
npm run build
# deploy (operator): npx wrangler pages deploy dist --project-name=llm-3d-viz --branch=main --commit-dirty=true
```

### NUCBox Atlas LLM (local only)

```bash
node scripts/wire-atlas-nucbox.mjs   # writes .env.local (gitignored)
npm run dev                          # proxy /api/atlas/llm → :8890
# UI: Atlas → NUCBox Unsloth
```

## Older context (still true)

- **Three.js** is the 3D hero; Plotly is projections/debug only.  
- Catalog is curated honesty-first (nulls not invented). Primary stack: AA Index × blended $/M × TPS.  
- Dual-repo: Forgejo product SoT; GitHub public MIT is not a live mirror.

## Agent docs

- Issues: `docs/agents/issue-tracker.md`  
- Domain: `docs/agents/domain.md`  
- MCP requirements: `docs/agents/mcp-cli-api-requirements.md`  
