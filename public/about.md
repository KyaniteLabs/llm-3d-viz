# Model Observatory

**URL:** [https://viz.kyanitelabs.tech/](https://viz.kyanitelabs.tech/)  
**Also known as:** llm-3d-viz

## What this is

Model Observatory is an interactive **3D data visualization** for comparing large language models on three axes:

1. **Intelligence** — Artificial Analysis Intelligence Index  
2. **Cost** — blended price per million tokens (default)  
3. **Speed** — tokens per second (default)

It is designed for product and engineering decisions: “smart enough, then cheapest or fastest among the eligible set,” not leaderboard theater.

## Decide mode

1. Set an **intelligence floor** (or anchor a known model’s Index).  
2. Keep only models with measured Index ≥ floor and measured cost + speed.  
3. Rank by **min cost**, **max speed**, or **balanced** bias.  
4. Share the state via URL query parameters.

## Filters and encodings

- Multi-effort families, age window, open vs closed weights  
- Local VRAM tier intents (8 / 12 / 24 GB heuristics for open weights)  
- Optional exclusion of non-reasoning effort rungs  
- Lab brand color, wire shape for open weights, size ≈ value-score

## Data honesty

Metrics come from a **curated catalog**. If Index, tok/s, or price is missing, the UI shows unmeasured — it does **not** invent numbers.

Primary sources (with attribution in the app footer):

- [Artificial Analysis](https://artificialanalysis.ai)  
- [OpenRouter](https://openrouter.ai) list prices  
- [LMSYS Arena dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) (CC BY 4.0) where used  

## Atlas

In-app **Atlas** agent dock: tool-using navigator over the catalog (floor, eligible, compare, filters). Default path is offline tools; optional BYOK OpenAI- or Anthropic-compatible LLM endpoints.

## Open source

MIT license. Product development SoT on Forgejo; public MIT repo on GitHub for forks.

- Product: https://git.kyanitelabs.tech/simon/llm-3d-viz  
- Public: https://github.com/KyaniteLabs/llm-3d-viz  

## Requirements

Modern browser with **JavaScript** and **WebGL**. Without JS, this page summarizes the product only.
