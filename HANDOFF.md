# HANDOFF — llm-3d-viz S+ visual quality achieved (2026-08-09)

## Status: ALL visual states 90+ (codex GPT-5.6 vision verified). Deployed.

## Visual quality scores (codex GPT-5.6-terra xhigh vision review)

| State | Start | Final | S+ |
|-------|------:|------:|----|
| Default landing | 74 | **91** | ✅ |
| Decide open | 67 | **90** | ✅ |
| Cinema mode | 84 | **91** | ✅ |
| Mobile 390px | 34 | **90** | ✅ |

## What was done (6 passes)

### Desktop composition (74→91)
- Membrane opacity 0.12→0.05, skirt 0.06→0.025 (was "visual debris")
- Filament tube radius 0.02→0.015 core, 0.035→0.025 glow
- Label cap 40→8 (was cluttered with colliding labels)
- Projections 136px→168px (were too short to scan)
- Stage Key max-height 4.5rem→6rem (was truncating lowest item)

### Cinema (84→91)
- Tiered opacity replaces binary suppression: focus 100%, frontier 0.65×, dominated 0.08×+size×0.5
- ATLAS dock opacity 0.25, scale(0.85), hover reveal
- Cinema vignette via radial gradient
- Non-focus marks stay visible with depthWrite:false

### Mobile (34→90)
- Suppress ALL domain titles + tick labels on narrow (<640px)
- Reduce grid density (4→2 steps, 0.22→0.1 opacity)
- Only optimum model gets a label on narrow screens
- Scope-bar wraps, scope-summary hidden, h1 nowrap+ellipsis
- Mobile grid template adds explicit "status" row
- Effort-strip capped, console padded, selection-panel scrollable

### Token hygiene
- 6 hardcoded hex → CSS vars (--color-danger, --color-openness, --color-closed)
- OpenAI green removed from generic family-trail/effort-path swatches
- Stale "stubs" wording removed from axis-metrics.ts

### Earlier codex code review fixes
- MiniMax primary remapped #E91E8C→#E01E8C (4.9→8.3 dE deutan from OpenAI)
- cloud-floor.ts imports canonical CLOUD_LABS from catalog-scope.ts
- D10 palette test hard-gates ALL cloud-scope pairs

## Verification
- tsc: clean
- vitest: 313/313 pass
- Playwright viz-pixel: 3/3 pass
- Playwright visual-capture: 4/4 pass
- Codex GPT-5.6 vision: all states 90+

## Remaining notes
- Mobile utility strip density (codex: minor, not blocking)
- 8 pre-existing render suite failures (responsive titles, glyph assertions — separate from visual quality)
- Forgejo ticket IDs #147-#153 not logged (bookkeeping)
- **DeepSeek repricing effective 2026-08-16** (announced ~Aug 6: output ~$1.32/M peak, half off-peak) — cron auto-propagates new prices from AA/OpenRouter; watch blends around that date. Full data-gap audit: `audits/glm53-2026-08-14-G-datagaps.md` (1 CRIT fixed — cache=0 sentinel in 7:2:1 blend; HIGHs open: admission blind spots, AA↔OR price divergence, silent row removals)
- GLM-5.3 tracked via `data/manual-additions.json` (provider announcement, pre-AA); auto-supersedes when AA measures the family. Same mechanism ready for future pre-AA releases (e.g. ByteDance Seed 2.1 Turbo)
- **Ops (ultragoal G001/G002 live, 2026-08-14):** alerts → Forgejo issues (aggregated, deduped) + local notification; independent hourly silence watchdog (no ok:true in 24h → alert); canary + row-diff + awaiting-measurement/hidden_by_scope annex in `data/effort-gaps.generated.json` + `data/catalog-diff.generated.json`. **Weekly review while any price_divergences record has age_days > 7** (start ~2026-08-21).
- ~~**D-H4 DECISION OPEN (for Simon):**~~ **RESOLVED 2026-08-14 (Simon):** per product line, the default stage keeps only the **newest + previous generation** ("if GPT 5.6 exists, no reason to keep anything older than GPT 5.5"). Implemented as `GENERATION_DEPTH = 2` in `src/data/catalog-scope.ts` (per-line = vendor + name before version + edition word, so Gemini Flash/Pro and GPT mini are independent lines; a line survives until ITS successor exists). Default scope 128→82 rows; `?catalog=all` remains the uncut archive; the cut is tracked operator-side as `hidden_by_scope.c_generation_capped` (46 rows today). Date floor unchanged.
