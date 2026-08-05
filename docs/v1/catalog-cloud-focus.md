# Catalog focus — cloud API labs (2026-08-05)

Simon: reduce noise; focus on **cloud** models for now. Local / edge labs held for a later view.

## In (default product catalog)

| Lab (`provider`) | Notes |
|------------------|--------|
| OpenAI | All families (Luna / Sol / Terra, oss, …) |
| Anthropic | All |
| DeepSeek | All |
| Google | Gemini + Gemma |
| NVIDIA | Nemotron family |
| Kimi | All |
| Z AI | GLM |
| Alibaba | Qwen |
| MiniMax | All |

## Held for later (still in `data/models.v0.draft.json` / `allModels`)

Amazon, Meta, Mistral, Cohere, SpaceXAI (Grok), Nous, Xiaomi, Microsoft, IBM, and long-tail labs — see `src/data/catalog-scope.ts` `HELD_LABS_FOR_LATER`.

## Escape hatch

- Product default: cloud only
- Full draft catalog: `?catalog=all`
- Source of truth for membership: `src/data/catalog-scope.ts`

## Later: local-run models

Planned as a separate catalog scope (not built yet), not mixed into the cloud instrument by default.
