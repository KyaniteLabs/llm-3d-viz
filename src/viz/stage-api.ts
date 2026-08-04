import type { Model } from "../data/models";
import type { AxisMapping } from "../lib/axis-metrics";
import type { ScoreWeights } from "../lib/score";

/** Plotly-compatible camera shape (also used by Three stage). */
export interface StageCamera {
  eye: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
}

export interface StageRenderOptions {
  /** Metric bound to each scene axis. Defaults to cost × intelligence × speed. */
  axisMapping?: AxisMapping;
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
  destroy?(): void;
}
