# Multi-source effort-ladder audit (Arena + aggregators + labs)

**Date:** 2026-08-05  
**Question:** Can we fill incomplete multi-effort curves (esp. Claude Fable 5 low/medium/high/xhigh) from Arena and other high-quality aggregators — without inventing IQ, speed, or cost?  
**Plot contract:** every point needs **intelligence + speed (TPS) + cost ($/M or equivalent honest cost)** to land on the main stage.

## Current catalog truth (local scrape)

| Family | Scorable tiers today | Gap |
|--------|----------------------|-----|
| Claude Fable 5 | **max only** (AA IQ ~59.9, TPS ~72.6, blended ~$7.7/M) | low, medium, high, xhigh |
| Claude Opus 5 | full AA ladder (low→max) | — |
| Claude Sonnet 5 | partial (high/max scorable; other cards often null IQ) | low/medium/xhigh/none as IQ |
| GPT-5.6 Sol/Luna/Terra | AA multi-effort where published | depends on AA cards |
| `arena_elo` field | **0 / 158** rows filled | never wired |

Tracked in `data/effort-gaps.generated.json` + `data/expected-effort-ladders.json`.

## Arena (arena.ai / LMArena)

Live HTML scrape of text board (`text-overall-style_control`, 385 entries) on 2026-08-05.

### What Arena publishes

| Axis | Present? | Notes |
|------|----------|--------|
| Intelligence | **Yes** — Elo (human preference) | Fable ~1508.6; style-control board |
| Cost | **Partial** — list `$/M` in/out | Fable $10 / $50; not measured blended from runs |
| Speed | **No** | No TPS / TTFT / throughput fields on leaderboard entries |

Fields on each entry: `rating`, `votes`, `inputPricePerMillion`, `outputPricePerMillion`, `contextLength`, org/url/license. No speed keys with data.

### Multi-effort coverage (text board)

| Model family | Arena text rows | Notes |
|--------------|-----------------|--------|
| Claude Fable 5 | **1** (`claude-fable-5`) | No low/medium/high/xhigh text rows |
| Claude Opus 5 | **high + max** only | low/medium keys appear elsewhere (agent/vertex) but not full text ladder |
| GPT-5.6 Sol/Luna/Terra | **xhigh only** each | Not full ladders |
| Gemini 3.5 Flash | high + medium (+ thinking-minimal variants) | Partial |
| Claude Sonnet 5 | high | Incomplete |

**Agent board** (`arena.ai/leaderboard/agent`): shows outcome/signal % for **Claude Fable 5 (High)** and Opus 5 High/Max — preference/agent outcomes, not TPS, not a full Fable effort ladder, not AA-style Intelligence Index.

### Honest use for this product

- **Good:** optional **intelligence axis overlay** (`arena_elo`) — already in schema / SPEC; currently empty.
- **Not enough alone:** cannot place a 3D point (missing speed).
- **Does not close Fable multi-effort:** only one Fable text row; agent “High” is not a full low→max curve with speed+cost+IQ.
- **Do not** invent TPS by mixing Arena Elo with AA max-only speed for non-max efforts (would be fake effort geometry).

Public JSON API paths tried (`/api/leaderboard/...`) returned route-not-allowed; scrape is HTML-embedded snapshots only.

## Other high-quality aggregators

| Source | Quality / role | Speed | Cost | Multi-effort Fable? | Verdict for 3D catalog |
|--------|----------------|-------|------|---------------------|------------------------|
| **Artificial Analysis** (current primary) | Composite Intelligence Index + live perf | Yes (TPS) | Yes (blended) | **Max only** for Fable public cards | Best full-triple source; keep primary |
| **Arena** | Human Elo | No | List price only | Fable single text row; agent High | Elo overlay only |
| **LiveBench** | Objective multi-category scores; search/UI shows labels like “Claude Fable 5 Max Effort” + **$/successful task** | Not classic TPS | Task-cost, not $/M | Max (and possibly other efforts in UI — site is JS-shell, hard to scrape) | Candidate secondary **IQ + task-cost**; different cost axis; needs browser/API before ingest |
| **LLM Stats** | Aggregates benchmarks + claimed proxy latency/throughput + pricing | Claims throughput/latency | Yes ($10/$50 Fable) | Mostly single Fable model page; effort discussed in prose | Possible speed/price cross-check; verify methodology before trust; not a full Fable ladder |
| **Epoch AI Benchmarks** | Longitudinal public evals | Token counts sometimes | Often via AA prices in papers | Epoch notes: often **highest effort only** for reasoning models | History / research, not full multi-effort 3D |
| **Scale SEAL** | Expert / domain (SWE-bench Pro, etc.) | No | No | Domain scores, not effort ladders | Optional domain IQ switch, not triple |
| **Vals.ai** | Coding / SWE-style boards | No | No | Fable appears as a model, not effort ladder | Domain IQ only |
| **BenchLM** | Rankings / newsletter-style aggregator | Limited | Some | Single Fable mentions | Low priority |
| **Vellum leaderboard** | Compiled public benches + some speed/cost tables | Sometimes | Sometimes | Not Fable multi-effort authority | Secondary display only |
| **Lab first-party (Anthropic Fable launch)** | Narrative: “even at medium effort” on FrontierCode; “every effort level” on internal spreadsheet suite | No public TPS table | List price only | **No** full low/med/high × (IQ, TPS, $) table | Cite as product ladder existence only — not scorable points |

## Lab websites (short)

- **Anthropic Fable launch / product pages:** confirm multi-effort product control and qualitative claims; **no** independent per-tier TPS + composite IQ table suitable for our axes.
- **OpenAI / Google / DeepSeek / Kimi:** product effort controls exist; public multi-effort **scorable triples** still mainly appear when **AA** (or similar measurers) publish per-tier cards — which is why Opus 5 is complete in-catalog and Fable is not.

## Decision rules (keep fail-closed)

1. Ingest a new effort row only if **all three** axes are measured (or explicitly defined product cost + measured speed + measured intelligence) from a named source.
2. Arena Elo may fill `arena_elo` and optionally power an IQ-axis switch — **never** stand in for missing Fable low/medium rows without speed.
3. Task-cost sources (LiveBench $/task) are a **different cost axis**; if added later, label them separately from blended $/M — do not silently mix.
4. Lab marketing and secondary blogs are **not** metric sources.
5. Continue thrice-daily AA scrape; when AA publishes Fable non-max cards, gaps auto-close.

## Recommended next engineering (optional, not done in this audit)

1. **Arena Elo overlay scraper** → populate `arena_elo` for matching model names (intelligence switch only).
2. **LiveBench** browser/API spike: list effort-labeled rows + whether any non-max Fable exists with numeric scores.
3. **LLM Stats** methodology check (is throughput first-party measure or proxy?) before any TPS overlay.
4. Leave Fable low/medium/high/xhigh as **documented gaps** until a full triple appears.

## Bottom line

Arena and other HQ aggregators are worth watching, especially for **Elo** and **task-level** intelligence. None of them currently replace AA for the **speed × cost × intelligence** product contract on **Fable’s full effort ladder**. Fable remains **max-only** on the main plot for honest reasons — not a scraper miss on Arena.
