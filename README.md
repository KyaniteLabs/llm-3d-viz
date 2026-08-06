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

## Encoding (glance-first)

- **Lab** = full brand fill (always readable, no hover)
- **Shape** = openness × reasoning (sphere/octa × solid/wire)
- **Size** = value-score
- **Ridge** = Pareto frontier (filament white)
- **Trails** = multi-effort paths (quiet until solo)

## License

MIT — see [LICENSE](LICENSE).

## Status

Open-source friendly build. Production deploy configuration is operator-specific and not required to run or fork the app.
