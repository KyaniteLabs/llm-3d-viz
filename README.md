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
npm install
npm run dev          # local Vite
npm test              # Vitest and Desktop Node tests
npm run build         # public build in this OSS checkout
npm run preview       # serve the generated dist/ files
npm run test:render  # Playwright (optional)
```

Open the local Vite URL printed by `npm run dev` when working on the app. The dev server serves the checked-in snapshots of model pages, embeds, and Frontier Watch for direct-file consumers. Run `npm run build` followed by `npm run preview` to see freshly generated pages, the sitemap, and redirects in `dist/`. `npm run build:public` explicitly selects the public data plane. Maintainers with a private catalog can build it with `VIZ_DATA_PLANE=private npm run build`. The scheduled private catalog refresh also enables movement tracking.

To customize a fork, see **[docs/forkers/README.md](docs/forkers/README.md)** for branding, lab colors, tokens, catalog, and defaults.

To run a single Vitest file, use `npm test -- tests/decide.test.ts`.

## Features

- **3D observatory:** Three.js stage, linked 2D projections, Pareto ridge, multi-effort trails, lab colors, open/closed-weight shapes, and value-score sizing.
- **Decide mode:** Set an intelligence floor, then shortlist eligible models by minimum cost, maximum speed, or a balanced cost × speed objective. Shareable URL state preserves the floor, bias, filters, and axes.
- **Cinema mode:** A focused presentation/export view that emphasizes the frontier, selected models, Decide shortlist, and solo-family members instead of rendering the full catalog at equal visual weight.
- **Provenance and coverage:** The curated catalog keeps per-axis source information where available and reports measured versus missing fields. Missing Index, tokens-per-second, or price values remain missing; the client does not invent metrics.
- **Atlas:** The in-app Atlas dock can navigate catalog and app state with offline tools, with optional BYOK OpenAI-compatible or Anthropic-compatible LLM configuration. Atlas CLI and MCP are local developer surfaces, not hosted public endpoints.
- **Per-model pages and embed cards:** every catalog model gets a static, self-contained card at `/m/<slug>/` plus an iframe-embeddable card at `/embed/<slug>`, with an all-models index at `/m/` — all regenerated from the catalog on every build with per-field provenance and catalog-date stamps.
- **SEO and agent assets:** The build ships `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, `about.md`, the per-model `/m/<slug>/` pages + `/embed/<slug>` cards, the `/blog/2026-08-24-model-observatory/` launch post, Frontier Watch, and the `index.html` meta/JSON-LD surface for crawlers and agents.

## Docs

| Doc | Role |
|-----|------|
| [SPEC.md](SPEC.md) | Product spec |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Visual system |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module seams |
| [docs/forkers/README.md](docs/forkers/README.md) | Fork guide |
| `docs/agents/mcp-cli-api-requirements.md` (Forgejo product repo only; not in this GitHub copy) | MCP + CLI API requirements |

## SEO / GEO / AIEO (crawl + agents)

The build serves static discovery files at the site root.

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
| `/frontier-watch.md` | Public price × capability snapshot or private measured frontier and movement log |
| `/frontier-watch.json` | Machine-readable frontier with fields specific to the build's data plane |
| `/frontier-watch.xml` | Atom feed of recorded private movements. The public feed has no entries with a single comparable snapshot. |
| `index.html` meta + JSON-LD | Classic SEO, social, and schema.org metadata |

The public Frontier Watch uses the bundled decision catalog with direct Epoch Capabilities Index scores and LiteLLM list prices. This catalog has its own coverage. A frontier model may have no `/m/` card in the separate observatory catalog. Public JSON uses the snapshot date (`YYYY-MM-DD`) in `as_of`, includes `score_basis` and `price_basis`, and carries decision-catalog rows with nested `price` and `intelligence` fields. Private JSON uses an ISO timestamp and rows with `model`, `provider`, `price`, `ii`, and `tps`. A tracked private run includes that run's events in `events` and records movement history for the Atom feed.

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

### What does Iolite measure?

It visualizes curated model data on intelligence, blended cost per million tokens, and tokens per second. The public observatory catalog can include Arena leaderboard data (CC BY 4.0), vendor-published launch figures, first-party provider pricing, and the project's own measurements. The public Frontier Watch uses Epoch AI scores and LiteLLM list prices. See `/sources/` on the live site. `scripts/gen-public-catalog.mjs` clears restricted fields from the observatory catalog. Operators running the private pipeline with their own API keys can fill those fields for internal use.

### How does Decide mode choose a model?

Decide mode first applies the intelligence floor and measured-data requirements, then ranks eligible models by minimum cost, maximum speed, or balanced cost × speed. It is a decision aid, not a claim that one model is universally best.

### Are the benchmark numbers complete?

No. Coverage varies by model and axis. The UI and coverage reporting preserve nulls and identify missing measurements rather than filling gaps with estimates.

### Is Atlas a hosted MCP API?

No. Atlas CLI and MCP are local-only repository tools using stdio. The in-app Atlas path defaults to offline catalog tools; optional BYOK LLM endpoints can be configured by the user, but Iolite does not provide a public hosted MCP endpoint.

### Can I fork this project?

Yes. It is an MIT-licensed build, and [docs/forkers/README.md](docs/forkers/README.md) describes the supported customization surface.

## Status

The live product is **https://viz.kyanitelabs.tech/**. The repository currently has **633 unit tests green + 1 skip** (per HEAD run, 2026-08-29), with the data pipeline (Artificial Analysis + OpenRouter + Arena, honesty-core nulls, provenance stamps, canary/alerting with stage-truthful failure codes and supersede-drift alerts) and the full S+ visual program (four independent vision critics, zero mechanical defects) landed through 2026-08-26; the distribution-surface phase 0+1 (embed framing lane, per-card canonical/og/JSON-LD, provenance chips, shared slug lib + alias registry) landed 2026-08-29; the Path C public/private data plane (AA-derived values stripped from every public surface + hygiene set) landed same day. The build is fork-friendly; production deploy configuration is operator-specific and is not required to run or fork the project.

## Source (two repos, not one mirror)

| Repo | Role |
|------|------|
| **Product (Forgejo, private, maintainers only)** [simon/llm-3d-viz](https://git.kyanitelabs.tech/simon/llm-3d-viz) | Product source of truth for development, catalog operations, and deployment |
| **Open source (GitHub)** [KyaniteLabs/llm-3d-viz](https://github.com/KyaniteLabs/llm-3d-viz) | Separate public MIT repository for forks and customization |

Product work stays on **Forgejo only**. GitHub is **not a live mirror**; it is refreshed only when deliberately published. Policy: `docs/agents/dual-repo.md` in the Forgejo product repo (not included in this GitHub copy).

## License

MIT — see [LICENSE](LICENSE).
