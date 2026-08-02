# Dataset v0 — sources, coverage gaps, snapshot notes

Companion to `data/models.v0.draft.json`. 35 models. Snapshot captured **2026-08-01** (all `data_date` fields).

## Primary source

**Artificial Analysis** (https://artificialanalysis.ai) is the primary and near-exclusive source.
All identity, speed, cost, and intelligence fields except `aider_pct` come from AA's published
per-model dataset, read off two public page types (no login, no automation against ToS — plain
HTTP GETs of public pages, parsed from the embedded `application/ld+json` datasets and the
Next.js RSC payload that the pages themselves ship to any browser):

- `https://artificialanalysis.ai/models` — catalog page; embedded `initialModels` records for the
  25 featured frontier models (full records: release date, openness, context window, Intelligence
  Index v4.1, GPQA, input/output/blended prices, speed/latency).
- `https://artificialanalysis.ai/models/<slug>` — individual model pages; embedded `currentModel`
  record with the same schema. Fetched for: `gpt-5`, `gpt-4o`, `gemini-2-5-pro`,
  `llama-4-maverick`, `llama-4-scout`, `llama-3-3-instruct-70b`, `mistral-large-3`,
  `qwen3-5-397b-a17b`, `nova-premier`, `phi-4`.
- Cross-checked against the pages' JSON-LD `Dataset` blocks (`Intelligence`, `Output Speed`,
  `Latency: Time To First Answer Token`, `Pricing: Cache Hit, Input, and Output`,
  `Context Window`) — values matched.

**Aider polyglot leaderboard** (https://aider.chat/docs/leaderboards/) — secondary source for
`aider_pct` only, where the leaderboard covers a selected model (5 of 35 models).

Field mapping (AA record → dataset field):

| dataset field | source field / method |
|---|---|
| `model`, `provider` | `name`, `creator.name` |
| `openness` | `isOpenWeights` → `open`/`closed` |
| `modality` | `inputModality{Text,Image,Speech,Video}` flags → list |
| `context_length` | `contextWindowTokens` |
| `release_date` | `releaseDate` |
| `tps` | `timescaleData.medianOutputSpeed` (AA's headline long-prompt median), 1 dp |
| `ttft` | `timescaleData.medianTimeToFirstChunk` × 1000 → ms, rounded |
| `price_in_per_M` / `price_out_per_M` | `price1mInputTokens` / `price1mOutputTokens` (USD per 1M tokens) |
| `blended_price_per_M` | `price1mBlended7To2To1` — AA's published 7:2:1 blend, used verbatim (never recomputed) |
| `aa_intelligence_index` | `intelligenceIndex` (AA Intelligence Index v4.1), 1 dp |
| `gpqa` | `gpqa` (published as 0–1 fraction; stored ×100 as a percentage, 1 dp) |
| `aider_pct` | aider polyglot leaderboard % (see per-model table) |
| `arena_elo`, `swe_bench` | **null for all rows** — not fetched (see gaps) |

## Per-model source list

Every row: `source_url` = `https://artificialanalysis.ai/models/<slug>` (in the JSON),
`source` = "Artificial Analysis (artificialanalysis.ai) embedded model dataset",
`data_date` = 2026-08-01. `aider_pct` rows additionally cite the aider leaderboard.

| model | provider | open/closed | AA page slug | aider_pct source |
|---|---|---|---|---|
| GPT-5.6 Sol (max) | OpenAI | closed | `gpt-5-6-sol` | — |
| GPT-5.6 Terra (max) | OpenAI | closed | `gpt-5-6-terra` | — |
| GPT-5.6 Luna (max) | OpenAI | closed | `gpt-5-6-luna` | — |
| GPT-5.5 Pro (xhigh) | OpenAI | closed | `gpt-5-5-pro` | — |
| gpt-oss-120b (high) | OpenAI | open | `gpt-oss-120b` | "gpt-oss-120b (high)" 41.8% |
| GPT-5 (high) | OpenAI | closed | `gpt-5` | "gpt-5 (high)" 88.0% |
| GPT-4o (Nov '24) | OpenAI | closed | `gpt-4o` | "gpt-4o-2024-11-20" 18.2% |
| Claude Opus 5 (max) | Anthropic | closed | `claude-opus-5` | — |
| Claude Fable 5 | Anthropic | closed | `claude-fable-5` | — |
| Claude Sonnet 5 (max) | Anthropic | closed | `claude-sonnet-5` | — |
| Claude 4.5 Haiku (Reasoning) | Anthropic | closed | `claude-4-5-haiku-reasoning` | — |
| Gemini 3.6 Flash (high) | Google | closed | `gemini-3-6-flash` | — |
| Gemini 3.5 Flash-Lite | Google | closed | `gemini-3-5-flash-lite` | — |
| Gemini 2.5 Pro | Google | closed | `gemini-2-5-pro` | "gemini-2.5-pro-preview-06-05 (default think)" 79.1% (name-approximate, see gaps) |
| Gemma 4 31B (Reasoning) | Google | open | `gemma-4-31b` | — |
| Muse Spark 1.1 (xhigh) | Meta | closed | `muse-spark-1-1` | — |
| Llama 4 Maverick | Meta | open | `llama-4-maverick` | "Llama 4 Maverick" 15.6% |
| Llama 4 Scout | Meta | open | `llama-4-scout` | — |
| Llama 3.3 Instruct 70B | Meta | open | `llama-3-3-instruct-70b` | — |
| Grok 4.5 (high) | xAI (listed by AA as "SpaceXAI") | closed | `grok-4-5` | — |
| DeepSeek V4 Pro (max) | DeepSeek | open | `deepseek-v4-pro` | — |
| DeepSeek V4 Flash 0731 (max) | DeepSeek | open | `deepseek-v4-flash` | — |
| Kimi K3 (max) | Moonshot (listed by AA as "Kimi") | open | `kimi-k3` | — |
| GLM-5.2 (max) | Zhipu (listed by AA as "Z AI") | open | `glm-5-2` | — |
| Qwen3.7 Max | Alibaba | closed | `qwen3-7-max` | — |
| Qwen3.5 397B A17B (Reasoning) | Alibaba | open | `qwen3-5-397b-a17b` | — |
| Mistral Large 3 | Mistral | open | `mistral-large-3` | — |
| Mistral Medium 3.5 | Mistral | open | `mistral-medium-3-5` | — |
| MiniMax-M3 | MiniMax | open | `minimax-m3` | — |
| MiMo-V2.5-Pro | Xiaomi | open | `mimo-v2-5-pro` | — |
| Nemotron 3 Ultra 550B A55B | NVIDIA | open | `nvidia-nemotron-3-ultra-550b-a55b` | — |
| Command A+ | Cohere | open | `command-a-plus` | — |
| Inkling (xhigh) | Thinking Machines | open | `inkling` | — |
| Nova Premier | Amazon | closed | `nova-premier` | — |
| Phi-4 | Microsoft | open | `phi-4` | — |

## Coverage gaps (honest)

Field coverage across 35 rows:

| field | coverage | notes |
|---|---|---|
| identity (model/provider/openness/modality/context/release/source_url) | 35/35 | complete |
| `aa_intelligence_index` | 34/35 | GPT-5.5 Pro (xhigh): listed by AA but **not yet benchmarked** — null |
| `gpqa` | 34/35 | same single null |
| `price_in/out/blended` | 34/35 | GPT-5.5 Pro: no published price on AA — null (not checked against openai.com pricing; follow-up) |
| `tps`, `ttft` | 33/35 | GPT-5.5 Pro (not benchmarked) and **DeepSeek V4 Flash 0731** (released 2026-07-31, one day before snapshot; AA has no speed/latency measurements yet) |
| `aider_pct` | 5/35 | aider leaderboard only covers gpt-5, gpt-4o, gpt-oss-120b, Llama 4 Maverick, Gemini 2.5 Pro of our set; its board trails the 2026 model generation |
| `arena_elo` | 0/35 | **not fetched** — LMArena is a JS-heavy app; no reliable manual-style read. Null everywhere, not invented |
| `swe_bench` | 0/35 | **not fetched** — swebench.com does not publish a static per-model table suitable for manual read. Null everywhere |

Specific caveats per model:

- **GPT-5.5 Pro (xhigh)** — all metric fields null (identity only). Kept because it's a notable
  current OpenAI tier; drop it if null-heavy rows are undesirable.
- **Gemini 2.5 Pro `aider_pct` = 79.1** — the aider entry is "gemini-2.5-pro-preview-06-05
  (default think)"; AA's model is the 2025-06-05 release. Name-approximate match; there is also a
  32k-think variant at 83.1%. Reviewer may prefer to null this.
- **Command A+ and Gemma 4 31B** — AA publishes **$0.00 / $0.00** in/out prices. This traces to
  the source (open-weight models with no metered first-party API price tracked by AA), but $0 is
  not "free to run" — it will distort the cost axis. Reviewer decision: keep 0 (as published) or
  null it. Currently kept as published.
- **Grok 4.5 provider string** — AA's creator record says "SpaceXAI"; kept verbatim from source.
- **Kimi K3 / GLM-5.2 provider strings** — AA uses "Kimi" and "Z AI" (not Moonshot / Zhipu);
  kept verbatim.

## Snapshot notes

- **Date of capture:** 2026-08-01 (UTC), single session. Every AA number comes from the same
  day's page payload, so the dataset is internally consistent (one snapshot, one methodology:
  Intelligence Index **v4.1** — 9 evals: GDPval-AA v2, τ³-Banking, Terminal-Bench v2.1, SciCode,
  HLE, GPQA Diamond, CritPt, AA-Omniscience, AA-LCR).
- **Speed/latency semantics:** `tps`/`ttft` are AA's **long-prompt median**
  (`timescaleData`), which is what AA's headline charts publish. For max-effort reasoning models
  (GPT-5.6 family, Claude Opus/Sonnet 5, GPT-5) TTFT includes thinking time and is therefore
  74–188 **seconds**; their medium-prompt TTFT is much lower (e.g. Claude Opus 5: 25.5s). This is
  a real, published tradeoff, not an extraction artifact — but the viz should label the axis
  "TTFT incl. reasoning (long prompt)" or it will mislead.
- **Blended price:** stored verbatim from AA's `price1mBlended7To2To1` (AA's 7:2:1 blend). Never
  recomputed. Note several models have blended < input price (e.g. Muse Spark 1.1: blended 0.78
  vs in 1.25) — this is how AA's blend math falls out with cache-hit pricing; verbatim from
  source.
- **Numbers I could NOT verify:** `arena_elo` and `swe_bench` (all rows null — LMArena and
  SWE-bench had no manually-readable static per-model table at capture time); `aider_pct` for
  30/35 models (aider's board trails the 2026 generation); GPT-5.5 Pro's everything; DeepSeek V4
  Flash speed/latency.
- **Deprecated-but-included reference points:** GPT-4o, GPT-5, Gemini 2.5 Pro, Llama 3.3 70B,
  Phi-4, Nova Premier, Llama 4 Scout/Maverick are marked deprecated by AA as of the snapshot.
  Kept deliberately as older reference points for the viz's historical context.
- **Reasoning-effort variants:** where AA tracks multiple effort levels, the **max/high** variant
  was chosen for frontier comparability (e.g. Claude Opus 5 max, Grok 4.5 high, Kimi K3 max,
  GLM-5.2 max, GPT-5.6 max). Mixing effort levels is a known comparability caveat — II and cost
  both move with effort.
- **Extraction method:** numbers parsed from the pages' own embedded JSON (JSON-LD `Dataset`
  blocks + RSC `initialModels`/`currentModel` payloads), not transcribed from rendered charts;
  spot-checked against the JSON-LD chart datasets for agreement.

## Refresh — 2026-08-02 (GPT-5.6 trio)

Re-pulled Artificial Analysis model pages (live fetch 2026-08-02) and cross-checked OpenAI official pricing (platform.openai.com/docs/pricing). Prices CONFIRMED CURRENT for all three (Sol $5/$30, Terra $2/$12, Luna $0.20/$1.20 in/out; blends unchanged — AA 7:2:1 formula is (7×cacheHit + 2×input + 1×output)/10 with cached prices $0.50/$0.20/$0.02). Updated stale speed/latency fields:

- Sol (max): tps 63.5 → 67.63; ttft 133042 → 137842 ms; AA index 58.9 → 58.89
- Terra (max): tps 125.6 → 124.61; ttft 164360 → 163263 ms; AA index 55.0 → 54.95
- Luna (max): ttft 121891 → 143498 ms (+18%); AA index 51.2 → 51.24

Shared: released 2026-07-09, 1M context, reasoning models (TTFT includes thinking time). data_date bumped to 2026-08-02 on these rows. Note: AA publishes no as-of date; speed/TTFT are rolling medians — re-pull periodically.
