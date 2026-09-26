/**
 * Single source of truth for point-mark channels on the stage + projections.
 *
 * Channel matrix (curve-focus product default · 2026-08-06):
 *
 * | Channel              | Meaning                                      |
 * |----------------------|----------------------------------------------|
 * | Position X/Y/Z       | Cost / intelligence / speed (axis mapping)   |
 * | Fill color           | Lab brand hue + family shade                 |
 * | Trail                | Multi-effort path within a family            |
 * | Size                 | Value-score for current weights (+ floors)   |
 * | Shape geometry       | Openness only: wire sphere = closed · wire octa = open |
 * | Material             | All marks wireframe (no solid/wire split)    |
 * | Gold + max size      | Optimum (best for weights)                   |
 * | Ridge + size floor   | Pareto frontier                              |
 *
 * Lab is NEVER shape (color owns lab). Reasoning is NOT a stage glyph —
 * almost all new models are reasoning; it stays in inspector / filters / table.
 */

import type { Model, Plotly3dSymbol } from "../data/models";

/**
 * Three.js scene glyphs. Product marks always use wire (`*-open`) variants.
 * Solid kinds remain in the type for geometry helpers (e.g. brand core mesh).
 */
export type SceneGlyphKind =
  | "sphere"
  | "sphere-open"
  | "octa"
  | "octa-open"
  | "cross"
  | "x";

export interface MarkChannels {
  /** Plotly scatter3d symbol (2D + Plotly 3D fallback). */
  plotlySymbol: Plotly3dSymbol;
  /** Three.js glyph kind — always a wire (`*-open`) product mark. */
  sceneGlyph: SceneGlyphKind;
  openness: "open" | "closed";
  /** Pass-through for console/table — not used for glyph choice. */
  reasoning: boolean;
  /** Short legend id. */
  keyId: "closed-wire" | "open-wire";
  /** Human label for keys. */
  label: string;
}

/**
 * Resolve mark shape from openness only — all wire.
 * Optimum is gold + size; same openness glyph.
 * Reasoning does not change geometry.
 */
export function markChannels(
  model: Pick<Model, "openness" | "reasoning">,
): MarkChannels {
  const openness = model.openness === "open" ? "open" : "closed";
  const reasoning = Boolean(model.reasoning);

  if (openness === "open") {
    return {
      plotlySymbol: "diamond-open",
      sceneGlyph: "octa-open",
      openness,
      reasoning,
      keyId: "open-wire",
      label: "Open weights · wire octa",
    };
  }

  return {
    plotlySymbol: "circle-open",
    sceneGlyph: "sphere-open",
    openness,
    reasoning,
    keyId: "closed-wire",
    label: "Closed weights · wire sphere",
  };
}

/** Legend rows for glyph encoding (openness only · all wire). */
export const MARK_GLYPH_LEGEND: ReadonlyArray<{
  id: MarkChannels["keyId"];
  plotlySymbol: Plotly3dSymbol;
  sceneGlyph: SceneGlyphKind;
  title: string;
  detail: string;
}> = [
  {
    id: "closed-wire",
    plotlySymbol: "circle-open",
    sceneGlyph: "sphere-open",
    title: "Sphere · wire",
    detail: "Closed weights",
  },
  {
    id: "open-wire",
    plotlySymbol: "diamond-open",
    sceneGlyph: "octa-open",
    title: "Octa · wire",
    detail: "Open weights",
  },
];
