# HANDOFF — llm-3d-viz S+ gap closure + independent review (2026-08-09)

## Status: Codex FAIL caught + fixed. Tastecheck HOLD on pixel veto. Deployed.

## Current HEAD
- Product `main`: latest commit remaps MiniMax primary + fixes cloud-floor scope
- OSS `oss/main`: `2579d82` (Liani restored)
- Deploy: `viz.kyanitelabs.tech` live

## Independent review results (2026-08-09)

### Codex GPT-5.6-terra (xhigh) — FAIL → FIXED
Caught 2 genuine issues, both now resolved:

1. **D10 palette collision**: `OpenAI ⟷ MiniMax` had 4.9 dE deutan separation (both cloud-scope). Test only checked a manual `majors` subset that omitted MiniMax. **Fixed**: MiniMax primary remapped `#E91E8C → #E01E8C` (8.3 dE). Test now hard-gates ALL `CLOUD_LABS` pairs from `catalog-scope.ts`.
2. **Stale cloud-floor scope**: `tests/helpers/cloud-floor.ts` duplicated a lab list that diverged from canonical `CLOUD_LABS` (computed 95 vs actual 119 scorable). **Fixed**: imports from `catalog-scope.ts` directly.

Codex PASS items: resolveColorToken() usage, edition gate, Tailscale scrub (0 matches), no dead code/AI slop.

### Fresh tastecheck (architect agent, GLM-5.2) — HOLD
- **No vision capability** — could not rate pixel dimensions. All screenshots returned `[image omitted]`.
- Code-level: tokens match, whiteout fix verified, encoding contract sound.
- Caught prior-review error: "cinema specificity bleed" was a **false positive** (correctly debunked).
- **P0**: Fresh 47-model pixel veto unsatisfied — needs vision-capable reviewer or Simon.
- **P1**: Prior 94.23 scorecard scored against stale 33-model captures, not current 47-model state.
- **P2**: D9/D10 scores reflect rescoped bars (defensible but should be discounted ~2-4 pts externally).
- **P3 debt**: hardcoded hex in legend key-marks (not render path), OpenAI green in generic swatches.

## Verification state (post-fixes)
- tsc: clean
- vitest: 313/313 pass
- Playwright viz-pixel: 3/3 (3D stage 0.22% whitePct, projections 0.00%, Plotly sRGB hex)
- Playwright labels-d10: PASS
- Tailscale invariant: 0 tracked files

## What remains for genuine S+
1. **Pixel-level visual veto** on current 47-model state (needs vision-capable reviewer or Simon)
2. **8 pre-existing render suite failures** (responsive titles, data-driven glyphs — non-regression)
3. **P3 token hygiene**: hardcoded hex in legend key-marks, OpenAI green in generic swatches
4. **MAP W0**: Forgejo ticket IDs (#147-#153) not logged

## Config state
- `~/.codex/config.toml`: model=`gpt-5.6-terra`, effort=`xhigh`
- Dev server: port 5173 (kill before Playwright runs)
