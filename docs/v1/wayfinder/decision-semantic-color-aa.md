# Decision: semantic color = Artificial Analysis pattern (Simon 2026-08-03)

**Ticket:** #53 Decide semantic color channels  
**Simon:** “use color the way that artificial analysis does.”

## Locked encoding

| Channel | How AA does it | How we do it |
|---------|----------------|--------------|
| **Primary fill color** | Open weights vs proprietary (legend: black proprietary, blue open / restricted-open) | **Openness class** from `openness` (+ optional restricted tier if we add it later). Not value-score beige heat as the main story. |
| **Reasoning** | Lightbulb icon | **Glyph / icon / outline mark** for `reasoning === true` — not a separate rainbow hue. |
| **Lab / provider** | Brand colors in multi-lab legends | **Stable provider/lab series color** for identity when many labs are visible (outline, legend swatch, or secondary channel). Family effort **curves keep one family color** along the trail. |
| **Not primary** | Continuous score heat as the lead | Copper/filament “decorative heat” is **not** the default fill. Optional later toggle only if explicitly reopened. |

## DESIGN-SYSTEM amendment (required)

Supersedes canvas-only monochrome / “copper never on canvas” / “never categorical color” for this product surface:

- Canvas **may** use categorical color for **openness** and **provider/lab identity** (AA pattern).
- **Shape** still encodes provider glyph variety where useful; color is not “random pretty.”
- Frontier/optimum still get **size / ridge / marker treatment**; they are not forced to abandon class readability.

## Implementation notes

- Legend must match stage 1:1 (Open / Closed [ / Restricted ], Reasoning icon, lab swatches if used).
- Filters (age, provider, family) do not change the color *meaning*, only the visible set.


---

## Instrument override (2026-08-04) — curve-focus product default

**Tickets:** #79 map · PRD #86 · RALPLAN A2  
**Supersedes for product default:** primary fill = openness.

| Channel | Product default (curve-focus) |
|---------|-------------------------------|
| Primary fill | Multi-effort **family series color** |
| Trail | Same family series color; real points only |
| Singleton | Dim slate (opacity 0.30, size ×0.55); still in score/frontier |
| Openness | Glyph only — not primary fill |
| Heat | `?heat=1` diagnostic only |
| Legacy AA openness fill | `?enc=openness` regression / screenshot path only |

Dim is **visual only** — does not remove models from the visible set, value-score, or frontier math.
