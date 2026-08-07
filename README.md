# llm-3d-viz (open source)

Interactive **3D LLM benchmark visualization** — speed × cost × intelligence.

**This is the public OSS edition** for forks and customizers (MIT).  
Simon’s product instrument is developed on a **separate Forgejo repo** and is not a live mirror of this tree.

Observatory-after-dark: Three.js stage, Pareto ridge, multi-effort trails, linked 2D projections, value-score console, Decide mode — plus an optional **simple “what do you need?” picker** (goals + sliders + spin shortlist) for non-analyst visitors.

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
