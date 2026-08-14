# Integration surfaces — using the catalog from other projects

The instrument ships three programmatic surfaces over the same pure catalog tools. No HTTP API is published (the Cloudflare worker is an internal TTS proxy); the data plane is JSON + CLI + MCP.

## 1. JSON data plane (simplest)

- `data/models.v0.draft.json` — the admitted catalog (every row carries the full speed×cost×intelligence triple, per-field `sources` provenance, or is a vetted provider-announcement row).
- `data/aa-api-snapshot.json` / `data/openrouter-snapshot.json` — raw upstream snapshots (Artificial Analysis free API, OpenRouter models list).
- `data/effort-gaps.generated.json` — coverage annex (awaiting-measurement rows, scope cuts, AA↔OpenRouter price divergences, watchlist).

Rows are rebuilt 3×/day from official APIs; null metrics are never invented (see `docs/adr/0001-multi-source-catalog-join.md`).

## 2. Atlas CLI

```bash
npx tsx bin/atlas-cli.ts meta                          # catalog snapshot + counts
npx tsx bin/atlas-cli.ts search gemini                 # name search
npx tsx bin/atlas-cli.ts eligible --floor 55           # intelligence-floor filter
npx tsx bin/atlas-cli.ts rank --floor 55 --objective min_cost   # cost×speed Pareto shortlist
npx tsx bin/atlas-cli.ts get "GLM-5.3 (max)"
npx tsx bin/atlas-cli.ts compare "GPT-5.6 Sol" "Gemini 3.7 Flash (high)"
```

All output is JSON on stdout. `ATLAS_CATALOG_PATH=/path/catalog.json` points it at any catalog file (default: the repo snapshot) — you can pin a versioned copy for reproducible builds. Semantics: the CLI serves the **full admitted catalog** (all labs, all dates); scope policies (cloud labs, release floor, generation cap) are a UI-layer concern you can re-apply with `filterProductCatalog` from `src/data/catalog-scope.ts`.

## 3. Atlas MCP server (stdio, JSON-RPC 2.0)

```jsonc
// Claude / Cursor / any MCP client config:
{
  "mcpServers": {
    "atlas": {
      "command": "npx",
      "args": ["tsx", "bin/atlas-mcp-server.ts"],
      "cwd": "/path/to/llm-3d-viz"
    }
  }
}
```

Tools: `get_catalog_meta`, `search_models`, `get_model`, `list_eligible`, `rank_eligible`, `propose_floor`, `compare_models`, `query_catalog`, `list_providers`, `list_families`, `ui_action`. Same catalog resolution as the CLI (honors `ATLAS_CATALOG_PATH`). One process per catalog; no server state.

## 4. Embedding the tools directly (TS)

Everything above is a thin wrapper over pure functions in `src/lib/atlas-agent/tools.ts` — import `toolRankEligible` etc. with your own `AtlasAgentContext` if you're inside a TS project and want zero process overhead.

## Versioning

Catalog changes are append-only per run and tracked in git (`data/models.v0.draft.json`); `get_catalog_meta` returns a content-hash `snapshot` id (e.g. `cat_1791fc57000043fd`) you can log from your integration to pin exactly which data answered a query.
