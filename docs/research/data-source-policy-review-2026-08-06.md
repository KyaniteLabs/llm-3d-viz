# Data source policy review (research, not legal advice)

**Date:** 2026-08-06  
**Operator product:** llm-3d-viz (public 3D speed × cost × intelligence viz; offline catalog → static JSON)  
**Pipeline:** `scripts/expand-aa-multi-effort.mjs`, `scripts/lib/aa-api.mjs`, `scripts/lib/arena-hf.mjs`, `scripts/lib/openrouter-api.mjs`, `scripts/lib/catalog-join.mjs`  
**Status:** Research for the operator. **Not legal advice.** No counsel relationship. Do not treat this as a compliance sign-off.

## Implementation status (2026-08-06)

| Action | Status |
|--------|--------|
| AA HTML scrape → **Data API free** (`/api/v2/language/models/free`, `x-api-key`) | **Done** — requires `AA_API_KEY` |
| Arena HTML scrape → **HF `lmarena-ai/leaderboard-dataset`** (CC BY 4.0) | **Done** |
| OpenRouter models API + UA hygiene | **Done** |
| Product **Data sources** footer attribution | **Done** (status bar) |

Still recommended: contact AA for explicit redistribution/commercial terms beyond free-tier attribution if the public viz is long-term commercial.

---

## Scope & method

### In scope

Whether current **ingestion** practices appear *compatible on their face* with the **public** policies of:

1. **Artificial Analysis** (`artificialanalysis.ai`) — HTML scrapes of public pages  
2. **OpenRouter** (`openrouter.ai`) — HTTP GET to public models API  
3. **Arena** (`arena.ai` / LMArena lineage) — HTML scrape of text leaderboard  

Also noted: redistribution of extracted numbers into a **shipped static JSON catalog** and a **public product** at viz.kyanitelabs.tech.

### Method

- Inspected repo ingestion code (what URLs, headers, volume, outputs).  
- Fetched primary policy pages with HTTP clients (curl), including PDFs where linked.  
- Fetched `robots.txt` for each host.  
- Preferenced **primary** ToS / API docs / official datasets over third-party blogs.  
- **Quoted** short clauses; distinguished **fact (quoted)** vs **inference**.  
- If a page failed or was only partially parseable (JS-heavy SPA), that is noted under **Confidence & gaps**.

### What we do *not* claim

- No opinion on enforceability, fair use, database rights doctrine, or jurisdiction.  
- No private partner contracts, API subscription agreements, or email negotiations (not public).  
- `robots.txt` is a crawl convention, **not** a license grant; ToS can forbid what robots allow.

---

## Per-source findings

### Artificial Analysis

#### What we do today

**Fact (code):** The expand pipeline GETs public HTML with a browser-like User-Agent and parses embedded model arrays / Next payloads:

| URL pattern | Role |
|-------------|------|
| `https://artificialanalysis.ai/leaderboards/models` | Leaderboard scrape |
| `https://artificialanalysis.ai/models` | Catalog scrape |
| `https://artificialanalysis.ai/models/{slug}` | Model cards (including deep scrape of up to ~40 effort-variant slugs) |
| `https://artificialanalysis.ai/providers/{org}` | Provider page |

- Mapped fields include Intelligence Index, TPS/speed, prices, task cost/time when present (`mapAaRow` / extractors in `scripts/lib/aa-extract.mjs`).  
- `source_url` points at `https://artificialanalysis.ai/models/...`.  
- **No** AA API key is used; **no** delay/backoff between card fetches beyond sequential `await`.  
- User-Agent (code):  
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36`  
- Output is joined into `data/models.v0.draft.json` (and related artifacts) and shipped as static catalog data for a public viz.

**Inference:** Volume is offline/batch (cron-capable), not live browser scraping per visitor — still automated extraction + redistribution of site-published metrics.

#### Policy documents found (links + date accessed)

| Document | URL | Accessed |
|----------|-----|----------|
| Website Terms of Use (PDF, Version 1.0, last revised **April 28, 2024**) | https://artificialanalysis.ai/docs/legal/Terms-of-Use.pdf | 2026-08-06 |
| Privacy Policy (PDF) | https://artificialanalysis.ai/docs/legal/Privacy-Policy.pdf | 2026-08-06 |
| Data API docs (attribution, tiers, rate limits) | https://artificialanalysis.ai/data-api/docs | 2026-08-06 |
| Data API product page | https://artificialanalysis.ai/data-api | 2026-08-06 |
| API reference (legacy/free framing) | https://artificialanalysis.ai/api-reference | 2026-08-06 |
| robots.txt | https://artificialanalysis.ai/robots.txt | 2026-08-06 |

No HTML `/terms` or `/privacy` pages (404); legal docs are PDFs linked from the site footer / API docs.

#### Key clauses (quotes)

**Personal, noncommercial site license** (ToS §2.1):

> Subject to these Terms, Company grants you a non-transferable, non-exclusive, revocable, limited license to use and access the Site solely for your own personal, noncommercial use.

**Restrictions — commercial exploit, competitive product, copy/redistribute** (ToS §2.2):

> (a) you shall not license, sell, rent, lease, transfer, assign, distribute, host, or otherwise commercially exploit the Site, whether in whole or in part, or any content displayed on the Site;  
> (b) you shall not modify, make derivative works of, disassemble, reverse compile or reverse engineer any part of the Site;  
> (c) you shall not access the Site in order to build a similar or competitive website, product, or service; and  
> (d) except as expressly stated herein, no part of the Site may be copied, reproduced, distributed, republished, downloaded, displayed, posted or transmitted in any form or by any means.

**Explicit anti-scrape / automated agents** (ToS Acceptable Use §3.3(b)):

> … use software or automated agents or scripts to produce multiple accounts on the Site, or to generate automated searches, requests, or queries to (or to strip, scrape, or mine data from) the Site (provided, however, that we conditionally grant to the operators of public search engines revocable permission to use spiders … subject to the parameters set forth in our robots.txt file).

**Copyright ownership of Site content** (ToS §2.5 / §10.7):

> … all the intellectual property rights, including copyrights … in the Site and its content are owned by Company or Company’s suppliers.  
> Copyright © 2024 Artificial Analysis, Inc. All rights reserved.

**Official Data API — product-oriented use + attribution** (Data API docs, “Attribution and licensing”):

> Use of the API requires attribution across all tiers. When you display or share API data, credit [Artificial Analysis](https://artificialanalysis.ai) as the source. A visible byline or footer link is sufficient.  
> Use of the API is also subject to our [Terms of Use](https://artificialanalysis.ai/docs/legal/Terms-of-Use.pdf). For redistribution rights or bespoke contract terms, [contact the team](https://artificialanalysis.ai/data-api#contact).

**API marketing language** (Data API product page):

> Use the data behind every chart … Fetch the same benchmark, pricing, and performance data we publish on Artificial Analysis.  
> Use our benchmark and market intelligence dataset inside your own products, research, analysis, and monitoring systems.

**Free tier** (Data API docs): public language models endpoint with headline indices, median performance, input/output pricing; **100 requests / 24h fixed window**; Pro 500/24h; Commercial custom. Auth: `x-api-key` (unauthenticated call to free endpoint returned **401** “API key is required” on 2026-08-06).

#### robots.txt summary

```
User-Agent: *
Allow: /

Sitemap: https://artificialanalysis.ai/sitemap.xml
(+ locale sitemaps)
```

**Fact:** Paths used by the pipeline (`/leaderboards/models`, `/models`, `/models/*`, `/providers/*`) are **not** disallowed.  
**Inference:** robots permission is **not** a ToS carve-out for product scrapers (ToS only carves public search engines).

#### Risk notes

| Risk | Level | Reasoning |
|------|-------|-----------|
| Automated HTML scrape of AA pages | **High** | ToS §3.3(b) expressly forbids scripts that “strip, scrape, or mine data from” the Site; only search engines get a robots-conditioned exception. Pipeline is exactly automated HTML extraction. |
| Building a public speed×cost×intelligence product from AA metrics | **High** | §2.2(c) forbids accessing the Site to build a “similar or competitive” product; AA itself publishes Intelligence Index / price / speed charts and markets the same data via API. §2.1 limits Site license to personal noncommercial use. |
| Redistributing numbers in static JSON + public UI | **High** | §2.2(a)(d) bar commercial exploit and copy/republish of “content displayed on the Site.” Shipping a derivative catalog is redistribution of that content (fact of what the product does; legal character is for counsel). |
| Using official Free API with attribution | **Lower than scrape (still not zero)** | API docs *invite* product integration and only require attribution + contact for redistribution rights. Same ToS PDF is still incorporated; Free tier field set may not cover all fields you scrape today. |
| robots.txt violation | **Low** | robots allows crawl; risk is ToS, not robots. |
| Impersonating a browser UA while scripting | **Med** | Not separately banned in text beyond scrape ban; still looks like evasion of “automated agents” framing. Prefer honest bot UA on any permitted channel. |

**Fact vs inference:** Quotes above are **fact**. Mapping “our viz competes with AA charts” is **inference** (product similarity judgment). Whether “commercial” applies to a free public site with no paywall is **inference** / legal question.

#### Safer alternatives if any

1. **Preferred technical path:** Create an AA Insights account, use **Data API Free** (`GET /api/v2/language/models/free` or documented free endpoints) with `x-api-key`; stay under 100 req/day; cache offline.  
2. **Attribution:** Visible byline/footer: “Intelligence / speed / pricing metrics: Artificial Analysis (artificialanalysis.ai)” with link.  
3. **Redistribution / static ship / public product:** Per API docs, **contact** AA for redistribution / bespoke terms before shipping their numbers as a permanent public dataset.  
4. **Pro/Commercial tiers** if Free fields are insufficient (blended pricing, percentiles, provider-level, history).  
5. **Do not** deep-scrape dozens of model cards when an authenticated list endpoint exists.  
6. **Manual** one-off export for a tiny curated set only as stopgap, still subject to ToS — not a free pass.

---

### OpenRouter

#### What we do today

**Fact (code):** `scrapeOpenRouter()` issues:

```http
GET https://openrouter.ai/api/v1/models
Accept: application/json
User-Agent: <browser-like UA>
```

No `Authorization` header. Response used for **list price overlay** (`price_in` / `price_out` / blended) with provenance stamps (`origin: "openrouter"`). Snapshot may be written to `data/openrouter-snapshot.json`. Does **not** invent IQ/speed.

**Fact (live check 2026-08-06):** Unauthenticated `GET /api/v1/models` returned **HTTP 200** with a large `data` array (~400 models). Official docs examples show `Authorization: Bearer <token>`.

#### Policy documents found

| Document | URL | Accessed |
|----------|-----|----------|
| Terms of Service (Last Updated: **July 29, 2026**) | https://openrouter.ai/terms | 2026-08-06 |
| Privacy Policy | https://openrouter.ai/privacy | 2026-08-06 (linked; not fully re-quoted) |
| List models API docs | https://openrouter.ai/docs/api-reference/models/get-models | 2026-08-06 |
| Rate limits docs | https://openrouter.ai/docs/api_reference/limits | 2026-08-06 (search/snippet + related) |
| robots.txt | https://openrouter.ai/robots.txt | 2026-08-06 |

#### Key clauses (quotes)

**Prohibited Conduct — competing service & scraping** (ToS §7):

> BY USING THE SERVICE, YOU AGREE NOT TO:  
> …  
> access the Site or Service for purposes of reselling API access to Models or otherwise developing a competing service;  
> …  
> develop, support or use software, devices, scripts, robots or any other means or processes (such as crawlers, browser plugins, add-ons or any other automated technology) to scrape or copy any information on the Site or the Services;  
> bypass any technical measures implemented by OpenRouter that are designed to prevent scraping;

**Materials / IP** (ToS §12):

> The visual interfaces, graphics, design, compilation, information, data, computer code … and all other elements of the Service (“Materials”) provided by OpenRouter are protected by intellectual property and other laws. … Except as expressly authorized by OpenRouter, you may not make use of the Materials.

**Documented API access** (List models docs): `GET https://openrouter.ai/api/v1/models` with optional Bearer token examples; returns model metadata including `pricing.prompt` / `pricing.completion`.

**robots.txt:**

```
User-Agent: *
Allow: /
Disallow: /seo/
Sitemap: https://openrouter.ai/sitemap.xml
```

#### robots.txt summary

API path is not disallowed. Site SEO paths blocked. No special bot policy beyond that.

#### Risk notes

| Risk | Level | Reasoning |
|------|-------|-----------|
| Using documented `GET /api/v1/models` for list prices | **Low–Med** | Intended public API surface; works without key today. Distinct from HTML scraping of marketing pages. |
| Interpreting §7 “scrape … Site or the Services” as banning *all* automated API calls | **Med (ambiguity)** | Broad wording; **inference:** normal use of published REST endpoints is what the API is for; still, no explicit data license for *redistributing* the model list as your own dataset. |
| “Developing a competing service” | **Low** (for this product) | llm-3d-viz is a viz overlay of list prices, not an LLM router / credit reseller. **Inference.** |
| Shipping price fields in static JSON | **Low–Med** | List prices are often mirrored from providers; OpenRouter claims Materials IP in aggregate. No CC-style license found for the models list. Attribution is good hygiene; exclusive reliance as “the OpenRouter ranking product” would be riskier. |
| Rate / DDoS | **Low** at current offline cadence | Limits docs describe free-model caps and Cloudflare DDoS protection; a single catalog refresh is modest. |
| Auth without key | **Low operational; document drift** | Live unauthenticated 200 vs docs Bearer example — prefer optional key if behavior changes. |

No explicit required attribution wording found for the models endpoint. No “non-commercial only” clause found in the reviewed ToS excerpts.

#### Safer alternatives if any

1. Keep using **only** the documented models API (not HTML rankings pages).  
2. Add optional `OPENROUTER_API_KEY` for future-proofing if unauthenticated access is locked down.  
3. Cache snapshot; refresh on a human timescale (e.g. daily/weekly), honor 429 / Retry-After.  
4. Attribute in UI: “List prices via OpenRouter API (openrouter.ai)” — not required by quote, still good practice.  
5. Prefer provider-native pricing pages if OpenRouter ever objects to redistribution of their compiled list.

---

### Arena / LMArena / arena.ai

#### Brand lineage (fact + public narrative)

| Era | Brand / domain | Notes |
|-----|----------------|-------|
| 2023 | Chatbot Arena | UC Berkeley / LMSYS academic project |
| ~2024 | **lmarena.ai** | Standalone site after LMSYS incubation |
| 2025–2026 | **arena.ai** — Arena Intelligence, Inc. | Current product/company; ToS party is Arena Intelligence, Inc. |
| Parallel | `lmarena.ai` | Still serves similar robots/sitemap patterns; help center also references `help.lmarena.ai` URLs |

**Fact:** This project scrapes `https://arena.ai/leaderboard/text` for **arena_elo** enrichment (soft-fail; not sole plot admit).

#### What we do today

**Fact (code):** `scrapeArenaEntries()` GETs HTML of `https://arena.ai/leaderboard/text` (or fixture / `SKIP_ARENA=1`), parses embedded entries (`extractArenaEntriesFromHtml` in `catalog-join.mjs`), overlays Elo onto catalog rows. Soft-fail does not block the rest of the build.

#### Policy documents found

| Document | URL | Accessed |
|----------|-----|----------|
| Terms of Use Agreement (Last Updated Date: **2026-02-23**) | https://help.arena.ai/articles/5629909088-terms-of-use (also linked as site `/terms-of-use`) | 2026-08-06 |
| Privacy Policy | https://help.arena.ai/articles/3765052346-privacy-policy | 2026-08-06 (linked) |
| Arena Leaderboard Policy (blog, **2026-04-30**) | https://arena.ai/blog/policy/ | 2026-08-06 |
| Arena Leaderboard Dataset announcement (**2026-04-02**) | https://arena.ai/blog/arena-leaderboard-dataset | 2026-08-06 |
| Hugging Face dataset `lmarena-ai/leaderboard-dataset` | https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset | 2026-08-06 |
| robots.txt (arena.ai and lmarena.ai) | https://arena.ai/robots.txt , https://lmarena.ai/robots.txt | 2026-08-06 |

#### Key clauses (quotes)

**User Conduct — commercial exploit of Service, programmatic access, scrape** (ToS “USER CONDUCT AND CERTAIN RESTRICTIONS”):

> You shall not (and shall not permit any third party) to:  
> (i) license, sell, rent, lease, transfer, assign, reproduce, mirror, distribute, host, otherwise commercially exploit, or cause, authorize, or pay others to access the Service, the Output, or any portion of the foregoing;  
> …  
> (vi) access the Services through programmatic or automated means or automatically query the Services,  
> (vii) use any manual or automated software, devices or other processes (including but not limited to spiders, robots, scrapers, crawlers, avatars, data mining tools, or the like) to “scrape”, extract, or download data, **including AI Service names, identifiers, or versions**, from any web pages contained in the Service (except that we grant the operators of public search engines revocable permission …);  
> …

**Ownership / trademarks** (ToS OWNERSHIP):

> … Company and its suppliers or licensors own all rights, title and interest in the Service …  
> Arena, Arena Intelligence, and all related stylizations, graphics, logos … may not be used without permission …

**Official open dataset** (blog 2026-04-02):

> … today we're releasing the entire history of those leaderboards as a public-access dataset.  
> … Hugging Face dataset accessible at https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset  
> … subsets … text … (with style-controlled variant) … splits `latest` and `full`.

**HF license (dataset card):** `License: cc-by-4.0` (Creative Commons Attribution 4.0 International).

**CC BY 4.0 (deed summary, creativecommons.org):** free to **Share** and **Adapt**, including commercially, if you give **appropriate credit**, link the license, and indicate changes; no additional restrictions that legally block license rights.

**Leaderboard Policy** (transparency / research data sharing — not a scrape license):

> Transparency. The model evaluation and ranking pipelines have been open sourced in the Arena-Rank repository. We release a fraction of the data collected from the platform, as well.  
> Sharing data. We periodically share portions of our data with the community to support research and transparency.

#### robots.txt summary (arena.ai; lmarena.ai analogous)

- **Allow:** `/`, `/leaderboard`, `/leaderboard/text`, many other leaderboard paths, `/blog`, `/terms-of-use`, etc.  
- **Disallow:** `/api/`, `/nextjs-api/`, `/_next/`, `/admin/`, `/images/`  

**Fact:** HTML leaderboard path is allowed by robots; **internal APIs are disallowed**.  
**Inference:** ToS still forbids non-search-engine scraping of web pages even when robots Allows the path.

#### Risk notes

| Risk | Level | Reasoning |
|------|-------|-----------|
| HTML scrape of `/leaderboard/text` | **High** | ToS (vi)+(vii) explicitly ban programmatic access and scraping/extracting data *including model names/ids* from web pages. Matches current code. |
| Soft-fail / low frequency | **Does not cure ToS ban** | Still automated extract. |
| Using HF `leaderboard-dataset` (CC BY 4.0) for Elo overlay | **Low** (if attribution correct) | Official public release for community use; commercial share/adapt allowed under CC BY. Prefer `text` or `text_style_control` + `latest` split. |
| Shipping Elo in public product without credit | **Med** under CC BY | Attribution is a hard condition of CC BY 4.0. |
| Trademark “Arena” / logos in UI | **Med if branding-heavy** | ToS: marks may not be used without permission; text credit (“Arena leaderboard scores”) is usual hygiene, not logo reuse. |
| robots-only defense | **Weak** | robots Allow ≠ ToS allow. |

#### Safer alternatives if any

1. **Replace HTML scrape** with Hugging Face dataset pull:  
   `https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset`  
   subsets e.g. `text` / `text_style_control`, split `latest`.  
2. **CC BY 4.0 attribution** in product + dataset docs, e.g.  
   “Arena scores from the Arena Leaderboard Dataset (lmarena-ai/leaderboard-dataset), CC BY 4.0 — https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset — https://arena.ai”  
   Note if you transformed scores (e.g. mapped names, filtered).  
3. Keep `SKIP_ARENA` / fixture path for CI so builds never hit arena.ai HTML.  
4. Do **not** hit disallowed `/api/` or `/nextjs-api/` on arena.ai.  
5. Optional: open-source ranking code `Arena-Rank` is methodology, not a substitute for score data license.

---

## Cross-cutting recommendations for llm-3d-viz

### Attribution we should display

Minimum practical footer / About / data-sources panel (product UI + README):

1. **Artificial Analysis** — required *if* using their API (quoted). Recommended even if only historical snapshot until migration:  
   “Model intelligence, speed, and pricing metrics from [Artificial Analysis](https://artificialanalysis.ai).”  
2. **OpenRouter** — recommended:  
   “List token prices via the [OpenRouter](https://openrouter.ai) models API.”  
3. **Arena** — required under CC BY if using HF dataset:  
   “Arena scores from [Arena Leaderboard Dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) (CC BY 4.0), published by Arena / Arena Intelligence.”  
4. Disclaim: metrics are third-party snapshots, not endorsements; dates of snapshot; methodology links (AA methodology page, Arena leaderboard policy).

### Caching / rate-limit hygiene

- Offline cron is good; avoid tight loops of dozens of AA card URLs.  
- AA Free API: **100 requests / 24h** shared per org/user scope; honor `X-RateLimit-*` / `Retry-After`.  
- OpenRouter: single models list fetch per refresh is fine; honor 429.  
- Arena: **prefer HF dataset download**, not HTML; cache parquet/JSON locally.  
- Identify the client: use a descriptive UA like `llm-3d-viz-catalog/1.0 (+https://viz.kyanitelabs.tech; contact@…)` on **permitted** channels; stop mimicking Chrome for scrapes you intend to eliminate.  
- Do not ship live scrape from the browser to third-party sites (keep server/offline only).

### What NOT to do

- Do **not** continue HTML scraping of AA pages as the primary production path while ToS forbids scrape + competitive products.  
- Do **not** HTML-scrape arena.ai leaderboards when a CC BY dataset exists.  
- Do **not** hit Arena `/api/` or `/nextjs-api/` (robots Disallow + ToS).  
- Do **not** claim endorsement by AA, OpenRouter, or Arena.  
- Do **not** strip provenance fields from catalog rows.  
- Do **not** republish full bulk dumps of AA Pro/Commercial-only fields without a contract.  
- Do **not** treat robots.txt Allow as a license.  
- Do **not** treat this research note as legal clearance.

### When to seek counsel

- Before relying on AA-derived metrics as the **core** of a public commercial (or reputation-bearing) product without API + written redistribution terms.  
- If you receive a cease-and-desist, rate-limit/block, or partner outreach.  
- If you expand into selling the catalog, white-label, or high-volume redistribution.  
- If you need a formal fair-use / database-rights analysis (jurisdiction-specific).  
- If trademarks/logos of AA or Arena will appear in marketing beyond plain-text credit.

### Suggested product UI copy for “data sources”

**Short (footer):**

> Metrics snapshot for research/decision support only. Intelligence, speed, and task pricing: [Artificial Analysis](https://artificialanalysis.ai). List prices: [OpenRouter](https://openrouter.ai). Preference scores: [Arena Leaderboard Dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) (CC BY 4.0). Not affiliated with or endorsed by data providers. Catalog rebuilt offline; see dataset `data_date` fields.

**Longer (About / DATA.md):**

> This visualization joins independently published public metrics.  
> • **Artificial Analysis** supplies Intelligence Index and measured performance/pricing where indicated (`sources.*.origin = "aa"`). Prefer their Data API; display requires attribution to artificialanalysis.ai.  
> • **OpenRouter** supplies optional list-price overlays from `GET /api/v1/models` (`origin = "openrouter"`).  
> • **Arena** preference scores, when present, come from the public CC BY 4.0 leaderboard dataset (not live HTML scrape) (`origin = "arena"`).  
> Values can lag provider changes. Always verify on the provider’s own docs before production model selection.

### Engineering priority order (practical)

1. **Stop AA HTML scrape** → Free/Pro API + attribution + ask about redistribution.  
2. **Stop Arena HTML scrape** → HF dataset + CC BY attribution.  
3. Keep OpenRouter models API; optional auth header; cache; attribute.  
4. Surface data sources in UI (currently provenance exists in JSON schema more than user-facing copy).  
5. Document snapshot dates and field-level `sources` in the UI tooltip/readout.

---

## Sources cited

Every URL actually opened or HTTP-fetched in this review:

### Artificial Analysis
- https://artificialanalysis.ai/robots.txt  
- https://artificialanalysis.ai/docs/legal/Terms-of-Use.pdf  
- https://artificialanalysis.ai/docs/legal/Privacy-Policy.pdf  
- https://artificialanalysis.ai/data-api/docs  
- https://artificialanalysis.ai/data-api  
- https://artificialanalysis.ai/api-reference  
- https://artificialanalysis.ai/api/v2/language/models/free (auth probe; 401)  
- https://artificialanalysis.ai/ (footer link discovery)

### OpenRouter
- https://openrouter.ai/robots.txt  
- https://openrouter.ai/terms  
- https://openrouter.ai/privacy (linked; not fully excerpted)  
- https://openrouter.ai/docs/api-reference/models/get-models  
- https://openrouter.ai/docs/api/api-reference/models/get-models  
- https://openrouter.ai/api/v1/models (live unauthenticated probe)  
- https://openrouter.ai/docs/api_reference/limits (rate-limit context via search/docs graph)

### Arena / LMArena
- https://arena.ai/robots.txt  
- https://lmarena.ai/robots.txt  
- https://help.arena.ai/articles/5629909088-terms-of-use  
- https://help.arena.ai/articles/3765052346-privacy-policy  
- https://arena.ai/terms-of-use  
- https://arena.ai/privacy-policy  
- https://arena.ai/blog/policy/  
- https://arena.ai/blog/arena-leaderboard-dataset  
- https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset  
- https://creativecommons.org/licenses/by/4.0/

### Repo (local)
- `/Users/simongonzalezdecruz/workspaces/llm-3d-viz/scripts/expand-aa-multi-effort.mjs`  
- `/Users/simongonzalezdecruz/workspaces/llm-3d-viz/scripts/lib/aa-extract.mjs`  
- `/Users/simongonzalezdecruz/workspaces/llm-3d-viz/scripts/lib/catalog-join.mjs`  
- `/Users/simongonzalezdecruz/workspaces/llm-3d-viz/docs/research/dataset-v0-sources.md`

---

## Confidence & gaps

### High confidence
- AA Website ToS (PDF text extracted) expressly bans scraping and limits site use to personal noncommercial; competitive-product and republish restrictions are explicit.  
- AA offers an official Data API with free tier, rate limits, and **required attribution**; redistribution called out as contact-needed.  
- Arena ToS expressly bans programmatic access and page scraping including model identifiers.  
- Arena publishes an official HF leaderboard dataset under **CC BY 4.0**.  
- OpenRouter exposes a documented models list API used by this project; unauthenticated GET succeeded on the review date.  
- robots.txt contents for all three hosts as quoted.

### Medium / gaps
- **Interaction of AA Website ToS with paid/free Data API:** API docs incorporate the same ToS PDF while marketing “use in your products.” Public text does not fully resolve redistribution of static catalogs; **written confirmation from AA is the gap.**  
- **OpenRouter §7** wording is broad (“scrape … Services”); no court or provider guidance found distinguishing API clients from scrapers — treated as ambiguity, not a finding of breach.  
- **OpenRouter** models endpoint: docs show Bearer token; live unauthenticated access may change without notice.  
- Full OpenRouter ToS is long; only sections on prohibited conduct, materials, and service overview were closely quoted. No separate “data license” page found.  
- Arena help-center HTML is widget-heavy; quotes taken from extracted text of the ToS article (Last Updated Date 2026-02-23).  
- HF dataset schema vs project’s Elo scale/name matching was **not** validated end-to-end in this review (integration work remains).  
- Whether viz.kyanitelabs.tech is “commercial” under various ToS definitions is a **legal characterization**, not established here.  
- Database rights (EU) and copyright in **facts vs compilation** not analyzed.  
- No attempt to locate private API partner agreements or older LMSYS licenses beyond public Arena HF release.

### Not verified
- AA Pro/Commercial contract terms (not public).  
- Whether AA free-tier fields cover every field currently scraped (task cost, blended, multi-effort cards).  
- OpenRouter Acceptable Use beyond §7 (full document not line-audited for every clause).  
- Whether `arena.ai/leaderboard/text` embeds the same rating scale as HF `text` / `text_style_control` columns (`score` vs classic Elo).

---

*End of research note. For product decisions that carry legal risk, obtain qualified legal counsel in the relevant jurisdiction.*
