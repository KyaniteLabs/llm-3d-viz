# Make your own observatory

## 1. Run

```bash
npm install
npm run dev
npm test
npm run build
```

## 2. Customize (no deep rewrites)

| Want | Edit |
|------|------|
| Title / tagline | `src/config/app-branding.ts` |
| Decide floor / bias / filter defaults | `src/config/fork-defaults.ts` |
| Lab brand colors | `LAB_BRANDS` in `src/viz/palette.ts` |
| Theme (ink, filament, fonts) | `src/styles/tokens.css` `:root` |
| Models | `data/` catalog + `npm run catalog:refresh` pipeline |
| Full brand rings always | `?brand=full` or `brandLayersFullDefault` |

Lab **fill color is always on** at a glance. Do not mute brand fills for “hierarchy” — use ridge + size + trails.

## 3. Encoding contract

See `pointEncoding` in `src/viz/palette.ts` and `DESIGN-SYSTEM.md` channel matrix.

## 4. License

MIT — see `LICENSE`.
