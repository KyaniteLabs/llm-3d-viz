/**
 * Single source of truth for point-mark channels on the stage + projections.
 *
 * Clean channel matrix (curve-focus product default):
 *
 * | Channel              | Meaning                                      |
 * |----------------------|----------------------------------------------|
 * | Position X/Y/Z       | Cost / intelligence / speed (axis mapping)   |
 * | Fill color           | Lab brand hue + family shade                 |
 * | Trail                | Multi-effort path within a family            |
 * | Size                 | Value-score for current weights (+ floors)   |
 * | Shape geometry       | Reasoning: sphere = standard, octa = reason  |
 * | Solid vs wireframe   | Openness: solid = closed weights, open = open|
 * | Gold + max size      | Optimum (best for weights)                   |
 * | Ridge + size floor   | Pareto frontier                              |
 *
 * Lab identity is NEVER carried by shape (color already owns lab). Shape is a
 * strict 2×2 of openness × reasoning so every glyph is unambiguous.
 */

import type { Model, Plotly3dSymbol } from "../data/models";

/** Three.js scene glyphs (wireframe variants end with `-open`). */
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
  /** Three.js glyph kind. */
  sceneGlyph: SceneGlyphKind;
  openness: "open" | "closed";
  reasoning: boolean;
  /** Short legend id. */
  keyId: "standard-closed" | "standard-open" | "reasoning-closed" | "reasoning-open";
  /** Human label for keys. */
  label: string;
}

/**
 * Resolve mark shape from model attributes only — no lab, no optimum hijack.
 * Optimum is gold + size; it keeps the same openness×reasoning glyph.
 */
export function markChannels(
  model: Pick<Model, "openness" | "reasoning">,
): MarkChannels {
  const openness = model.openness === "open" ? "open" : "closed";
  const reasoning = Boolean(model.reasoning);
  const openMark = openness === "open";

  if (reasoning) {
    return {
      plotlySymbol: openMark ? "diamond-open" : "diamond",
      sceneGlyph: openMark ? "octa-open" : "octa",
      openness,
      reasoning: true,
      keyId: openMark ? "reasoning-open" : "reasoning-closed",
      label: openMark ? "Reasoning · open weights" : "Reasoning · closed",
    };
  }

  return {
    plotlySymbol: openMark ? "circle-open" : "circle",
    sceneGlyph: openMark ? "sphere-open" : "sphere",
    openness,
    reasoning: false,
    keyId: openMark ? "standard-open" : "standard-closed",
    label: openMark ? "Standard · open weights" : "Standard · closed",
  };
}

/** Legend rows for the glyph 2×2 (stable order). */
export const MARK_GLYPH_LEGEND: ReadonlyArray<{
  id: MarkChannels["keyId"];
  plotlySymbol: Plotly3dSymbol;
  sceneGlyph: SceneGlyphKind;
  title: string;
  detail: string;
}> = [
  {
    id: "standard-closed",
    plotlySymbol: "circle",
    sceneGlyph: "sphere",
    title: "Sphere · solid",
    detail: "Standard model · closed weights",
  },
  {
    id: "standard-open",
    plotlySymbol: "circle-open",
    sceneGlyph: "sphere-open",
    title: "Sphere · wire",
    detail: "Standard model · open weights",
  },
  {
    id: "reasoning-closed",
    plotlySymbol: "diamond",
    sceneGlyph: "octa",
    title: "Octa · solid",
    detail: "Reasoning / thinking model · closed",
  },
  {
    id: "reasoning-open",
    plotlySymbol: "diamond-open",
    sceneGlyph: "octa-open",
    title: "Octa · wire",
    detail: "Reasoning / thinking model · open weights",
  },
];
