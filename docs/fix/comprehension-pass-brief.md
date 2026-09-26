# FIX: Comprehension pass (Simon rejection 2026-08-03)

**Goal:** Product must answer "who wins under my weights, and why?" without hover gymnastics. Mobile must not self-destruct. Publish stays blocked until this lands and Simon re-approves.

**Branch:** `fix/comprehension-pass` (worktree `~/workspaces/llm-3d-viz-fix-comprehension`)
**Repo:** Forgejo `simon/llm-3d-viz`
**Authority:** SPEC.md (axis lock: x=COST y=INTELLIGENCE z=SPEED — do not change), DESIGN-SYSTEM.md, docs/research/frontier-math.md
**Do not:** deploy, spend money, re-litigate D1–D8, add backend/v1 features

## Flaws (must address)

### P0
1. **Empty value console** — default is "Hover a model point…"; incomplete-data wall dominates.
2. **3D stage hard to read** — STAGE KEY + long frontier AA marketing names steal plot; sparse void.
3. **Mobile broken** — title clips; guide overlays stage (`position:absolute` at max-width 760px).

### P1
4. Projections ~160px tall — raise row height (desktop ~14–16rem min).
5. Provider shapes collapsed/invisible by default — open on desktop; show glyphs.
6. Model names are dumpster fire — short display labels (strip parenthetical effort/reasoning junk for UI; keep full `model` id for data keys).
7. Preset chips unexplained — after select, show one-line outcome (weights share + optimum name).
8. Orange range thumbs — style range inputs to copper/filament tokens (webkit + moz), not OS orange alone.

## Acceptance criteria

1. **Landing (no hover):** Console shows:
   - Current optimum under weights (short name + score)
   - Top 3 (or 5) by value score with scores
   - Active preset name if any, else "custom weights"
   - Hover/pin still upgrades to full model detail; leaving hover returns to leaderboard (pin stays)
2. **Incomplete data:** Collapsed `<details>` by default; never taller than the leaderboard section on first paint.
3. **Display names:** UI rails use short labels; `data-model-id` / Plotly `text` stay stable full model ids (hover identity must not break).
4. **Stage guide:** Desktop: narrower rail OR denser (prefer giving plot ≥70% stage width). Frontier list uses short names. Provider shapes section open by default on desktop.
5. **Mobile (≤760px):** Single column stage → console → projections. Stage guide is in-flow (not absolute overlay). h1 does not clip mid-word. Stage plot ≥18rem usable height.
6. **Projections:** Desktop grid row min-height ≥14rem.
7. **Sliders:** Track + thumb use design tokens; focus ring copper.
8. **Tests:** `npm run build`, `npx tsc --noEmit`, `npm test` green. Update/add unit tests for displayName + console landing. Playwright: at least one real-event smoke that landing shows optimum text without hover (expose `__viz` in test/dev as today).
9. **No** `__viz` in production dist (existing rule).

## Implementation hints

- `src/ui/console.ts` — `render()` landing branch; incomplete as details
- `src/lib/format.ts` or new `src/lib/display-name.ts` — pure function + vitest
- `src/ui/stage-guide.ts` — short names; provider details open on desktop
- `src/styles/tokens.css` — grid rows, mobile, range styling, projection height
- Prefer surgical edits; match existing mono/eyebrow patterns

## Done when

- Commit on branch, push, open Forgejo PR with summary + screenshots paths if captured
- Leave working tree clean of unrelated files
