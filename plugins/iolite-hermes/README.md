![Iolite](icon.png)

# Iolite for Hermes

Choosing a model usually turns into a spreadsheet: which models are smart enough, then which of those is cheapest or fastest. Iolite does that in one tool call. You set an intelligence floor, and it hands back the few models worth picking.

## Quick start

Install it and ask. There is nothing to configure: the plugin ships a real catalog of 621 models (Epoch AI's ECI, LMArena ratings, LiteLLM prices), and it works offline. To see an answer without Hermes:

```sh
python3 plugins/iolite-hermes/demo/try_it.py "shortlist"
```

```text
Floor 50 (default), balanced: 234 models clear it, 5 on the cost x intelligence front.
Speed: not measured yet, so these are ranked on cost and intelligence.
1. GPT-6.1 Terra (OpenAI): intelligence 95.0 (ECI), $2.00/M, speed: not measured yet
2. GPT-6.1 Sol (OpenAI): intelligence 95.7 (ECI), $4.00/M, speed: not measured yet
3. Claude Haiku 5.5 (Anthropic): intelligence 88.7 (ECI), $0.20/M, speed: not measured yet
Source: Epoch AI, 'Capabilities & benchmarking', epoch.ai/benchmarks/use-this-data (CC BY). Accessed 11 Nov 2026. Modified: subset to catalog models; rescaled to 0-100.
Prices: LiteLLM model_prices_and_context_window.json, MIT licence.
Licences: CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ ; MIT https://opensource.org/licenses/MIT . Full notices: ATTRIBUTION.md
```

Inside Hermes the same answer is `/iolite shortlist`. Try `/iolite shortlist 0 cheap` or `/iolite model Claude Opus 4.6` too.

It is the decide mode of the [Iolite observatory](../../README.md), packaged as a Hermes plugin. The ranking is a port of the observatory's own logic, checked by a golden file (see Tests).

## What the agent gets

| Tool | What it does |
|---|---|
| `iolite_shortlist` | Drops models below the floor or without a price. Keeps the cost × intelligence front and ranks it toward `min_cost`, `max_speed` (the smarter end, until speed is measured) or `balanced`. Once every candidate has a locally measured speed, it uses the cost × speed front instead. |
| `iolite_model` | Looks up one model by name or slug. |
| `iolite_show` | Controls an open Desktop pane: 3D/2D, model focus, intelligence floor and camera reset. Reports whether the pane received it. |

From chat, `/iolite` gives the same answers without the agent:

```text
/iolite shortlist 60 cheap
/iolite shortlist "Claude Opus 5.5" fast n=5
/iolite model gpt
/iolite status
```

A bare number is the floor, the words before the last one name an anchor model, and a last word of `cheap`, `fast` or `balanced` sets the objective. A model name that ends in one of those words ("Grok 4 Fast") keeps its name when the catalog has it, or when you put it in quotes. `status` says which source is set and checks whether a Desktop pane is listening, without fetching external data. The bundled `iolite:iolite` skill tells the agent how to set the floor, pick the objective and show the data credit.

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
| Prices | LiteLLM `model_prices_and_context_window.json` | MIT | 254 priced models |

- 621 models in all; 254 have both an intelligence score and a price. Only those can be picked.
- 366 models are not in Epoch's list. Their intelligence is their LMArena rating mapped onto the ECI scale with a line fitted on the 53 models in both (R² 0.92). The answer labels these `(LMArena)` instead of `(ECI)`.
- Prices come from the model's own vendor where LiteLLM lists one, and from a hosting provider (Together, Fireworks, DeepInfra and a few more) for some open models. Effort variants such as "high" or "xhigh" share their base model's price.
- Refresh it with `python3 scripts/build_catalog.py` from the repository root. It downloads the three sources and rewrites the catalog and `ATTRIBUTION.md`.
- Not bundled: speed, and anything from Artificial Analysis or OpenRouter.

## Speed

No lawful public source for model speed exists, so Iolite does not ship one. Instead a `post_api_request` hook times your own model calls and keeps a rolling median of tokens per second per model in `speed.json` in the plugin data directory. It is shown as "N tok/s (local)", labelled as measured on this machine and not comparable across machines. Nothing is uploaded. Set `measure_speed: false` to record and show nothing.

Until every candidate has a measurement, answers say "speed: not measured yet" and rank on cost and intelligence only. In that mode `fast` favours the smarter model, not a faster one.

## Hermes Desktop: model landscape

The Desktop half starts **off**. To enable and open it: **Capabilities -> Plugins -> search "Iolite" -> switch on, then composer button "Iolite"**. The switch lives in the client's browser storage; the agent can guide you but cannot flip it. `/iolite status` checks for a listening pane and repeats that path.

In Hermes Desktop, the composer button "Iolite" and the command "Iolite: model landscape" open a pane that plots the bundled catalog: price (log) by intelligence (0-100) by context window (log), in a 3D view you can orbit, drag, wheel-zoom and drive with the arrow keys, plus a linked 2D price by intelligence view. Wire spheres on a line are the cost x intelligence front (no model is cheaper and at least as smart), small rings are dominated models, a diamond is a pick from your last `/iolite shortlist`, and a dashed plane is its intelligence floor. Hover or focus a point, or tab through the front list, to read its numbers and where each comes from.

- **Agent control, live:** successful `iolite_shortlist` calls (including `/iolite shortlist`) send `plugin.iolite.shortlist.updated` with `{floor, objective, picks}`; the pane moves its dashed floor, marks pick diamonds and focuses the first pick. `iolite_model` and `/iolite model` send `plugin.iolite.model.focused` with `{focus_model}` (the first matching slug, or null to clear focus when there are no matches). These events contain no prompt text or credentials, work even with `remember_shortlist: false`, and update the open pane without reloading. Changes are announced in an aria-live region.
- **Ask the agent to click around:** `iolite_show({"view": "2d", "focus_model": "GPT-6.1 Terra", "floor": 60, "reset_camera": true})` sends `plugin.iolite.view.set`. Only `view` is required (`3d` or `2d`); omitted controls keep their state. Floor must be 0–100; camera reset must be boolean; focus uses the same exact-name/slug-first, case-insensitive substring lookup as `iolite_model`, but refuses ambiguous matches. Models absent from the bundled plot are announced as unplotted. Focusing a model hidden by a measured-only axis returns to price/context axes so its mark is visible.
- **Delivery receipt:** `iolite_show` returns JSON with `ok`, the resolved controls, `desktop_listening`, `message` and `setup`. `desktop_listening: true` means a pane handled this command and acknowledged it through `POST /api/plugins/iolite/pane-receipt`. No receipt within one second means false, with: "no Desktop window is listening; ask the user to open the Iolite pane". A slow or unavailable REST route also counts as no receipt; false does not prove the client is disabled. `/iolite status` uses the same check with `plugin.iolite.presence.check`. Receipts use fresh random ids and temporary 0600 files in the plugin data directory, removed after the check; no heartbeat or browser-storage changes. Without Hermes or a Desktop listener, tools still work and the optional bridge is a debug-only no-op.
- **Third axis:** context window by default, labelled on the chart, with a switch to speed. Speed is never bundled or estimated: the Speed switch plots only models you have measured on this machine (3 calls or more) and says how many it left out. Models with no price or no score are not plotted; the pane states that count.
- **One local request:** the pane reads `/api/plugins/iolite/landscape`, served by this plugin's `dashboard/plugin_api.py`, for your measured speeds and last shortlist. If that route is not available it says so and still plots the bundled catalog. Set `remember_shortlist: false` to stop keeping `last_shortlist.json` (floor, objective and picked slugs, mode 0600, never uploaded).
- **Data inside the file:** the pane is one ESM file, `desktop/plugin.js`, with the catalog snapshot inlined and credited on screen. It imports only `@hermes/plugin-sdk` and `react` and draws with Canvas 2D (no WebGL, no extra library).
- **Light and dark:** the pane follows the Desktop theme. The design system defines only the dark observatory palette, so the light palette is derived from it (same roles on warm paper, ink and copper darkened). `test/palette.test.mjs` checks both: 4.5:1 for every text pair, including the Save button and error text, and 3:1 for marks and the focus ring.
- **Not shown:** openness is not in the catalog, so there is no open or closed glyph; one glyph is used per class.

Rebuild after changing the catalog or the sources (Node 20 or later, `esbuild` is the only build dependency):

```sh
python3 scripts/build_snapshot.py            # catalog.json -> desktop-src/src/snapshot.json (--check verifies)
cd desktop-src && npm ci && npm run build && npm test
```

## Your own prices

List prices are wrong for you when you pay a flat subscription. A prepaid yearly plan
costs nothing per extra token, and an old plan may be cheaper than today's. Every user can
enter their own plans, and the front is recomputed at their prices.

**In the pane:** open **My plans**, pick a provider under **Start from** (it fills in only the
kind and which models the plan covers, never an amount), type what you paid, and press
**Save plans**. Each plan says how many catalog models it covers and what price it gives
them. Then switch **Price: Mine**: every covered model is replotted at your price and the
front is redrawn. Plans are saved by the plugin's local route (`POST
/api/plugins/iolite/my-prices`) to `my_prices.json` in the plugin data directory
(`$HERMES_HOME/plugin-data/iolite/`, mode 0600). They stay on that machine: the file never
ships in the plugin and is never uploaded. You can also write the file by hand:

```json
{"plans": [
  {"name": "My yearly plan", "mode": "sunk", "match": ["glm-5"]},
  {"name": "Monthly plan", "mode": "amortized", "paid_usd": 20, "period_months": 1,
   "models": ["gpt-6.1-terra"]},
  {"name": "Credits deal", "mode": "fixed", "usd_per_m": 0.25, "match": ["deepseek-v4"]}
]}
```

- `sunk`: already paid, so another token costs $0.
- `amortized`: what you paid per month divided by the millions of tokens you use a month.
  Leave `tokens_per_month_m` out and Iolite uses what it has measured on this machine over
  the last 30 days for the models the plan covers. Until it has a week of use, the price is
  marked early; with no use yet, the plan waits and the pane says so.
- `fixed`: a $/M you state.

`models` lists exact catalog slugs and wins over `match`, which takes slug fragments of at
least 3 characters. A plan missing what its mode needs is refused when you save it, and
skipped and named in the pane if the file was written by hand; it is never guessed. Models
no plan covers stay at list price.

From chat: `/iolite prices` lists your plans and the price each gives, and
`/iolite shortlist 60 cheap price=mine` picks at your prices (each pick shows its list
price next to yours). The `iolite_shortlist` tool takes `price: "mine"` the same way.

## Per task: cost, time and tokens

Price per million tokens is not what a task costs you. A model that is cheap per token but
writes ten times as much can cost more per task, and a fast model can still take longer if
it thinks at length. So Iolite measures your own calls (the plugin's `post_api_request`
hook records input and output tokens and seconds per task in `tasks.json`, mode 0600,
kept 90 days and at most 2000 tasks, never uploaded) and the pane's **X axis** switch gives
four separate views, each with its own front:

- **$/M:** list or your price per million tokens.
- **Cost/task:** your median input and output tokens per task at that model's input and
  output price (or your plan's price, so a prepaid plan costs $0 a task).
- **Time/task:** median seconds of model time per task.
- **Tokens/task:** median input plus output tokens per task.

The per-task views plot only models with at least 3 measured tasks and say how many they
left out; nothing is estimated. Set `measure_usage: false` to stop recording.

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
- **Storage:** the plugin writes files only in its plugin data directory, all mode 0600: `speed.json` (your own speed measurements only; `measure_speed: false` turns it off), `tasks.json` (input and output tokens and seconds per task, keyed by a hash of the task or session id, no prompt text; `measure_usage: false` turns it off), `last_shortlist.json` (the floor, objective and picked slugs of your latest shortlist; `remember_shortlist: false` turns it off) and `my_prices.json` (only the plans you save), plus temporary `.pane-<random id>.receipt` markers during listening checks. It registers one hook, `post_api_request`, which reads token counts and timing and nothing else. The Desktop pane adds three local REST routes (GET `/landscape`, POST `/my-prices`, POST `/pane-receipt`) and no outbound request. Hermes keeps tool results in session history like any tool output. It reads no secrets. Like any Python HTTP client it honours the standard `*_proxy` variables.

## Known issues

- **Local REST routes assume loopback.** The three Desktop routes (`/landscape`, `/my-prices`, `/pane-receipt`) add no auth of their own. They rely on the Hermes dashboard's own protection and its default 127.0.0.1 bind. If you expose the dashboard on a network interface, those routes are exposed with it: they reveal your latest shortlist and accept saved prices. Keep the dashboard on loopback.
- **The agent cannot switch the pane on.** Turning on a Desktop plugin is a browser-side setting, so `iolite_show` reports when no pane is listening and tells the user the one step to take.

## Tests

```sh
cd plugins/iolite-hermes && python3 -m pytest -q
cd desktop-src && npm test      # Desktop pane: front parity with decide.py, palette contrast, bundle checks
```

`tests/fixtures/decide-golden.json` is generated from `src/lib/decide.ts` over synthetic catalogs by `tests/iolite-plugin-parity.test.ts` in the repo's vitest suite, and the Python tests compare `decide.py` with it. The vitest parity test fails when `decide.ts` and the golden file disagree; the CI job runs it whenever `decide.ts` changes.

## Licence

MIT, same as the repository.
