# ADR-0001: Multi-source catalog join (two-layer)

## Status

Accepted (2026-08-05) · **Admit rule amended 2026-08-06**

## Context

The product plots models on **speed × cost × intelligence**. Specialist databases publish different columns (Artificial Analysis Intelligence Index + TPS + price; Arena Elo; OpenRouter list prices). The expand pipeline previously dropped non-scorable AA rows **before** overlays could complete prices, and left `arena_elo` always null.

## Decision

Implement a **two-layer multi-source catalog join**:

1. **Enrichment** — identity-first partial assembly (AA spine), then Arena Elo (effort-safe) and OpenRouter list prices with provenance (`sources` field).
2. **Plot admission (amended)** — admit a row when a **complete triple** exists after join:
   - **Intelligence:** `aa_intelligence_index` (AA measured — never invent; Arena Elo is not IQ)
   - **Speed:** `tps` (AA measured — never invent from OpenRouter)
   - **Cost:** `blended_price_per_M` from AA measured, AA-derived 7:2:1 blend, **or** OpenRouter list-derived blend with provenance
   - **Reject:** Arena Elo alone; OpenRouter price alone; missing IQ or TPS; invented numeric fields
   - Predicate: `canAdmitPlotTriple` / `isScorable` after join (`scripts/lib/catalog-join.mjs`)

Canonical identity uses dual keys (AA `slug::effort` spine; Arena match via slug + `normalizeFamily` + tier rules). Fail closed: no invented Fable (or other) unpublished effort tiers; no cross-effort Elo mixes; no fabricated Grok 4.6 (or any model) when sources lack a complete triple.

## Consequences

- Richer catalog rows (`arena_elo`, optional `sources` provenance).
- AA rows with IQ+TPS but missing price can admit after honest OpenRouter overlay.
- Expand soft-fails Arena HTML without failing thrice-daily AA refresh.
- Fable multi-effort ladder remains max-only until AA (or equal) publishes tiers.
- Elo-as-intelligence-axis UI is a separate later change (axis-metrics), not required for enrichment.

## Alternatives considered

- AA-only wait for cards
- Paid AA API only (optional later feed, same join contract)
- OpenRouter price-only (subset; insufficient for Arena Elo)
- OpenRouter-only admission without IQ (rejected — graph would lie)

## References

- Plan: `.omc/plans/ralplan-multi-source-catalog-join.md`
- Map: Forgejo #108
- PRD: Forgejo #118
