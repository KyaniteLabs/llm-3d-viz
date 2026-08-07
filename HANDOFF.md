# HANDOFF — llm-3d-viz

**Last updated:** 2026-08-07 (S+ campaign — W5 D10 + W6 + W7 audit-fix verified; gates remain)

## What this is

Interactive **3D LLM benchmark visualization** (speed × cost × intelligence). Three.js stage, Pareto ridge, multi-effort trails, Decide mode, Atlas decision agent, shareable URL state.

- **Repo (Forgejo SoT):** https://git.kyanitelabs.tech/simon/llm-3d-viz  
- **Live:** https://viz.kyanitelabs.tech/  
- **Run:** `npm install && npm run dev`  
- **Tests:** `npm test` (207 unit tests as of closeout)

## S+ campaign state (2026-08-07) — resume here

**Committed (local `main`, 8 commits past e38f57a, not pushed — push is approval-gated):**
- `5a4b2f0` W5 D10 — identity-without-color: focus-set direct labels + dup-primary fix (Arcee cyan, Upstage olive). `labels-d10.spec`.
- `6a132d9` W6 — log-scale axis labels (2D + Three); method strip/copy/story/provenance/cinema-overlay already shipped by Grok prep.
- `591d37e` W7 — 2026-08-07 design audit (B−) was a **stale deploy**; all top findings verified FIXED (focus→copper, color-scheme:dark, Plotly mono fonts, no dup token, mobile chips not severed — `w7-mobile.spec`). + L8 type craft.
- `7c6de96` W7 L3 — living stage: catalog-arrival diff + "N new since" status. `catalog-diff.test` + `l3-living-stage.spec`.
- `3d50c6e` W7 L9 — cinema export: 2× composited PNG (stage + wordmark + method). `l9-cinema-export.spec`.
- `ea73174` perf — `computeCinemaFocusIds` scores once (was 2×/render in the label path).
- `d8032f3` **architect review fixes** — independent review verdict: **ship-ready, no Critical/High** (deutan math + label pipeline + palette verified correct). Folded F1–F7 (test fidelity + DRY 2D title).

**State:** 217/217 unit, build green, 5 new Playwright specs green. Code path to the S+ audit bar is COMPLETE + independently reviewed (ship-ready). Captures staged in `.omx/.../w7-capture/` (1440/390/decide) for a one-pass re-grade.

**Genuinely blocked (human/vision-gated — not auto-completable):**
- Fresh design audit re-grade (B−→A−): needs a **vision**-capable evaluator (I have none headlessly). Findings are fixed → a re-audit should clear A−.
- Deploy: Simon's explicit go (`npm run deploy:pages` refuses otherwise).
- W7 stretch motion (L2 sweep, L6 lock-on, L4 cinema-DOF): code-able but need visual QA to certify. L5 (OKLCH) would re-touch the brand palette you approved keeping — skipped.

**Maps:** `MAP-s-plus-maximal-dataviz-beauty.md` (W5/W6 done) · `MAP-w7-life-layer.md` (audit findings resolved; L3/L9 done; motion pending). D10 rationale: `.omx/artifacts/visual-ralph/s-plus-w5/d10-redefined.md`.

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
