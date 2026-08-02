import * as Plotly from "plotly.js-dist-min";
import { isScorable, type Model } from "../data/models";
import { frontier, ridgeOrder } from "../lib/pareto";
import {
  compareWeightedScores,
  normalizedScores,
  weightedOptimum,
  type ScoreWeights,
} from "../lib/score";
import type { AppStore, AppState } from "../state";
import { scheduleSweep } from "./sweep-timing";
import {
  semanticFloorFill,
  semanticPointFill,
  type SemanticPointClass,
} from "./palette";

export { SWEEP_DURATION_MS, timingProgress } from "./sweep-timing";

export function motionPreference(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
}

export function ignitionOrder(models: readonly Model[], weights: ScoreWeights, interacted: boolean): string[] {
  const frontierModels = frontier(models);
  // docs/research/frontier-math.md §2.4: the pre-interaction sweep is ridge
  // order by contract; only an interacted weight change switches to score rank.
  if (!interacted) return ridgeOrder(frontierModels).map(({ model }) => model.model);
  const scores = normalizedScores(models, weights, models);
  const scoreById = new Map(scores.map((entry) => [entry.model.model, entry]));
  return frontierModels
    .slice()
    .sort((a, b) => compareWeightedScores(scoreById.get(a.model)!, scoreById.get(b.model)!))
    .map((model) => model.model);
}

type Graph = HTMLDivElement;

interface MarkerState {
  ids: string[];
  colors: string[];
  sizes: number[];
}

interface SweepStates {
  base: MarkerState;
  target: MarkerState;
  order: string[];
  frontierIds: Set<string>;
  optimum: string | undefined;
  baseById: Map<string, { color: string; size: number }>;
  targetById: Map<string, { color: string; size: number }>;
}

interface CurrentAppearance {
  stage: { colors: string[]; sizes: number[] };
  projections: Array<{ colors: string[]; sizes: number[] }>;
}

function graphIds(gd: Graph): string[] {
  return Array.isArray((gd as any).data?.[0]?.text) ? (gd as any).data[0].text.slice() : [];
}

export class SweepScheduler {
  private readonly stage: Graph;
  private readonly projections: readonly Graph[];
  private readonly models: readonly Model[];
  private readonly store: AppStore;
  private cancelScheduled: (() => void) | null = null;
  private run = 0;
  private interacted = false;
  private previousWeights: ScoreWeights | null = null;
  private lastBatch = -1;
  private currentAppearance: CurrentAppearance | null = null;
  private reduced = motionPreference()?.matches ?? false;
  private readonly heatEncoding: boolean;
  private removeMotionListener: (() => void) | null = null;

  constructor(stage: Graph, projections: readonly Graph[], store: AppStore, models: readonly Model[], heatEncoding = true) {
    this.stage = stage;
    this.projections = projections;
    this.store = store;
    this.models = models;
    this.heatEncoding = heatEncoding;
    const media = motionPreference();
    if (media) {
      const onChange = (event: MediaQueryListEvent) => {
        this.reduced = event.matches;
        if (this.reduced) this.cancelAndSettle(this.store.getState());
      };
      media.addEventListener?.("change", onChange);
      this.removeMotionListener = () => media.removeEventListener?.("change", onChange);
    }
    this.store.subscribe((state) => {
      const changed = !this.previousWeights || Object.keys(state.weights).some(
        (key) => state.weights[key as keyof ScoreWeights] !== this.previousWeights![key as keyof ScoreWeights],
      );
      if (!changed && this.previousWeights) {
        // Store updates such as cinema mode re-render Plotly without starting a
        // sweep. Re-assert the last scheduler-owned appearance because those
        // renders intentionally omit marker color/size and Plotly otherwise
        // restores its default palette.
        this.reassertAppearance();
        return;
      }
      if (this.previousWeights) this.interacted = true;
      this.previousWeights = { ...state.weights };
      this.start(state);
    });
  }

  destroy() {
    this.cancel();
    this.removeMotionListener?.();
  }

  private cancel() {
    this.cancelScheduled?.();
    this.cancelScheduled = null;
    this.run += 1;
  }

  private markerStates(weights: ScoreWeights): SweepStates {
    const frontierIds = new Set(frontier(this.models).map((model) => model.model));
    const scores = normalizedScores(this.models, weights, this.models);
    const scoreById = new Map(scores.map((entry) => [entry.model.model, entry.score]));
    const optimum = weightedOptimum(scores)?.model.model;
    const targetIds = new Set(ignitionOrder(this.models, weights, this.interacted));
    const semanticClassFor = (id: string): SemanticPointClass =>
      id === optimum ? "optimum" : frontierIds.has(id) ? "frontier" : "dominated";
    const make = (gd: Graph, target: boolean): MarkerState => {
      const ids = graphIds(gd);
      const colors = ids.map((id) => {
        const semanticClass = semanticClassFor(id);
        return target
          ? semanticPointFill(semanticClass, scoreById.get(id) ?? 0, this.heatEncoding)
          : semanticFloorFill(semanticClass);
      });
      const sizes = ids.map((id) => target && id === optimum ? 16 : target && frontierIds.has(id) ? 10 : 7);
      return { ids, colors, sizes };
    };
    const base = make(this.stage, false);
    const target = make(this.stage, true);
    return {
      base,
      target,
      order: [...targetIds].filter((id) => target.ids.includes(id)),
      frontierIds,
      optimum,
      baseById: new Map(base.ids.map((id, index) => [id, { color: base.colors[index], size: base.sizes[index] }])),
      targetById: new Map(target.ids.map((id, index) => [id, { color: target.colors[index], size: target.sizes[index] }])),
    };
  }

  private write(gd: Graph, colors: string[], sizes: number[]) {
    if (!graphIds(gd).length) return;
    // Plotly requires each per-point array to be wrapped once for restyle.
    // Resolve the bundled namespace at call time so the render-suite spy
    // instruments the exact Plotly instance used by the scheduler.
    const plotly = import.meta.env.DEV
      ? (window as any).__viz?.Plotly ?? Plotly
      : Plotly;
    void plotly.restyle(gd, { "marker.color": [colors], "marker.size": [sizes] }, [0]);
  }

  private writeAppearance(appearance: CurrentAppearance) {
    this.write(this.stage, appearance.stage.colors, appearance.stage.sizes);
    this.projections.forEach((gd, index) => {
      const projection = appearance.projections[index];
      if (projection) this.write(gd, projection.colors, projection.sizes);
    });
    this.currentAppearance = appearance;
  }

  private reassertAppearance() {
    if (!this.currentAppearance) return;
    this.writeAppearance({
      stage: {
        colors: this.currentAppearance.stage.colors.slice(),
        sizes: this.currentAppearance.stage.sizes.slice(),
      },
      projections: this.currentAppearance.projections.map(({ colors, sizes }) => ({
        colors: colors.slice(),
        sizes: sizes.slice(),
      })),
    });
  }

  private writeAtProgress(states: SweepStates, progress: number) {
    const batch = Math.min(states.order.length, Math.floor(progress * Math.max(states.order.length, 1)));
    if (batch === this.lastBatch && progress < 1) return;
    this.lastBatch = batch;
    // Dominated points stay at the slate floor while the frontier ignites, but
    // the settled batch must commit every target so their score heat survives
    // the sweep instead of remaining permanently at the staging floor.
    const settled = progress >= 1;
    const lit = new Set<string>();
    states.order.forEach((id, index) => {
      if (progress >= (index + 1) / Math.max(states.order.length, 1)) lit.add(id);
    });
    const colors = states.base.colors.map((color, index) =>
      settled || lit.has(states.base.ids[index]) ? states.target.colors[index] : color,
    );
    const sizes = states.base.sizes.map((size, index) =>
      settled || lit.has(states.base.ids[index]) ? states.target.sizes[index] : size,
    );
    const projectionAppearance: Array<{ colors: string[]; sizes: number[] }> = [];
    this.projections.forEach((gd, projectionIndex) => {
      const ids = graphIds(gd);
      projectionAppearance[projectionIndex] = {
        colors: ids.map((id) => {
          const style = settled || lit.has(id) ? states.targetById.get(id) : states.baseById.get(id);
          return style?.color ?? semanticFloorFill(
            states.optimum === id ? "optimum" : states.frontierIds.has(id) ? "frontier" : "dominated",
          );
        }),
        sizes: ids.map((id) => {
          const style = settled || lit.has(id) ? states.targetById.get(id) : states.baseById.get(id);
          return style?.size ?? (states.frontierIds.has(id) ? 10 : 7);
        }),
      };
    });
    this.writeAppearance({ stage: { colors, sizes }, projections: projectionAppearance });
  }

  private start(state: Readonly<AppState>) {
    this.cancel();
    this.lastBatch = -1;
    const currentRun = this.run;
    const states = this.markerStates(state.weights);
    if (this.reduced) {
      this.writeAtProgress(states, 1);
      return;
    }
    // Establish the dim staging palette synchronously; the first animation
    // frame must never expose the final Plotly.react palette first.
    this.writeAtProgress(states, 0);
    this.cancelScheduled = scheduleSweep((progress) => {
      if (currentRun !== this.run) {
        this.cancelScheduled?.();
        this.cancelScheduled = null;
        return;
      }
      this.writeAtProgress(states, progress);
      if (progress >= 1) {
        this.cancelScheduled = null;
      }
    });
  }

  private cancelAndSettle(state: Readonly<AppState>) {
    this.cancel();
    const states = this.markerStates(state.weights);
    this.writeAtProgress(states, 1);
  }
}
