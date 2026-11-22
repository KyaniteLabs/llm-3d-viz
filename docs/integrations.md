# Integration surfaces — using the catalog from other projects

The instrument ships three programmatic surfaces over the same pure catalog tools. No HTTP API is published (the Cloudflare worker is an internal TTS proxy); the data plane is JSON + CLI + MCP.

## 1. JSON data plane (simplest)

- `plugins/iolite-hermes/data/catalog.json` — the bundled licensed catalog. The public decision view takes only rows with a direct Epoch score and a LiteLLM price. See the [catalog attribution](../plugins/iolite-hermes/ATTRIBUTION.md).
- `data/generated/public-catalog.json` — the public observatory snapshot. It carries Arena ratings and some provider-published figures. The shipped AA Index, speed and price fields are empty.
- `data/models.v0.draft.json` — the Atlas-format legacy catalog. A local operator can supply a separate Atlas-format catalog with measurements they have permission to use.

## 2. Atlas CLI

```bash
npm run atlas:cli -- rank --floor 50 --objective min_cost
npm run atlas:cli -- eligible --floor 50 --provider Anthropic
npm run atlas:cli -- rank --catalog /path/to/atlas.json --floor 50 --objective max_speed
```

Public `rank` and `eligible` use direct Epoch Capabilities Index (0–100 rescaled) and LiteLLM list prices blended at 75% input and 25% output. `eligible` lists all priced models above the floor. `rank` returns the cost–capability frontier for the requested provider, or across all providers, ordered by blended price. The public catalog has no speed measurements. `max_speed` explains the missing input. `balanced` labels its cost–capability fallback.

With `--catalog` or `ATLAS_CATALOG_PATH`, these commands use the supplied Atlas-format array and its AA Index scale. Other commands (`meta`, `search`, `get`, `floor`, `compare`) use the Atlas-format catalog. The resolver checks the explicit file, then the environment variable, then the local Atlas snapshot if exported, then the shipped draft.

Legacy `max_speed` ranks only models with a measured speed. For `min_cost` and `balanced`, the legacy tool can use cost and intelligence when eligible rows lack speed. The `mode`, `missing_speed_count`, and `message` fields report the dimensions used and the coverage gap.

Direct invocation with `npx tsx bin/atlas-cli.ts` keeps status diagnostics on stderr. Its exit codes and stdout are:

| Exit | Meaning | Stdout |
|---|---|---|
| `0` | Valid query, including an empty result, or help | JSON for queries, plain text for help |
| `1` | Invalid arguments | Empty |
| `2` | Unresolved model lookup, anchor, or compare operand | JSON `null` for a lookup or anchor, or the matched rows for `compare` |
| `3` | Catalog read, parse, or processing failure | Empty |

## 3. Atlas MCP server (stdio, JSON-RPC 2.0)

The server reports `iolite` as its implementation name. The configuration key below is a client-local alias.

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

Tools: `get_catalog_meta`, `search_models`, `get_model`, `list_eligible`, `rank_eligible`, `propose_floor`, `compare_models`, `query_catalog`, `list_providers`, `list_families`, `ui_action`. MCP uses the Atlas-format catalog (honors `ATLAS_CATALOG_PATH`). One process per catalog; no server state.

Set `ATLAS_MCP_FULL=1` to expose the additional view and decision-proposal tools. A client can call only the tools offered in its server's `tools/list`. View and decision tools return proposals that an attached UI can apply.

## 4. Embedding the tools directly (TS)

Everything above is a thin wrapper over pure functions in `src/lib/atlas-agent/tools.ts` — import `toolRankEligible` etc. with your own `AtlasAgentContext` if you're inside a TS project and want zero process overhead.

## Versioning

Catalog changes are append-only per run and tracked in git (`data/models.v0.draft.json`); `get_catalog_meta` returns a content-hash `snapshot` id (e.g. `cat_1791fc57000043fd`) you can log from your integration to pin exactly which data answered a query.
