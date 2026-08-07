# MCP + CLI API — what is needed for Model Observatory / Atlas

**Date:** 2026-08-07  
**Status:** Requirements / design (not implemented on production origin)  
**Product:** llm-3d-viz · Model Observatory · Atlas agent tools  
**MCP spec target:** 2026-07-28 (stateless core) + stdio for local CLI hosts  

This document answers: **what must exist for a real MCP server and a CLI API**, so agents can manage catalog/decide work the way Atlas does in-app — without pretending public MCP is live before it is.

---

## 1. Goal

Expose **the same ground-truth catalog tools** Atlas already uses in the browser:

| In-app Atlas | MCP equivalent | Notes |
|--------------|----------------|-------|
| Pure TS tools in `src/lib/atlas-agent/tools.ts` | MCP **Tools** | Metrics only from catalog; no invented numbers |
| `AtlasProposal` + host apply | Tool results + optional **write** tools with confirm | Fail-closed validation |
| Catalog snapshot id | MCP **Resource** | Immutable snapshot for citations |
| Offline NL router / BYOK LLM | Host model (Claude/Codex/etc.) | MCP server is not the LLM |
| Voice TTS/STT | Out of scope for MCP v1 | Browser-only |

**Not the goal (v1):** remote control of a stranger's open browser tab, scraping the SPA, or shipping private NUCBox keys.

---

## 2. Architecture options

```
MCP Host (CLI)  --stdio / Streamable HTTP-->  atlas-mcp-server  -->  Catalog snapshot JSON
```

| Transport | Use when | Needs |
|-----------|----------|--------|
| **stdio** | Local CLI (`npx`, `node bin/atlas-mcp.js`) | Process binary + catalog path; MCP client config entry |
| **Streamable HTTP** (2026-07-28 preferred remote) | Shared team / CI / remote agents | HTTPS origin, auth, CORS if browser, **stateless** handlers |
| **SSE legacy** | Old clients only | Prefer not for greenfield |

**CLI API** (non-MCP) is optional parallel surface:

```bash
atlas-cli decide --floor 50 --objective min_cost --json
atlas-cli search "claude"
atlas-cli compare a b --json
```

Same pure functions as MCP tools; easier for shell scripts without an MCP host.

---

## 3. MCP server must implement

### 3.1 Primitives

1. **Tools** (required for usefulness)
   - `get_catalog_meta`
   - `search_models`
   - `get_model`
   - `list_eligible`
   - `rank_eligible`
   - `propose_floor`
   - `compare_models`
   - Optional later: `set_filters` / `export_share_url` if write path exists

2. **Resources** (strongly recommended)
   - `catalog://snapshot` or file path to models-snapshot.json
   - `catalog://meta` — count, snapshot id, as-of date
   - MIME: `application/json`

3. **Prompts** (optional)
   - `decide_shortlist` — floor N, cheapest eligible
   - `why_out` — explain exclusion

4. **Sampling / roots / elicitation** — not required for v1 server.

### 3.2 Spec / SDK realities (2026-07-28)

- Prefer **stateless** request handling for remote deploy (no sticky sessions).
- Tool schemas from typed definitions (Zod / Pydantic / SDK helpers).
- List results may be **cacheable** (`ttlMs`) where safe.
- **Auth hardening** for remote: OAuth 2.1 / bearer for mutating tools; public read-only may be open with rate limits.
- Advertise capabilities only when callable — no fake MCP Server Card on the website until the server is live.

### 3.3 SDK / package

| Item | Recommendation |
|------|----------------|
| Runtime | Node 20+ **or** Python 3.11+ |
| SDK | `@modelcontextprotocol/sdk` (TS) or `mcp[cli]` (Python) |
| Schema | Zod (TS) or Pydantic (Python) — mirror `tools.ts` I/O |
| Packaging | `bin` entry in package.json; optional Docker image |
| Catalog load | Last built snapshot JSON **or** `ATLAS_CATALOG_PATH` |

### 3.4 Shared core (critical)

Do **not** reimplement ranking differently from the SPA.

- Import pure modules: `decide.ts`, `filters.ts`, `atlas-agent/tools.ts`
- MCP server = thin transport adapter
- Same tests as `tests/atlas-agent.test.ts`

---

## 4. CLI API requirements

| Layer | Need |
|-------|------|
| Binary | `atlas-cli` or `npx @kyanite/atlas-cli` |
| Commands | `meta`, `search`, `get`, `eligible`, `rank`, `floor`, `compare` |
| Flags | `--floor`, `--objective min_cost\|max_speed\|balanced`, `--json`, `--catalog path` |
| Exit codes | 0 ok, 1 usage, 2 data/not found, 3 internal |
| Output | JSON; no metrics invention |

CLI can call the same library as MCP (one codebase, two front-doors).

---

## 5. Catalog / data contract

| Need | Detail |
|------|--------|
| Snapshot file | Versioned JSON of models |
| Snapshot id | Same algorithm as product `catalogSnapshotId` |
| Null policy | Preserve nulls |
| Refresh | Reuse `npm run catalog:refresh` pipeline |
| License / ToS | Source attribution in resource metadata |

---

## 6. Security & product boundaries

| Risk | Mitigation |
|------|------------|
| Invented benchmarks | Tools only return catalog fields |
| Open write API | Default **read-only**; mutation OAuth-gated or local-only |
| NUCBox Unsloth keys | Never embed in MCP server; LLM stays on client host |
| Public MCP abuse | Rate limit, optional auth |
| CORS / browser MCP | Separate WebMCP story; not required for CLI stdio |

---

## 7. Website / GEO linkage (when MCP ships)

Only after a real server exists:

1. MCP Server Card / `.well-known` entry pointing at live transport
2. Update `llms.txt` / `llms-full.txt`
3. Production proof: `tools/list` + one read-only `tools/call`

Until then, public site correctly says **planned**.

---

## 8. Work breakdown

| Phase | Deliverable |
|-------|-------------|
| **M0** | Requirements doc + tool I/O freeze |
| **M1** | Shared pure package + catalog snapshot export |
| **M2** | CLI `atlas-cli` read-only over snapshot |
| **M3** | MCP stdio server wrapping same tools |
| **M4** | Tests: tool parity with SPA |
| **M5** | Optional Streamable HTTP + auth + deploy |
| **M6** | Public discovery cards + AgentReady scan |

**Full-app agentic browser control** (navigate entire SPA) is a **separate** track: WebMCP / browser tools — not required for MCP CLI catalog API.

---

## 9. Acceptance criteria (when we claim MCP ready)

1. CLI shortlist for floor 50 matches SPA offline agent.
2. MCP host can `tools/list` and call `rank_eligible` over stdio.
3. No tool fabricates Index/price/tps.
4. Snapshot id matches build artifact.
5. Public origin does not advertise MCP until M5/M6 green.

---

## 10. Status (2026-08-07)

| Surface | Status |
|---------|--------|
| In-app Atlas tools (full-app) | **Live** — navigate filters/cinema/decide/axes/pin + confirm apply |
| Optional BYOK LLM tool loop | **Live** (local; NUCBox via Vite proxy) |
| Public SEO/GEO crawl files | **In source** (deploy with static build) |
| CLI | **Live** — `npm run atlas:cli -- <cmd>` |
| MCP stdio server | **Live** — `npm run atlas:mcp` (JSON-RPC; catalog tools) |
| Catalog snapshot export | **Live** — `npm run catalog:snapshot` |
| HTTP MCP on viz.kyanitelabs.tech | **Not started** (M5) |

---

## 11. Recommended next step

**M1 + M2:** export catalog snapshot + thin CLI reusing `toolRankEligible` / `toolListEligible`. That proves the API without MCP ceremony; M3 is a thin MCP wrap.
