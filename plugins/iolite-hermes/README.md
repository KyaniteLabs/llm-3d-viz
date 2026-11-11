![Iolite](icon.png)

# Iolite for Hermes

Choosing a model usually turns into a spreadsheet: which models are smart enough, then which of those is cheapest or fastest. Iolite does that in one tool call. You set an intelligence floor, and it hands back the few models worth picking.

It is the decide mode of the [Iolite observatory](../../README.md), packaged as a Hermes plugin. The ranking is a tested port of the observatory's own logic.

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

A bare number is the floor, any other words name an anchor model, and `cheap`, `fast` or `balanced` set the objective. `status` says which source is set, without a network call. The bundled `iolite:iolite` skill tells the agent how to set the floor, pick the objective and credit the data.

`iolite_shortlist` takes these inputs:
- `floor`: 0–100 on the Intelligence Index scale; default 50.
- `anchor_model`: "at least as smart as this model".
- `objective`.
- `bias`: −1 to +1 when the objective is balanced.
- `n`: the shortlist size; default 3, max 25.

Each result carries:
- the applied floor and where it came from (`user`, `anchor` or `default`);
- the shortlist, each pick marked as on the cost × speed front, with the objective that ranked it;
- the counts of eligible and Pareto models;
- a catalog snapshot id, so two answers can be compared;
- when you set `IOLITE_AA_API_KEY`, an `aa_display` block with Artificial Analysis numbers beside each pick, plus the `attribution` credit. These are display only and never change the ranking.

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

### Optional: show Artificial Analysis numbers beside the picks

A key does not give Iolite a catalog. The ranking always comes from `catalog_path` or `catalog_url` and nothing else. If you also have a free key from [artificialanalysis.ai/data-api](https://artificialanalysis.ai/data-api), set it in the gateway's environment:

```sh
export IOLITE_AA_API_KEY=...   # or put it in the profile's .env
```

Iolite then adds Artificial Analysis's own index, blended price and speed next to each model, in columns labelled "Artificial Analysis (display only, not used for ranking)". Those numbers never enter a ranking, sort or score: with or without a key, the same arguments return the same picks in the same order (a test checks this).

How the key is used:

- One fetch per answer. Each shortlist or model lookup makes one request run against the free language-models endpoint (a few pages of the same endpoint, 200 models a page) and keeps the values only for that answer.
- No cache. Nothing is kept between answers and nothing is written to disk.
- Never retried. If Artificial Analysis refuses (a 429 or the daily quota of 100 requests on the free tier, a bad key, a server error), the answer says so in `aa_display_error`, still shows the ranking, and does not try again. The next question makes its own single attempt.
- The key is read through Hermes's secret scope, so each profile uses its own key, and it is sent only to `https://artificialanalysis.ai`. It is never logged or returned in tool output.
- The values are shown to the person who holds the key, and to nobody else. Iolite does not publish, store or re-serve them, and does not combine them into a shared ranking.

Every answer that shows these numbers carries this credit, as Artificial Analysis's terms require, and `/iolite` prints it under the result:

> Source: Artificial Analysis (artificialanalysis.ai)

Keep it wherever you show the values. Artificial Analysis's [terms](https://artificialanalysis.ai/data-api) limit what you may do with what you fetch, so read them before you pass the values on. Iolite ships no Artificial Analysis data and has no key of its own.

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
  - `catalog_url`: one plain GET, cached in memory for `cache_minutes`. Iolite sends the URL exactly as you write it and adds no credentials of its own. A URL with `user:password@` is refused. The whole response must arrive within `timeout_seconds` and stay under 8 MB, and redirects are followed only on the same origin. Answers and `/iolite status` show only the scheme, host and path, never the query string or fragment.
  - `timeout_seconds` bounds the whole `catalog_url` fetch. A failed fetch is remembered for five minutes and not retried.
- **Display-only key:** `IOLITE_AA_API_KEY` is not a catalog source. When set, each answer makes one fetch of `https://artificialanalysis.ai` with your key in the `x-api-key` header, uses it only to print labelled numbers beside the picks, and keeps nothing: no cache, no disk, no retry. A redirect to any other origin is refused before it is followed, so the key can't travel with it. The key is never logged or returned in tool output.
- It registers no hooks, runs nothing in the background and writes no files. It reads one secret, `IOLITE_AA_API_KEY`. Like any Python HTTP client it also honours the standard `*_proxy` variables.

## Tests

```sh
cd plugins/iolite-hermes && python3 -m pytest -q
```

`tests/fixtures/aa-free-pages.json` is invented data in the shape of the Artificial Analysis free endpoint; no real Artificial Analysis data ships with the plugin. `tests/fixtures/decide-golden.json` is generated from `src/lib/decide.ts` over a synthetic catalog by `tests/iolite-plugin-parity.test.ts` in the repo's vitest suite. If either side drifts, a suite fails.

## Licence

MIT, same as the repository.
