# Model Observatory architecture

## Parts and flow

```text
catalog JSON -> models validation + catalog scope -> filters/store/URL state
 -> pure axes/score/Pareto/Decide functions -> Three stage / projections / table / panels
Atlas input -> ready LLM endpoint OR offline router -> tool dispatch -> app proposal/state
local CLI/MCP -> local snapshot (fallback draft) -> catalog tools -> stdout/stdio
catalog generators -> public cards/embeds/comparisons/frontier files -> static host
```

[src/main.ts](src/main.ts) connects data, store, shell, stage and UI panels. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) gives extension seams. Domain functions retain nulls, reject/quarantine invalid measurements and require complete primary axes for scorable picks. Empty eligible sets produce a refusal rather than invented scores; filters/default scope can hide many catalog entries.

[Vite configuration](vite.config.ts) validates the full catalog. With `VIZ_DATA_PLANE=public` it substitutes the generated public catalog for the draft import. `build:public` runs the provenance-origin stripping transform before the normal generators/build; ordinary `build` is not a public-data licensing boundary by itself. The transform relies on provenance metadata: it nulls AA/OpenRouter-origin fields except re-sourced public-spec fields. That is an implementation rule, not independent legal clearance or proof every artifact is clean.

Atlas [controller](src/lib/atlas-agent/controller.ts) attempts the configured LLM when ready, with a 60-second failure backoff and offline fallback. [llm-config](src/lib/atlas-agent/llm-config.ts) persists endpoint/key settings in localStorage and defaults to an enabled same-origin preset if storage is absent. Optional speech/voice code is separate. The Vite proxy, when a target is configured, uses curl, server-side credentials and temporary request/response files. Static deployments need their own endpoint arrangement; this code does not prove the production route exists.

The [MCP entrypoint](bin/atlas-mcp-server.ts) reads an explicitly selected/preferred local snapshot or falls back to draft, exposes JSON-RPC catalog resources/tools, and defaults to a catalog-only tools listing. `ATLAS_MCP_FULL` broadens discovery; tools/call dispatch itself is not filtered by that listing, so the flag is not an authorization boundary. No public network listener is supplied by this stdio entrypoint.

## Risky paths and failure signatures

- **Coverage/meaning:** the inspected public draft and generated catalog each have 323 rows but zero complete primary-axis rows. A booted plot, passing domain tests or static card does not mean a usable measured shortlist exists. Intelligence indexes and task anchors are decision aids, not task success guarantees.
- **Privacy/network/spend:** absent browser config can select the LLM proxy rather than offline mode. Keys in localStorage are accessible to same-origin script; endpoint requests disclose prompts/tool context and may cost money. Do not exercise voice/inference or assume anonymous viewing grants network authority.
- **Publication/data:** refresh/cron/install/publish scripts have different side effects from pure tests. Generated pages and the SPA must use the intended public plane; stale/unlabeled provenance can defeat stripping. Review both data and all output surfaces before publication.
- **Rendering/state:** WebGL support, fallback loading, dense labels, axis transforms and URL restoration can fail independently. Test actual pixels and operator interaction, not just a canvas count or source checks.
- **Fallback identity:** CLI/MCP fallback catalog choice, LLM-to-offline fallback and alternate snapshot hash algorithms can change interpretation. Read paths/trace/refusal metadata; do not equate any response with the requested data/provider path.

## Bounded docs verification

59 targeted tests passed across models, coverage, Decide, URL state and injected LLM tests. Local Chromium rendered the SPA without page errors; Atlas was explicitly disabled and its API route blocked, with no attempted inference requests. Screenshot/receipt are local rendering evidence only, not hosted/private-edition, speech, ranking-quality or publication acceptance. No generation/refresh/deployment script ran. Docs rollback is reverting the commit.
