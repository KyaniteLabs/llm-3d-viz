import type { Model } from "../data/models";
import type { AxisMapping } from "../lib/axis-metrics";
import type { ScoreWeights } from "../lib/score";
import type { PresentationMode } from "./palette";

/** Plotly-compatible camera shape (also used by Three stage). */
export interface StageCamera {
  eye: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
}

export type StageFitMode = "multi-effort" | "all" | "none";

export interface StageRenderOptions {
  /** Metric bound to each scene axis. Defaults to cost × intelligence × speed. */
  axisMapping?: AxisMapping;
  /** Product encoding mode. Default curve-focus. */
  presentationMode?: PresentationMode;
  /**
   * Camera fit policy for this paint.
   * - multi-effort: soft-fit multi-effort subset bounds (first paint / filter change)
   * - all: fit full plottable set
   * - none: leave camera (user orbit / cinema)
   */
  fit?: StageFitMode;
  /** Dim non-matching families (hover/pin family emphasis). */
  highlightFamilyId?: string | null;
  /** When true, use tighter solo ladder framing. */
  soloFamily?: boolean;
  /**
   * Decide mode: dim points with Index below this floor (or missing Index).
   * Null/undefined = no floor dimming.
   */
  intelligenceFloor?: number | null;
  /** Decide mode: model ids on cost×speed Pareto (brighten). */
  decideParetoIds?: ReadonlySet<string> | string[] | null;
  /** Decide mode: shortlist model ids (call out). */
  decideShortlistIds?: ReadonlySet<string> | string[] | null;
}

/**
 * Drop-in surface for the 3D hero (docs/v1/r3f-stage-contract.md).
 * `gd` remains for Plotly consumers (projections cross-hover, legacy sweep);
 * Three stage sets `gd` to the same root that receives pointer events.
 */
export interface Stage3DSurface {
  readonly el: HTMLElement;
  /** Graph / event root — Plotly div or Three host. */
  readonly gd: HTMLDivElement;
  render(weights: ScoreWeights, models: Model[], options?: StageRenderOptions): void;
  setCamera(camera: Partial<StageCamera> | StageCamera): void;
  orbitTo(angleRad: number): void;
  /** Per-scorable-index colors/sizes for threshold-sweep (optional). */
  setPointAppearance?(colors: string[], sizes: number[]): void;
  /** Optional explicit fit after render (Three); Plotly no-ops. */
  fitToVisible?(models: Model[], mode?: StageFitMode): void;
  /** Dim non-matching family marks/trails without a full rebuild. */
  setFamilyHighlight?(familyId: string | null): void;
  destroy?(): void;
}
