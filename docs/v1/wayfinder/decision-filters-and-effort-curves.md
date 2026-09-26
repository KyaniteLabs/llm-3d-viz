# Decision: visible-set filters + multi-effort curves (Simon 2026-08-03)

**Source:** live grilling reply in session  
**Tickets:** #51 (filters), #52 (multi-effort representation)

## Filters (locked)

| Control | Rule |
|---------|------|
| **Age (default on)** | Exclude models with `release_date` older than **6 months** from "today" (session date or build snapshot date — implementer: use data_date or wall clock; prefer `release_date` field). |
| **Provider / lab** | Multi-select filter by `provider` (AA "lab"/creator string as stored). |
| **Model family** | Multi-select filter by **family** within/across providers (schema: `family_id` or derived base name). Multiple families selectable. |

Default visible set = **age ≤ 6 months**, all providers/families in that window, **all effort tiers** for those models (see below). User can further restrict by provider and family.

## Multi-effort on one graph (locked)

- **All effort tiers available and plotted on the same 3D graph** (not collapsed to max/high only).
- User wants to **see the curve for each model family**: connect effort variants of the same family as a **polyline / trail** through cost–intel–speed space (or the active projected metrics), so intensity is a path, not only discrete points.
- Implies dataset expansion: one row per AA effort variant + `family_id` + `effort_tier`.

## Still open (not in this answer)

- Semantic color meaning (#53)
- Full chart inventory beyond hero (#54)
- 3D cost = $/M vs $/task (#50) — research recommends $/M on hero until $/task data exists
- Exact family_id derivation rules and trail geometry (chord order by effort rank)

## Implementation notes (non-binding)

- Age filter is the density fix Simon asked for first.
- Trails must not invent intermediate models (same honesty rule as Pareto ridge: chords between real points only).
- Filtering re-normalizes value score / frontier over **visible set** (frontier-math).


## Encoding note (2026-08-04)

Under curve-focus, **singleton dimming** (single-effort families in the post-filter visible set) is a visual hierarchy only. Dimmed points remain in the visible set, value-score, and frontier. Age ≤ 6 months remains the density floor. A real multi-effort-only *stage* filter is not the product default; only if first-paint gate fails should that filter decision be reopened.
