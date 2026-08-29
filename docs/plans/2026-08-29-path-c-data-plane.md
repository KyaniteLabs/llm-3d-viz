# Path C — public/private data-plane split (CEO-approved 2026-08-29)

## Context

- CEO ruling 2026-08-29: launch HOLD on data legality; GC read (MSG-20260829-GC-007,
  AA Data Platform Terms v1.1 read in full) found the public site breaches AA's
  free-tier terms **today** (§2.3 internal-only + two narrow carve-outs; §2.4(c)/(d)
  customer-facing embedding; §2.5 Competitive Product — binds every tier incl.
  Commercial absent written consent; Pro does NOT cure). Automated OpenRouter pulls
  carry the same class of exposure (their ToS §§7/12); cure = first-party vendor
  pricing pages (pipeline follow-up, not this block).
- CEO picked **Path C** ("do c for now… ok path c approvd"): lawful-$0 interim.
  The 3D observatory itself (code/design/interaction) is ours; only the DATA
  plane changes per surface.
- Private instance (Tailscale) keeps the FULL AA-fed catalog — internal use is
  permitted by the free tier.

## Data-plane inventory (models.v0.draft.json, 323 rows)

Fields by `sources[f].origin`:

| Field | aa-api rows | Notes |
|---|---|---|
| aa_intelligence_index | 319 | y-axis — stripped publicly |
| tps / ttft | 319 | z-axis family — stripped |
| price_in/out/cache_per_M | 319/319/182 | x-axis family — stripped |
| blended_price_per_M | 301 aa + 18 openrouter | stripped both origins publicly |
| coding_index / agentic_index | 172 / 155 | AA-derived — stripped |
| cost_per_index_task_usd / time_per_index_task_s | 145 / 319 | derived-from-AA — stripped |
| modality | 245 aa-api | PUBLIC FACT (vendor pages) — re-source to `curated`, keep |
| context_length | 119 openrouter | PUBLIC SPEC — keep for now, re-source pipeline owed |
| arena_elo | 80 (arena) | LMArena public leaderboard facts, attributed — KEEP |
| swe_bench / gpqa | 2 / 1 (provider) | vendor-published — KEEP |
| openness, provider, family, effort, dates | — | curated/ours — KEEP |

Rows with no aa-api ii/tps/price today: **4**. The public 3D graph therefore
starts near-empty and refills as org measurements land (CS reference-machine
lane; convergence with Path B). Honesty-core null handling already renders
"not measured" everywhere — the architecture anticipated this.

## Design

1. **Trim transform** — `scripts/gen-public-catalog.mjs`: reads
   `data/models.v0.draft.json`, emits `data/generated/public-catalog.json` with
   every field whose `origin` ∈ {`aa-api`, `aa`, `openrouter`} **nulled** (value
   null + sources entry removed) EXCEPT modality/context_length (re-sourced to
   `curated`/`provider` — public specs, not AA/OR expression). Idempotent;
   test-asserted zero aa-api/aa/openrouter origins in output.
2. **Build modes** — `npm run build` (private, unchanged, full data) vs
   `npm run build:public` (Vite `resolve.alias` + generator scripts pointed at
   the trimmed catalog via `VIZ_DATA_PLANE=public`). Generated surfaces (model
   pages, embeds, compare, sitemap, llms.txt, frontier-watch) all read through
   one catalog-loader helper that respects the mode.
3. **Hygiene set (both planes)** — `/sources/` static page: every retained
   source named + linked (LMArena, vendor launch pages, first-party pricing),
   non-affiliation footer line ("model names are trademarks of their owners;
   not affiliated with, endorsed by, or sponsored by any provider or
   Artificial Analysis"), corrections/takedown channel = repo issues with a
   stated 5-business-day SLA. Footer link on all surfaces incl. embeds.
4. **OSS twin** — publish-oss.sh gains an AA-scrub step: the published data
   JSONs are the trimmed set (public plane), never the full catalog.
5. **Deploy** — public Cloudflare Pages uses `build:public` output through the
   standard gate checklist; private vps instance redeployed from full build.

## Verification gates

- vitest suite green both planes (new tests: transform nulls AA fields, keeps
  arena/provider/curated, re-sources modality; loader mode switch).
- Content assertions on `dist/`: zero `aa-api`/`"origin":"aa"`/`openrouter`
  provenance strings in public output; AA field names absent from public
  bundle beyond schema labels with all-null values; private dist unchanged.
- Nine-lane smoke both origins post-deploy.

## Follow-ups (not this block)

- First-party vendor pricing pipeline (replaces OR pulls; GC cure).
- Arena-elo axis option for the public graph (80 rows of lawful y-axis data).
- Own-measurement ingestion (CS-149 lane) — refills the public graph.
- AA Commercial Order Form quote (path A lever) — only on CEO word.
