# Iolite

> **Iolite is an interactive 3D LLM benchmark observatory** for comparing speed, cost, and intelligence, with a decision-oriented shortlist mode and local Atlas agent tools.

<!-- s-plus-geo:start -->
entity: llm-3d-viz
site: https://viz.kyanitelabs.tech/
forgejo: https://git.kyanitelabs.tech/simon/llm-3d-viz (private, maintainers only)
oss: https://github.com/KyaniteLabs/llm-3d-viz
tldr: Interactive 3D LLM benchmark observatory (speed × cost × intelligence) with Decide mode and Atlas agent tools.
<!-- s-plus-geo:end -->

## TL;DR

The public Iolite view lets you set a minimum Epoch capability score and compare eligible models by blended list price. It shows the cost–capability frontier and the number of models excluded for missing prices. The public snapshot has no speed measurements. The original Three.js/WebGL observatory is available at `?view=observatory` for catalogs with all three benchmark axes.

## Who it's for

- **Product and engineering teams** choosing a model that is smart enough for a task without ignoring cost or latency.
- **Researchers and evaluators** inspecting benchmark coverage, multi-effort families, and Pareto trade-offs.
- **Developers and agents** who want reproducible catalog queries through the local Atlas CLI or stdio MCP server.
- **Forkers and visual-system tinkerers** customizing branding, tokens, catalog data, and defaults.

## Quick start

```bash
npm ci
npm run dev          # local Vite
npm test             # vitest
npm run build
npm run test:render -- public-decision.spec.ts decide-mode.spec.ts viz-pixel.spec.ts
```

On a Linux CPU-only machine, use `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci` to omit ONNX Runtime's optional CUDA download.

Open the local Vite URL printed by `npm run dev`. To customize a fork, see **[docs/forkers/README.md](docs/forkers/README.md)** for branding, lab colors, tokens, catalog, and defaults.

## Features

- **3D observatory:** Three.js stage, linked 2D projections, Pareto ridge, multi-effort trails, lab colors, open/closed-weight shapes, and value-score sizing.
- **Decide mode:** Set an intelligence floor, then shortlist eligible models by minimum cost, maximum speed, or a balanced cost × speed objective. Shareable URL state preserves the floor, bias, filters, and axes.
- **Cinema mode:** A focused presentation/export view that emphasizes the frontier, selected models, Decide shortlist, and solo-family members instead of rendering the full catalog at equal visual weight.
- **Provenance and coverage:** The curated catalog keeps per-axis source information where available and reports measured versus missing fields. Missing Index, tokens-per-second, or price values remain missing; the client does not invent metrics.
- **Atlas:** The in-app Atlas dock can navigate catalog and app state with offline tools, with optional BYOK OpenAI-compatible or Anthropic-compatible LLM configuration. Atlas CLI and MCP are local developer surfaces, not hosted public endpoints.
- **Per-model pages and embed cards:** every catalog model gets a static, self-contained card at `/m/<slug>/` plus an iframe-embeddable card at `/embed/<slug>`, with an all-models index at `/m/` — all regenerated from the catalog on every build with per-field provenance and catalog-date stamps.
- **SEO and agent assets:** `public/` ships `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, `about.md`, the per-model `/m/<slug>/` pages + `/embed/<slug>` cards, the `/blog/2026-08-24-model-observatory/` launch post, the `/frontier-watch.md` movement log, and the `index.html` meta/JSON-LD surface for crawlers and agents.

## Docs

| Doc | Role |
|-----|------|
| [SPEC.md](SPEC.md) | Product spec |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Visual system |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module seams |
| [docs/forkers/README.md](docs/forkers/README.md) | Fork guide |
| [docs/integrations.md](docs/integrations.md) | Public catalog, Atlas CLI and MCP reference |

## SEO / GEO / AIEO (crawl + agents)

Static discovery files ship from `public/` and are served at the site root:

| Path | Purpose |
|------|---------|
| `/robots.txt` | Crawl rules, AI bot allows, and sitemap |
| `/sitemap.xml` | URL inventory (`/`, `/m/*`, `/frontier-watch.md`, `/blog/2026-08-24-model-observatory/`, `/about.md`, `/llms.txt`, `/llms-full.txt`) |
| `/llms.txt` | Short agent brief |
| `/llms-full.txt` | Full agent brief |
| `/about.md` | Human/agent Markdown product page |
| `/m/<slug>/` | Static per-model cards (zero JS, provenance-labeled) + `/m/` index |
| `/embed/<slug>` | Iframe-embeddable per-model cards (legacy `/embed/<slug>.html` links 308-redirect to the canonical path) |
| `/blog/2026-08-24-model-observatory/` | Launch post (SEO + AIGEO structured) |
| `/frontier-watch.md` | Pareto-frontier movement log (price × intelligence) |
| `index.html` meta + JSON-LD | Classic SEO, social, and schema.org metadata |

Canonical production host: **https://viz.kyanitelabs.tech/**.

## Agent surface (local)

The Atlas CLI exposes the same public price shortlist as the default web view:

```bash
npm run atlas:cli -- rank --floor 50 --objective min_cost
npm run atlas:cli -- eligible --floor 50 --provider Anthropic
```

The public rank and eligible commands use direct Epoch Capabilities Index scores rescaled to 0–100 and LiteLLM blended USD per million tokens (75% input, 25% output). Arena ratings and their fitted estimates are outside this ranking. A price or speed measurement that is unavailable stays missing. See [data attribution](plugins/iolite-hermes/ATTRIBUTION.md).

Pass `--catalog /path/to/atlas.json` or set `ATLAS_CATALOG_PATH` to use the original Atlas schema and an AA Index floor. Other CLI commands and `npm run atlas:mcp` use the Atlas schema, whose AA Index, speed, and cost fields are empty on the shipped legacy snapshot. Atlas CLI and MCP run against the local repository/catalog. They are not hosted services on the production origin. For an MCP client, use `command: npx`, `args: ["tsx", "bin/atlas-mcp-server.ts"]`, and `cwd: <repo>`. Set `ATLAS_MCP_FULL=1` for additional controls such as filters and cinema. The default tool set includes the `ui_action` proposal tool. An attached UI decides whether to apply a proposal.

## Encoding (glance-first)

- **Lab** = full brand fill (always readable, no hover)
- **Shape** = open versus closed weights (sphere versus octa wire)
- **Size** = value-score
- **Ridge** = Pareto frontier (filament white)
- **Trails** = multi-effort paths (quiet until solo)

## FAQ

### What does Iolite measure?

The public decision view shows direct Epoch capability scores and LiteLLM blended list prices. The original observatory ships Arena ratings and vendor-published figures where available. See the [public data sources and licences](public/sources/index.html). The public build removes measurements whose licences restrict redistribution.

### How does Decide mode choose a model?

The public view filters by provider and minimum Epoch score, then sorts models with a bundled price from cheapest to most expensive. The original observatory can rank by cost and speed when its catalog supplies the required measurements.

### Are the benchmark numbers complete?

No. Coverage varies by model and axis. The UI and coverage reporting preserve nulls and identify missing measurements rather than filling gaps with estimates.

### Is Atlas a hosted MCP API?

No. Atlas CLI and MCP are local-only repository tools using stdio. The in-app Atlas path defaults to offline catalog tools; optional BYOK LLM endpoints can be configured by the user, but Iolite does not provide a public hosted MCP endpoint.

### Can I fork this project?

Yes. It is an MIT-licensed build, and [docs/forkers/README.md](docs/forkers/README.md) describes the supported customization surface.

## Status

The live product is **https://viz.kyanitelabs.tech/**. The public snapshot date appears in the decision view and CLI results. See [discussions and open issues](https://github.com/KyaniteLabs/llm-3d-viz/issues) for development status.

## Source (two repos, not one mirror)

| Repo | Role |
|------|------|
| **Product (Forgejo, private, maintainers only)** [simon/llm-3d-viz](https://git.kyanitelabs.tech/simon/llm-3d-viz) | Product source of truth for development, catalog operations, and deployment |
| **Open source (GitHub)** [KyaniteLabs/llm-3d-viz](https://github.com/KyaniteLabs/llm-3d-viz) | Separate public MIT repository for forks and customization |

Product development and deployment run from Forgejo. The GitHub repository receives individual public releases.

## License

MIT — see [LICENSE](LICENSE).
