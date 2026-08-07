# Make your own observatory

**Open-source entry:** public GitHub [KyaniteLabs/llm-3d-viz](https://github.com/KyaniteLabs/llm-3d-viz) (MIT).  
Simon’s product checkout and deploy live on Forgejo and are **not** the same as a continuous public mirror — see `docs/agents/dual-repo.md`.

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
| Brand ring + core | Focus only (`?brand=full` or solo); fill is brand primary always |

Lab **fill color is always on** at a glance. Do not mute brand fills for “hierarchy” — use ridge + size + trails.

## 3. Encoding contract

See `pointEncoding` in `src/viz/palette.ts` and `DESIGN-SYSTEM.md` channel matrix.

## 4. License

MIT — see `LICENSE`.
