# Distribution Surface — program plan (2026-08-29)

Status: CONSENSUS APPROVED (Architect + Critic, both APPROVE-WITH-CHANGES;
all blockers folded in). Council origin: MSG-20260826-COO-024 moves #2/#4.
Constraint: GPU-free (nucbox belongs to CS — standing CEO rule 2026-08-29).
Deploy posture: build + private twin always; public Pages only on Simon's go.
Reviews: this session (architect + adversary, evidence-cited, 2026-08-29).

## Phase 0 — Embed hotfix (live defect; ships alone, first)

`public/_headers` applies `X-Frame-Options: DENY` to `/*` — every `/m/` page
ships an iframe snippet (`gen-model-pages.mjs:59`) the public origin refuses
to frame. Confirmed defect, not "verify".

- Add `/embed/*` lane: `Content-Security-Policy: frame-ancestors *` (XFO
  cannot be unset by a more-specific rule; CSP wins in modern browsers).
- Verify the lane survives the Pages 308 pretty-URL redirect (5cc7932).
- Fix the false copy "live, always current — the page re-renders on every
  catalog refresh" (`gen-model-pages.mjs:67`) → "updates when the site
  deploys" (public deploys are approval-gated; #206 drift precedent).
- Extend `scripts/public-smoke.sh`: assert embed page CONTENT + the
  `frame-ancestors` header (content-assertion doctrine, BUG-SMELL §52).

## Phase 1 — Model page completion

- `scripts/lib/slug.mjs`: extract the slug fn (strip rule from
  `gen-model-pages.mjs:17`); import it in `scripts/frontier-watch.mjs:57`
  (kills the four trailing-dash links in `frontier-watch.md`). NO redirect
  machinery for these — the URLs were never valid or indexed (critic
  evidence).
- Slug renames: persistent committed alias registry `data/slug-aliases.json`
  (AA renames are real; old slugs unreconstructable) → generated
  `public/_redirects`; test fails when a catalog slug disappears without an
  alias entry. (Pages SPA fallback otherwise soft-404s with HTTP 200.)
- JSON-LD: ONE catalog-level `Dataset` (on `/m/` index, required props:
  variableMeasured/creator/distribution/dateModified) + per-model
  `WebPage` + `BreadcrumbList`. No per-model Dataset (spam at scale).
- Canonical + og/twitter meta on `/m/` pages (NOT on embeds — OG doesn't
  attribute from iframes).
- Provenance chips from the per-field `sources` map (honesty brand visible).
- Generator test suite born here (none exists today — sitemap dedupe bug
  3218c40 was this class): slug emission, JSON-LD parseability, null
  rendering (`num()`/`pct()` house style), sitemap idempotency.

## Phase 2 — Compare surface (staged)

Prerequisite: single-owner sitemap refactor first — `scripts/lib/sitemap.mjs`
called once after ALL generators. Current gen-model-pages re-reads the old
sitemap and filters known prefixes; a second generator's URLs would be
classified "base" and duplicated forever (BUG-SMELL §57 class). Idempotency
+ zero-duplicate-`<loc>` vitest. NO sitemap chunking (~1350 URLs ≪ 50k cap).

`scripts/gen-compare-pages.mjs`:
- Pairs: k=2 nearest Pareto neighbors per model + frontier pairs; unordered
  pair canonicalization (sorted slugs, ONE URL per pair); page-count bound
  test (generator FAILS above N) so drift can never walk toward N².
- STAGED: ~250 pairs first; GSC indexing/quality checkpoint before scaling
  to the full neighbor set (doorway risk is sitewide — burden of proof on
  the scaling decision, not the baseline).
- Honesty contract (blocking): verdict language gated on actual dominance
  via exported `computeFrontier` (already unit-tested) — "beats" only for
  dominance, trade-off phrasing otherwise; verdicts computed ONLY over
  fields non-null on both sides; null cells = em-dash + provenance chip;
  conditional fields (coding 47% null / agentic 52% null) render "not
  measured for both"; `data_date` stamped on every page.
- Internal links: `/m/` pages gain a comparisons block (else sitemap
  orphans).
- JSON-LD per compare: `WebPage` + `BreadcrumbList` only.

## Phase 3 — Embed lane (reduced)

KEEP: static zero-JS iframe cards, data-date stamps, header lane (Phase 0).
CUT (both reviewers): `<script>` live-embed variant — requires emitting
`public/catalog.json` (does not exist; new public artifact + scrub/OSS
surface), buys zero freshness (same approval-gated deploy), CSP-fragile on
host sites. If ever wanted: catalog.json emission is a separate proposal.

## Phase 4 — Frontier-watch feed (RSS/Atom)

- Durable feed source: committed `data/frontier-events.generated.json`
  (append in `frontier-watch.mjs`) — `.cache/frontier-watch/last.json` is
  gitignored AND capped at 30 entries; fresh clones/OSS twin would have an
  empty feed.
- Emit `public/frontier-watch.xml` (Atom) from the durable history;
  `_headers`: `Content-Type: application/atom+xml` + CORS + `Link`
  alternate; `<updated>` bumps ONLY on new events (no reader churn on
  no-movement builds).
- Sitemap + `llms.txt` + `robots.txt` entries; smoke content-assertion.
- Email alerts: deferred (needs sender/list/privacy — separate proposal).

## Cross-cutting

- Every phase: private build + VPS twin; public Pages on Simon's explicit
  go; `README`/`HANDOFF`/`llms.txt` updated in the same block; OSS
  republish via `publish-oss.sh` (dry-run first) after public-file changes.
- Generated-file churn roughly quadruples (3×/day cron rewrites embed
  DATA_DATE) — accepted, stated consciously.
- Non-risks (don't engineer): sitemap size, build time, Pages 20k-file cap.

## Verdict record

- Architect: APPROVE-WITH-CHANGES — sitemap ownership prerequisite, alias
  registry, catalog.json as explicit deliverable, frame-ancestors mechanism.
- Critic (adversary): APPROVE-WITH-CHANGES 8/10 — embed fix first (fairness
  inversion), cut script embed + chunking, staged compare rollout with GSC
  checkpoint, null-safe verdict contract, shared slug fix, copy truth fix.
- Disposition: both applied; trailing-dash redirects dropped (never-valid
  URLs), rename alias registry kept; catalog.json listed as Phase 3's
  future option, not a deliverable.
