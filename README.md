# llm-3d-viz

> **llm-3d-viz is an interactive 3D LLM benchmark observatory** for comparing speed, cost, and intelligence, with a decision-oriented shortlist mode and local Atlas agent tools.

<!-- s-plus-geo:start -->
entity: llm-3d-viz
site: https://viz.kyanitelabs.tech/
forgejo: https://git.kyanitelabs.tech/simon/llm-3d-viz
oss: https://github.com/KyaniteLabs/llm-3d-viz
tldr: Interactive 3D LLM benchmark observatory (speed × cost × intelligence) with Decide mode and Atlas agent tools.
<!-- s-plus-geo:end -->

## TL;DR

Model Observatory plots a curated catalog of large language models in a Three.js/WebGL stage. Compare the Pareto surface, set an intelligence floor, and find models that are cheapest, fastest, or balanced among the eligible set. The site is live at [viz.kyanitelabs.tech](https://viz.kyanitelabs.tech/); the application is free to use and requires no account.

## Who it's for

- **Product and engineering teams** choosing a model that is smart enough for a task without ignoring cost or latency.
- **Researchers and evaluators** inspecting benchmark coverage, multi-effort families, and Pareto trade-offs.
- **Developers and agents** who want reproducible catalog queries through the local Atlas CLI or stdio MCP server.
- **Forkers and visual-system tinkerers** customizing branding, tokens, catalog data, and defaults.

## Quick start

```bash
npm install
npm run dev          # local Vite
npm test             # vitest
npm run build
npm run test:render  # Playwright (optional)
```

Open the local Vite URL printed by `npm run dev`. To customize a fork, see **[docs/forkers/README.md](docs/forkers/README.md)** for branding, lab colors, tokens, catalog, and defaults.

## Features

- **3D observatory:** Three.js stage, linked 2D projections, Pareto ridge, multi-effort trails, lab colors, open/closed-weight shapes, and value-score sizing.
- **Decide mode:** Set an intelligence floor, then shortlist eligible models by minimum cost, maximum speed, or a balanced cost × speed objective. Shareable URL state preserves the floor, bias, filters, and axes.
- **Cinema mode:** A focused presentation/export view that emphasizes the frontier, selected models, Decide shortlist, and solo-family members instead of rendering the full catalog at equal visual weight.
- **Provenance and coverage:** The curated catalog keeps per-axis source information where available and reports measured versus missing fields. Missing Index, tokens-per-second, or price values remain missing; the client does not invent metrics.
- **Atlas:** The in-app Atlas dock can navigate catalog and app state with offline tools, with optional BYOK OpenAI-compatible or Anthropic-compatible LLM configuration. Atlas CLI and MCP are local developer surfaces, not hosted public endpoints.
- **SEO and agent assets:** `public/` ships `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, `about.md`, and the `index.html` meta/JSON-LD surface for crawlers and agents.

## Docs

| Doc | Role |
|-----|------|
| [SPEC.md](SPEC.md) | Product spec |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Visual system |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module seams |
| [docs/forkers/README.md](docs/forkers/README.md) | Fork guide |
| [docs/agents/mcp-cli-api-requirements.md](docs/agents/mcp-cli-api-requirements.md) | MCP + CLI API requirements |

## SEO / GEO / AIEO (crawl + agents)

Static discovery files ship from `public/` and are served at the site root:

| Path | Purpose |
|------|---------|
| `/robots.txt` | Crawl rules, AI bot allows, and sitemap |
| `/sitemap.xml` | URL inventory |
| `/llms.txt` | Short agent brief |
| `/llms-full.txt` | Full agent brief |
| `/about.md` | Human/agent Markdown product page |
| `index.html` meta + JSON-LD | Classic SEO, social, and schema.org metadata |

Canonical production host: **https://viz.kyanitelabs.tech/**.

## Agent surface (local)

Atlas exposes the same pure catalog tools used by the in-app agent:

```bash
npm run catalog:snapshot          # export data/atlas-catalog-snapshot.json
npm run atlas:cli -- meta
npm run atlas:cli -- rank --floor 50 --objective min_cost
npm run atlas:mcp                 # stdio MCP server (JSON-RPC)
```

Atlas CLI and MCP run against the local repository/catalog. They are not hosted services on the production origin. For an MCP client, use `command: npx`, `args: ["tsx", "bin/atlas-mcp-server.ts"]`, and `cwd: <repo>`. Set `ATLAS_MCP_FULL=1` to expose UI-control tools such as filters and cinema; the default is catalog-only.

## Encoding (glance-first)

- **Lab** = full brand fill (always readable, no hover)
- **Shape** = open versus closed weights (sphere versus octa wire)
- **Size** = value-score
- **Ridge** = Pareto frontier (filament white)
- **Trails** = multi-effort paths (quiet until solo)

## FAQ

### What does llm-3d-viz measure?

It visualizes curated model data on intelligence, blended cost per million tokens, and tokens per second. Intelligence uses the Artificial Analysis Intelligence Index where available; price and speed come from the catalog's documented source joins.

### How does Decide mode choose a model?

Decide mode first applies the intelligence floor and measured-data requirements, then ranks eligible models by minimum cost, maximum speed, or balanced cost × speed. It is a decision aid, not a claim that one model is universally best.

### Are the benchmark numbers complete?

No. Coverage varies by model and axis. The UI and coverage reporting preserve nulls and identify missing measurements rather than filling gaps with estimates.

### Is Atlas a hosted MCP API?

No. Atlas CLI and MCP are local-only repository tools using stdio. The in-app Atlas path defaults to offline catalog tools; optional BYOK LLM endpoints can be configured by the user, but llm-3d-viz does not provide a public hosted MCP endpoint.

### Can I fork this project?

Yes. It is an MIT-licensed build, and [docs/forkers/README.md](docs/forkers/README.md) describes the supported customization surface.

## Status

The live product is **https://viz.kyanitelabs.tech/**. The repository currently has **207 unit tests**, and production Ultra QA was **11/11 on 2026-08-07**. Landed product work includes commit `e38f57a`. The build is fork-friendly; production deploy configuration is operator-specific and is not required to run or fork the project.

## Source (two repos, not one mirror)

| Repo | Role |
|------|------|
| **Product (Forgejo)** [simon/llm-3d-viz](https://git.kyanitelabs.tech/simon/llm-3d-viz) | Product source of truth for development, catalog operations, and deployment |
| **Open source (GitHub)** [KyaniteLabs/llm-3d-viz](https://github.com/KyaniteLabs/llm-3d-viz) | Separate public MIT repository for forks and customization |

Product work stays on **Forgejo only**. GitHub is **not a live mirror**; it is refreshed only when deliberately published. Policy: [docs/agents/dual-repo.md](docs/agents/dual-repo.md).

## License

MIT — see [LICENSE](LICENSE).