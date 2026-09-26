# Prototype: intelligence floor + cost×speed decide mode

**Ticket:** [#136](https://git.kyanitelabs.tech/simon/llm-3d-viz/issues/136)  
**Map:** [#128](https://git.kyanitelabs.tech/simon/llm-3d-viz/issues/128)  
**Date:** 2026-08-05  
**Status:** prototype shipped in app (not production polish)

## How to try it

1. `npm run dev` or `npm run build && npm run preview`
2. Click **Decide** in the scope bar (top right)
3. Floor defaults to **AA Index 50**
4. Drag floor, pick an **anchor** model, or **Propose floor (stub AI)** (confirm dialog)
5. Use **prefer cheaper ↔ faster** bias
6. Inspect **cost × speed** SVG (Pareto ridge + shortlist dots)
7. Click a shortlist row to pin on the 3D stage
8. **Copy DecideResponse JSON** for the #135 consumer contract

## What it implements (acceptance)

| Criterion | Implementation |
|-----------|----------------|
| Floor control (default 50, anchor, numeric) | `DecidePanel` + `AppState.intelligenceFloor` |
| AI propose stub | confirm dialog → apply median Index |
| 3D dim below floor | `StageRenderOptions.intelligenceFloor` in Three stage |
| Cost×speed of eligibles + Pareto | SVG in panel + `costSpeedPareto` |
| Bias → shortlist of 3 | `rankParetoByBias` / `shortlistFromDecide` |
| Hide value-score weights in decide | `DecisionConsole` hides weight/preset hosts |
| Export DecideResponse | clipboard + console |

## Code

- `src/lib/decide.ts` — pure logic + JSON schema builders  
- `src/ui/decide-panel.ts` — UI  
- `src/state.ts` — decide fields  
- `src/viz/stage3d-three.ts` — dim / callout  
- `tests/decide.test.ts`

## Not in prototype

- Real LLM backend  
- Suite-prior library UI (#132 full)  
- URL persistence of floor/bias  
- HTTP decide API  
- Plotly stage floor dim (Three path only)
