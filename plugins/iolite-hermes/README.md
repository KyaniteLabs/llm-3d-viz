![Iolite](icon.png)

# Iolite for Hermes

Choosing a model usually turns into a spreadsheet: which models are smart enough, then which of those is cheapest or fastest. Iolite does that in one tool call. You set an intelligence floor, and it hands back the few models worth picking.

## Try it in a minute (synthetic data)

The repo ships a clearly synthetic demo catalog: ten invented "Demo ..." models, no real measurements. Run it without Hermes or a network:

```sh
python3 plugins/iolite-hermes/demo/try_it.py "shortlist 60 cheap"
```

```text
Floor 60 (user), min_cost: 9 models clear it, 2 on the cost x speed front.
1. Demo Wren Lite (Demo Labs East): index 63.0, $0.12/M, 240 tok/s
2. Demo Finch Swift (Demo Labs South): index 66.0, $0.3/M, 310 tok/s
Data: Synthetic demo data: invented values, not real measurements
```

To use it inside Hermes, set `catalog_path` to `plugins/iolite-hermes/demo/synthetic-catalog.json` (see below), then run `/iolite shortlist 60 cheap`. Swap in your own catalog when you are ready.

It is the decide mode of the [Iolite observatory](../../README.md), packaged as a Hermes plugin. The ranking is a port of the observatory's own logic, checked by a golden file (see Tests).

## What the agent gets

| Tool | What it does |
|---|---|
| `iolite_shortlist` | Drops models below the floor or missing price, speed or index. Keeps the cost × speed Pareto front and ranks it toward `min_cost`, `max_speed` or `balanced`. |
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
- `floor`: 0–100 on the catalog's intelligence score scale (the source of the score is up to the catalog); default 50. A numeric string such as "60" is accepted; anything else is a clear error naming the argument.
- `anchor_model`: "at least as smart as this model".
- `objective`.
- `bias`: −1 to +1 when the objective is balanced.
- `n`: the shortlist size; default 3, max 25.

Each result carries:
- the applied floor and where it came from (`user`, `anchor` or `default`);
- the shortlist, each pick marked as on the cost × speed front, with the objective that ranked it;
- the counts of eligible and Pareto models;
- a catalog snapshot id, so two answers can be compared;
- the matched row's `license` and `attribution`, when the catalog gives them, and a count of rows refused for provenance.

## Point it at a catalog

The plugin ships **no data** and has **no default source**. Benchmark and price data carry their providers' terms, so you choose a source you're allowed to use:

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

Either form works: a JSON list of rows, or the observatory's `/api/v1/models.json` object with a `models` list. Each row needs `model`, `tps`, `blended_price_per_M` and `aa_intelligence_index`. Rows without a `model` name are skipped. Rows missing any of the other three show up in lookups but are never picked.

Catalog rows whose `source`, `provenance` or `source_url` names Artificial Analysis are refused when they arrive through `catalog_path` or `catalog_url`, and the answer counts them. An Artificial Analysis display may return in a later release, behind a private display.

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

- **Network:** none unless you configure a source. First match wins:
  - `catalog_path`: no network.
  - `catalog_url`: one GET, https only unless you set `allow_http: true`, cached in memory for `cache_minutes`. Iolite sends the URL as you write it and adds no credentials of its own. A URL with `user:password@` is refused; a `?token=` query is accepted and sent as written, so treat the URL as a secret you chose to put in config. URLs with whitespace or control characters, or a bad port, are refused before any request. The whole response must arrive within `timeout_seconds` (slow-drip responses are cut off) and stay under 8 MB, and redirects are followed only on the same origin. Answers and `/iolite status` show only the scheme, host and path, never the query string or fragment, and error messages never contain the URL.
  - A failed fetch is remembered for five minutes and not retried.
- **Output:** every row field is cleaned before it is shown: control characters and newlines removed, text capped at 200 characters, `@` mentions and chat markup defused, non-finite numbers dropped.
- **Storage:** the plugin writes nothing and registers no hooks. Hermes keeps tool results in session history like any tool output. It reads no secrets. Like any Python HTTP client it honours the standard `*_proxy` variables.

## Tests

```sh
cd plugins/iolite-hermes && python3 -m pytest -q
```

`tests/fixtures/decide-golden.json` is generated from `src/lib/decide.ts` over a synthetic catalog by `tests/iolite-plugin-parity.test.ts` in the repo's vitest suite, and the Python tests compare `decide.py` with it. The vitest parity test fails when `decide.ts` and the golden file disagree; the CI job runs it whenever `decide.ts` changes.

## Licence

MIT, same as the repository.
