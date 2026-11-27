# Make your own observatory

**Open-source entry:** this GitHub tree (MIT).  
Simon’s product checkout lives on **Forgejo only** and does **not** include the simple Liani-style picker — that path is **OSS edition only** (`src/config/edition.ts` → `"oss"`).

See the [repository roles in the README](../../README.md#source-two-repos-not-one-mirror).

## 1. Run

```bash
npm ci
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
