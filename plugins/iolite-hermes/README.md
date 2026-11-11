![Iolite](icon.png)

# Iolite for Hermes

Choosing a model usually turns into a spreadsheet: which models are smart enough, then which of those is cheapest or fastest. Iolite does that in one tool call. You set an intelligence floor, and it hands back the few models worth picking.

## Quick start

Install it and ask. There is nothing to configure: the plugin ships a real catalog of 621 models (Epoch AI's ECI, LMArena ratings, LiteLLM prices), and it works offline. To see an answer without Hermes:

```sh
python3 plugins/iolite-hermes/demo/try_it.py "shortlist"
```

```text
Floor 50 (default), balanced: 233 models clear it, 5 on the cost x intelligence front.
Speed: not measured yet, so these are ranked on cost and intelligence.
1. GPT-6.1 Terra (OpenAI): intelligence 95.0 (ECI), $2.00/M, speed: not measured yet
2. GPT-6.1 Sol (OpenAI): intelligence 95.7 (ECI), $4.00/M, speed: not measured yet
3. Claude Haiku 5.5 (Anthropic): intelligence 88.7 (ECI), $0.20/M, speed: not measured yet
Source: Epoch AI, 'Capabilities & benchmarking', epoch.ai/benchmarks/use-this-data \(CC BY\). Accessed 11 Nov 2026. Modified: subset to catalog models; rescaled to 0-100.
Prices: LiteLLM model\_prices\_and\_context\_window.json, MIT licence.
```

Inside Hermes the same answer is `/iolite shortlist`. Try `/iolite shortlist 0 cheap` or `/iolite model Claude Opus 4.6` too.

It is the decide mode of the [Iolite observatory](../../README.md), packaged as a Hermes plugin. The ranking is a port of the observatory's own logic, checked by a golden file (see Tests).

## What the agent gets

| Tool | What it does |
|---|---|
| `iolite_shortlist` | Drops models below the floor or without a price. Keeps the cost × intelligence front and ranks it toward `min_cost`, `max_speed` (the smarter end, until speed is measured) or `balanced`. Once every candidate has a locally measured speed, it uses the cost × speed front instead. |
| `iolite_model` | Looks up one model by name or slug. |

From chat, `/iolite` gives the same answers without the agent:

```text
/iolite shortlist 60 cheap
/iolite shortlist "Claude Opus 5.5" fast n=5
/iolite model gpt
/iolite status
```

A bare number is the floor, the words before the last one name an anchor model, and a last word of `cheap`, `fast` or `balanced` sets the objective. A model name that ends in one of those words ("Grok 4 Fast") keeps its name when the catalog has it, or when you put it in quotes. `status` says which source is set, without a network call. The bundled `iolite:iolite` skill tells the agent how to set the floor, pick the objective and show the data credit.

`iolite_shortlist` takes these inputs:
- `floor`: 0–100 on the catalog's intelligence scale (Epoch ECI rescaled to 0–100); default 50. A numeric string such as "60" is accepted; anything else is a clear error naming the argument.
- `anchor_model`: "at least as smart as this model".
- `objective`.
- `bias`: −1 to +1 when the objective is balanced.
- `n`: the shortlist size; default 3, max 25.

Each result carries:
- the applied floor and where it came from (`user`, `anchor` or `default`);
- the shortlist, each pick marked as on the front, with the objective that ranked it, plus `mode` (`cost` or `cost_speed`);
- the counts of eligible and Pareto models;
- a catalog snapshot id and the catalog's generation date;
- `data_credits`, the licence line for each source behind the answer;
- the matched row's `license` and `attribution`, when the catalog gives them, and a count of rows refused for provenance.

## Data and licences

The bundled catalog is `data/catalog.json`; `ATTRIBUTION.md` has the full credits and what was changed.

| What | Source | Licence | Rows |
|---|---|---|---|
| Intelligence | Epoch AI Benchmarking Hub, Epoch Capabilities Index (ECI) | CC BY | 255 |
| Arena rating | LMArena leaderboard dataset, shown as a Bradley-Terry rating, not Elo | CC BY 4.0 | 419 |
| Prices | LiteLLM `model_prices_and_context_window.json` | MIT | 253 priced models |

- 621 models in all; 253 have both an intelligence score and a price. Only those can be picked.
- 366 models are not in Epoch's list. Their intelligence is their LMArena rating mapped onto the ECI scale with a line fitted on the 53 models in both (R² 0.92). The answer labels these `(LMArena)` instead of `(ECI)`.
- Prices come from the model's own vendor where LiteLLM lists one, and from a hosting provider (Together, Fireworks, DeepInfra and a few more) for some open models. Effort variants such as "high" or "xhigh" share their base model's price.
- Refresh it with `python3 scripts/build_catalog.py` from the repository root. It downloads the three sources and rewrites the catalog and `ATTRIBUTION.md`.
- Not bundled: speed, and anything from Artificial Analysis or OpenRouter.

## Speed

No lawful public source for model speed exists, so Iolite does not ship one. Instead a `post_api_request` hook times your own model calls and keeps a rolling median of tokens per second per model in `speed.json` in the plugin data directory. It is shown as "N tok/s (local)", labelled as measured on this machine and not comparable across machines. Nothing is uploaded. Set `measure_speed: false` to record and show nothing.

Until every candidate has a measurement, answers say "speed: not measured yet" and rank on cost and intelligence only. In that mode `fast` favours the smarter model, not a faster one.

## Use your own catalog

`catalog_path` or `catalog_url` replace the bundled catalog:

```yaml
# ~/.hermes/config.yaml
plugins:
  entries:
    iolite:
      settings:
        catalog_path: ~/iolite/models.json   # a local file
        # or, instead (catalog_path wins when both are set):
        # catalog_url: https://iolite.internal/api/v1/models.json
```

Either form works: a JSON list of rows, or an object with a `models` list. Each row needs `model`, `blended_price_per_M` and `intelligence` (the older name `aa_intelligence_index` is still read); `tps` is optional. Rows without a `model` name are skipped, and rows missing a price or score show up in lookups but are never picked.

Catalog rows whose `source`, `provenance` or `source_url` names Artificial Analysis are refused when they arrive through `catalog_path` or `catalog_url`, and the answer counts them.

## Install

The plugin lives in a subdirectory, so `hermes plugins install <owner/repo>` can't reach it directly. Once it is listed in the plugin catalog (which supports `subdir`):

```sh
hermes plugins install iolite
```

Until then, copy the directory into your Hermes plugins folder:

```sh
git clone --depth 1 https://github.com/KyaniteLabs/llm-3d-viz
cp -r llm-3d-viz/plugins/iolite-hermes ~/.hermes/plugins/iolite
hermes plugins enable iolite
```

Restart the gateway, then ask: *"Shortlist three models at least as smart as <a model you use>, cheapest first."*

## Disclosure

- **Network:** none unless you set `catalog_url`. First match wins:
  - neither set: the bundled catalog, no network.
  - `catalog_path`: no network.
  - `catalog_url`: one GET, https only unless you set `allow_http: true`, cached in memory for `cache_minutes`. Iolite sends the URL as you write it and adds no credentials of its own. A URL with `user:password@` is refused; a `?token=` query is accepted and sent as written, so treat the URL as a secret you chose to put in config. URLs with whitespace or control characters, or a bad port, are refused before any request. The whole response must arrive within `timeout_seconds` (slow-drip responses are cut off) and stay under 8 MB, and redirects are followed only on the same origin. Answers and `/iolite status` show only the scheme, host and path, never the query string or fragment, and error messages never contain the URL.
  - A failed fetch is remembered for five minutes and not retried.
- **Output:** every row field is cleaned before it is shown: control characters and newlines removed, text capped at 200 characters, `@` mentions and chat markup defused, non-finite numbers dropped.
- **Storage:** the plugin writes one file, `speed.json` in its plugin data directory (mode 0600, your own speed measurements only), and registers one hook, `post_api_request`, which reads token counts and timing and nothing else. `measure_speed: false` turns both off. Hermes keeps tool results in session history like any tool output. It reads no secrets. Like any Python HTTP client it honours the standard `*_proxy` variables.

## Tests

```sh
cd plugins/iolite-hermes && python3 -m pytest -q
```

`tests/fixtures/decide-golden.json` is generated from `src/lib/decide.ts` over synthetic catalogs by `tests/iolite-plugin-parity.test.ts` in the repo's vitest suite, and the Python tests compare `decide.py` with it. The vitest parity test fails when `decide.ts` and the golden file disagree; the CI job runs it whenever `decide.ts` changes.

## Licence

MIT, same as the repository.
