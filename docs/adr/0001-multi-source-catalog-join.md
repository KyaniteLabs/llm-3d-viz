# ADR-0001: Multi-source catalog join (two-layer)

## Status

Accepted (2026-08-05)

## Context

The product plots models on **speed × cost × intelligence**. Specialist databases publish different columns (Artificial Analysis Intelligence Index + TPS + price; Arena Elo; OpenRouter list prices). The expand pipeline previously dropped non-scorable AA rows **before** overlays could complete prices, and left `arena_elo` always null.

## Decision

Implement a **two-layer multi-source catalog join**:

1. **Enrichment** — identity-first partial assembly (AA spine), then Arena Elo (effort-safe) and OpenRouter list prices with provenance.
2. **Plot admission** — product JSON remains **scorable-only** under the default AA triple (Intelligence Index + TPS + blended cost). Arena Elo never admits a point alone.

Canonical identity uses dual keys (AA `slug::effort` spine; Arena match via slug + `normalizeFamily` + tier rules). Fail closed: no invented Fable (or other) unpublished effort tiers; no cross-effort Elo mixes.

## Consequences

- Richer catalog rows (`arena_elo`, optional `sources` provenance).
- Expand soft-fails Arena HTML without failing thrice-daily AA refresh.
- Fable multi-effort ladder remains max-only until AA (or equal) publishes tiers.
- Elo-as-intelligence-axis UI is a separate later change (axis-metrics), not required for enrichment.

## Alternatives considered

- AA-only wait for cards
- Paid AA API only (optional later feed, same join contract)
- OpenRouter price-only (subset; insufficient for Arena Elo)

## References

- Plan: `.omc/plans/ralplan-multi-source-catalog-join.md`
- Map: Forgejo #108
- PRD: Forgejo #118
