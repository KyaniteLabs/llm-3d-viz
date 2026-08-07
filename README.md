# llm-3d-viz

Interactive **3D LLM benchmark visualization** — speed × cost × intelligence.

Observatory-after-dark instrument: Three.js stage, Pareto ridge, multi-effort trails, linked 2D projections, value-score console, Decide mode (intelligence floor → cost×speed shortlist).

## Quick start

```bash
npm install
npm run dev          # local Vite
npm test             # vitest
npm run build
npm run test:render  # Playwright (optional)
```

## Customize

See **[docs/forkers/README.md](docs/forkers/README.md)** — branding, lab colors, tokens, catalog, defaults.

## Docs

| Doc | Role |
|-----|------|
| [SPEC.md](SPEC.md) | Product spec |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Visual system |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module seams |
| [docs/forkers/README.md](docs/forkers/README.md) | Fork guide |
| [docs/agents/mcp-cli-api-requirements.md](docs/agents/mcp-cli-api-requirements.md) | MCP + CLI API requirements (planned) |

## SEO / GEO / AIEO (crawl + agents)

Static discovery files ship from `public/` (served at site root):

| Path | Purpose |
|------|---------|
| `/robots.txt` | Crawl rules + AI bot allows + sitemap |
| `/sitemap.xml` | URL inventory |
| `/llms.txt` | Short agent brief |
| `/llms-full.txt` | Full agent brief |
| `/about.md` | Human/agent Markdown product page |
| `index.html` meta + JSON-LD | Classic SEO / social / schema.org |

Canonical production host: **https://viz.kyanitelabs.tech/** — deploy these with the static build.

## Atlas CLI + MCP (local)

Same pure catalog tools as the in-app agent:

```bash
npm run catalog:snapshot          # export data/atlas-catalog-snapshot.json
npm run atlas:cli -- meta
npm run atlas:cli -- rank --floor 50 --objective min_cost
npm run atlas:mcp                 # stdio MCP server (JSON-RPC)
```

MCP client config (stdio): `command: npx`, `args: ["tsx","bin/atlas-mcp-server.ts"]`, `cwd: <repo>`.  
Set `ATLAS_MCP_FULL=1` to expose UI-control tools (filters/cinema/…); default is catalog-only.

## Encoding (glance-first)

- **Lab** = full brand fill (always readable, no hover)
- **Shape** = open vs closed weights (all wire: sphere / octa)
- **Size** = value-score
- **Ridge** = Pareto frontier (filament white)
- **Trails** = multi-effort paths (quiet until solo)

## License

MIT — see [LICENSE](LICENSE).

## Source (two repos, not one mirror)

| Repo | Role |
|------|------|
| **This product (Forgejo)** [simon/llm-3d-viz](https://git.kyanitelabs.tech/simon/llm-3d-viz) | Simon’s version — SoT for development, catalog ops, deploy |
| **Open source (GitHub)** [KyaniteLabs/llm-3d-viz](https://github.com/KyaniteLabs/llm-3d-viz) | Separate public MIT repo for forks & customization |

Product work stays on **Forgejo only**. GitHub is **not** a live mirror; it is refreshed only when deliberately published. Policy: `docs/agents/dual-repo.md`.

## Status

Fork-friendly MIT build. Production deploy config is operator-specific and not required to run or fork.
