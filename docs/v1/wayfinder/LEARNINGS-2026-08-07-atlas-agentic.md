# Learnings — Atlas agentic observatory campaign (2026-08-07)

Operational and product lessons from building Atlas + SEO/GEO + MCP/CLI + data honesty, then Ultra QA on production.

---

## A. Product / agent architecture

### 1. Agent ≠ chat widget
A useful “agentic website” is **tools over product state**, not a free-form chat panel. Atlas works when:

- Tools are pure and share the same `decide` / filter / rank code as the UI  
- Outputs are a **validated proposal schema**  
- The **host** applies patches and owns confirm/undo  

### 2. Host must own high-impact gating
If the LLM can set `auto_apply: true` on `finish_turn`, “confirm floor/filters” is theater.  

**Learning:** Impact classification is a **host function** (`shouldAutoApplyProposal` / `isLowImpactProposal`). Never trust the model’s flags for floor/filter/axes/weights.

### 3. Offline router is the reliability floor
BYOK and NUCBox help open-ended NL; **offline regex/intents** keep the product useful when:

- No key  
- Proxy/CORS fails  
- Model returns empty/tool-less noise  
- `prefers-reduced-motion` or slow first token  

Always ship offline path first; LLM is an upgrade, not the spine.

### 4. “Full app” claims are easy to overclaim
Canvas mode (3D/2D/table), global search chrome, filter-shelf open/close, and camera are separate surfaces.  

**Learning:** Market as **decision surface** (floor, filters, pin, cinema, economy, shortlist) unless every chrome control has a tool.

### 5. Confirm vs auto-apply UX
- Low impact → auto-apply + undo  
- High impact → explicit Apply  
Users experience “broken agent” if navigation requires Apply, and “dangerous agent” if filters wipe silently.

---

## B. Infra / Unsloth / NUCBox

### 6. Unsloth Studio CORS is hostile to browsers
OPTIONS → 501; responses can emit **duplicate Content-Length**. Node `http` / Vite’s default proxy die; **curl-backed** same-origin middleware works.

### 7. Never put NUCBox keys in VITE_
Keys in `VITE_*` ship to the client. Pattern:

- Browser talks **same-origin** `/api/atlas/llm/v1`  
- Vite injects `ATLAS_UNSLOTH_API_KEY` from `.env.local`  
- `scripts/wire-atlas-nucbox.mjs` pulls key via `ssh nucbox` (never logs secret)  

### 8. Protocol ≠ vendor
“OpenAI-compatible” and “Anthropic-compatible” are **wire formats**. OpenRouter, Ollama, Groq, DeepSeek, vLLM, LiteLLM, Unsloth all sit on those protocols. UI should say protocol, not brand lock-in.

### 9. Proxy health ≠ gen health
`/v1/models` 200 while completions hang is common (sticky GPU, stuck proxy). Ops: `ornith-workhorse-verify.sh`; restart `unsloth-openai-proxy` when gen canary fails.

### 10. Public domain cannot reach Tailscale NUCBox
NUCBox LLM is **local/Tailnet + Vite** only. Production Atlas correctly falls back offline. Document that so the NUCBox button is not “broken” on prod.

---

## C. SEO / GEO / AIEO

### 11. Source-ready ≠ production-ready
`public/llms.txt` in git does nothing until **dist is deployed**. SPA fallbacks make `/llms.txt` look like HTML 200s — a classic false green.

### 12. Verify with Content-Type, not status
```bash
curl -D- https://viz.kyanitelabs.tech/llms.txt   # must be text/plain
curl -D- https://viz.kyanitelabs.tech/about.md    # must be text/markdown
curl -D- https://viz.kyanitelabs.tech/og-image.png  # must be image/png
```

### 13. Cloudflare Managed robots can invert GEO intent
Zone-managed AI Disallows may override or prepend your `public/robots.txt`. GEO work is incomplete until zone policy matches product intent. **llms.txt still helps** agents that fetch it directly.

### 14. OG images should be PNG (1200×630)
SVG OG cards fail on major scrapers. Keep SVG for design; ship PNG for meta.

### 15. Pages free + Worker proxy is enough for branded host
`viz.kyanitelabs.tech` Worker → `llm-3d-viz.pages.dev` works without burning paid edge features. Redeploy **Pages** for static; Worker only when proxy logic changes.

---

## D. MCP / CLI

### 16. Thin adapters over pure tools
CLI and MCP must call the **same** `tools.ts` / `decide.ts` as the SPA. Reimplementing rank in a second language guarantees drift.

### 17. Snapshot id is a contract
Decorative `cli_302` ids break share/decide provenance. Use the product FNV helper (`catalogSnapshotIdSyncForTests` / same algorithm as SPA).

### 18. Snapshot export must be the file tools read
`catalog:snapshot` writing a file nothing loads is cargo cult. Default CLI/MCP path → `data/atlas-catalog-snapshot.json` with fallback to draft.

### 19. Exit codes matter for scripts
Doc said exit 2 = not found; implementation printed `null` and exited 0. Shell automation needs the real code.

### 20. MCP stdio tests need long timeouts
Cold `npx tsx` can exceed 5s vitest default. Set **60s** on spawn tests.

### 21. Spec version negotiation
Hardcoding `2024-11-05` while docs cite `2026-07-28` confuses strict clients. Echo client `protocolVersion` when plausible.

### 22. Don’t advertise public MCP until it exists
`llms.txt` / Server Cards that lie fail AgentReady and trust. Status: local stdio live; HTTP public not started.

---

## E. Data honesty

### 23. Core axes can be full while secondary benches are empty
302/302 IQ+TPS+price does not mean the product is “data complete.” GPQA/SWE/Aider/task-time measured can be **0%**. Report coverage every refresh.

### 24. Estimate must be labeled
Task time from `TTFT + 1000/TPS` is useful but dishonest if titled “measured.” Axis title **TIME / TASK (est.)** and chip **s/task≈** matter.

### 25. Provenance is a product feature
`sources` on every row is underused until the inspector shows it. Trust > more metrics.

### 26. Never invent to fill the cube
Nulls stay null. Prefer incomplete secondary axes over fabricated GPQA/Elo.

---

## F. Cinema / WebGL UX

### 27. Hiding parent chrome hides the agent
Atlas lived under `.inspector`. Cinema CSS set `inspector { display: none }` → agent vanished. **CSS parent traps** are a common agentic-site footgun.

### 28. pointerenter exit is hostile
After cinema enter, layout reflow fires pointerenter and immediately exits—or, with chrome hidden, strands the user. Prefer explicit **Exit cinema** control + key **C**.

### 29. prefers-reduced-motion disables cinema
Headless Playwright often has reduced motion on → cinema never becomes `is-cinema`. Ultra QA must `emulateMedia({ reducedMotion: 'no-preference' })` or tests false-fail.

### 30. Auto-apply cinema without escape = “broken product”
If cinema hides the only control that issued the command, the feature is a trap. Agent actions must leave a recovery path.

---

## G. Deploy / process

### 31. Custom domain cache vs deployment hostname
Check both `viz.kyanitelabs.tech` and the fresh `*.pages.dev` deployment URL when debugging “did it ship?”

### 32. Ultra QA on production, not only unit tests
Green vitest + broken prod SEO/cinema is the default failure mode. After deploy, run a short Playwright checklist against the **branded** URL.

### 33. Kimi adversarial review is worth it
Third-party HOLD caught: prod SEO not live, model-gated apply, snapshot id lies, “entire app” overclaim. Use `kimi -p` (print); `kimi-cli --print` may fail on broken MCP configs (epoch bridge).

### 34. Don’t paste secrets from mcp.json into logs
Inspecting `~/.kimi/mcp.json` can dump API keys into agent transcripts. Prefer redacted greps.

---

## H. Catalog ops

### 35. Coverage report on every scrape
`catalog-auto-update.sh` should write `logs/catalog-coverage.txt` even when “no change” is false-positive-ish—always after successful scrape.

### 36. Decide-ready elite set is small
Floor ≥ 50 may be ~30 models of 300. Shortlists feel sparse; that is data shape, not a rank bug.

---

## I. What to do next (when reopening)

1. Optional: atomic git commits + Forgejo push (tree still dirty at closeout)  
2. CF zone: align Managed robots / Content Signals with GEO intent  
3. Data P1: Arena join density, GPQA if AA provides, measured task time if paid AA  
4. Host-gated apply already in; keep panel tests if apply path refactors  
5. Do not claim public MCP until M5 HTTP + auth exists  

---

## J. One-line doctrine

**Tools + host apply + offline floor + honest nulls + deploy proof.**  
Everything else (BYOK, NUCBox, voice, MCP, GEO) is an upgrade path on that spine.
