# Architecture — llm-3d-viz

## Job

Interactive **selection instrument** for LLM tradeoffs (speed × cost × intelligence), not a marketing dashboard.

## Layers

| Layer | Responsibility |
|-------|----------------|
| **Data** | Catalog JSON + join (`src/data`, `scripts/`) |
| **Domain** | Filters, Pareto, scores, Decide shortlist (`src/lib`) |
| **Encoding** | Single paint contract `pointEncoding` (`src/viz/palette.ts`) |
| **Stage** | Three hero + Plotly fallback + projections + sweep (`src/viz`) |
| **Chrome** | Shell, scope shelf, console, Decide panel, stage guide (`src/ui`, `src/main.ts`) |
| **Tokens** | Observatory-after-dark CSS variables (`src/styles/tokens.css`) |
| **Config** | Forker branding + defaults (`src/config`) |

## Critical seams (extend here)

1. **`pointEncoding` / `brandLayerFlags`** — all mark color/size/trail/ring decisions  
2. **`StageRenderOptions`** — stage input from app state  
3. **`applyFilters` + catalog** — membership  
4. **`FORK_DEFAULTS` / `APP_BRANDING` / `LAB_BRANDS`** — fork customization  
5. **CSS tokens** — visual theme without rewriting components  

## Non-goals for forks

Private deploy runbooks, Cloudflare Worker secrets, agent ops, personal Tailscale origins.

## Tests

Vitest domain/encoding unit tests; Playwright `test:render` for shell/stage smoke.
