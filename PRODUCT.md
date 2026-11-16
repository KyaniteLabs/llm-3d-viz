# Model Observatory (public repository)

A browser-based model-selection instrument for exploring intelligence, speed and cost trade-offs. Its core experience is to filter a curated catalog, inspect models in linked 3D/2D/table views, and use an intelligence floor plus cost/speed bias to form a Pareto shortlist—not to declare one model universally best.

## Existing surfaces and data

- Three.js stage, Plotly projections, family/effort trails, lab encoding, membership table, coverage/provenance display, shareable URL state and cinema presentation/export controls.
- [src/lib/decide.ts](src/lib/decide.ts): measured-data eligibility, cost/speed Pareto ranking, anchored/user floors and snapshot-tagged decision output.
- Atlas UI with offline catalog/state tools and an LLM tool-calling path; local CLI and stdio MCP entrypoints under [bin](bin/). These are not a hosted public MCP API.
- Generated static model cards/index, embeds, comparisons, source disclosures and Frontier Watch artifacts in `public/`.
- Catalog corpus: `data/models.v0.draft.json`, `data/generated/public-catalog.json`, manual additions, expected effort ladders/gaps, watchlist and slug aliases. At this inspected revision both catalog files contain **323 rows and zero rows complete on all three primary axes**. The public copy preserves missing/license-stripped metrics; it cannot supply measured three-axis picks merely because the UI renders. This is a snapshot count, not a live leaderboard claim.

## Important source/README differences

The README describes Atlas as offline-default. Actual `loadAtlasLlmConfig()` enables a same-origin proxy preset when browser storage is absent; incomplete config/failures can fall back offline. Do not send a prompt assuming it stays local. BYOK configuration is persisted in browser localStorage.

[README.md](README.md) identifies private Forgejo as product source of truth and GitHub as a separate deliberately published MIT edition—not a live mirror. These docs describe this public revision, not private catalog completeness, current hosted deployment or licensing clearance for all inputs. Test counts quoted in older prose are historical; bounded verification is reported separately.
