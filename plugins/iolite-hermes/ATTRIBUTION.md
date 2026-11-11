# Data attribution and licences

The bundled `data/catalog.json` is a derived work of three openly licensed sources. It was built
by `scripts/build_catalog.py` on 2026-11-11. Each catalog row repeats the credit that applies to it.

## Intelligence: Epoch AI Capabilities Index (CC BY)

Epoch AI, 'Capabilities & benchmarking'. Published online at epoch.ai. Retrieved from 'https://epoch.ai/benchmarks/use-this-data' [online resource]. Accessed 11 Nov 2026.

Licence: [Creative Commons Attribution](https://creativecommons.org/licenses/by/4.0/). Epoch AI's data is free to use, distribute
and reproduce provided the source and authors are credited.

Only `epoch_capabilities_index/eci_scores.csv` is read, which is Epoch's own data. The `*_external.csv` files keep their
upstream licences and are not used. No benchmark question or answer is included.

Changes: subset to the models in this catalog; each ECI score is rescaled to 0-100 (the original
value is kept as `intelligence.raw`).

## Intelligence fallback: LMArena Bradley-Terry rating (CC BY 4.0)

LMArena (Chatbot Arena) leaderboard, Bradley-Terry rating (style-controlled). Source: the
`lmarena-ai/leaderboard-dataset` dataset on Hugging Face (https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset), config
`text_style_control`, split `latest`, category `overall`, leaderboard publish date 2026-11-09.
Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The rating is a Bradley-Terry score, not an Elo rating (LMArena moved from Elo to Bradley-Terry on
9 January 2024; style control became the default on 16 May 2025).

Changes: the field `rating` is renamed `arena.rating`; the data is subset to the models in this
catalog. Where a model has no ECI value, the rating is mapped onto the ECI scale with a least-squares
line fitted on the models that have both, then rescaled to 0-100 (see `scale` in the catalog).

## Price: LiteLLM (MIT)

Prices and context lengths come from `model_prices_and_context_window.json` in the BerriAI/litellm repository
(commit 8b8ec4e3a64facae7af657ab06bc214dd5bf9060, 2026-11-11). Each row keeps LiteLLM's own `source` as
`price.row_source`. 11 rows whose source is a third-party benchmark aggregator or mirror, and every row
served by an aggregator or reseller provider outside the allowed list, are dropped.
Blended price: blended_per_M = (3 * input_per_M + 1 * output_per_M) / 4.

```text
Portions of this software are licensed as follows:

* All content that resides under the "enterprise/" directory of this repository, if that directory exists, is licensed under the license defined in "enterprise/LICENSE".
* Content outside of the above mentioned directories or restrictions above is available under the MIT license as defined below.
---
MIT License

Copyright (c) 2023 Berri AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Speed

There is no speed data in this catalog. No public source of per-model hosted-API speed can be
redistributed. Iolite records tokens per second from your own calls, on your own machine, and
never uploads them.

## Not affiliated

Epoch AI, LMArena and BerriAI do not endorse Iolite.
