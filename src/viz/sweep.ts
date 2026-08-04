import { loadPlotly } from "./plotly-loader";
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
  aaPointFill,
  semanticFloorFill,
  type SemanticPointClass,
} from "./palette";
import { sameFilters, type ModelFilters } from "../lib/filters";

export { SWEEP_DURATION_MS, timingProgress } from "./sweep-timing";

import { motionPreference } from "./sweep-timing";
export { motionPreference } from "./sweep-timing";

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
  // Three stage exposes ordered scorable ids; Plotly carries them on text.
  if (Array.isArray((gd as any).__stageModelIds)) {
    return (gd as any).__stageModelIds.slice();
  }
  return Array.isArray((gd as any).data?.[0]?.text) ? (gd as any).data[0].text.slice() : [];
}

export class SweepScheduler {
  private readonly stage: Graph;
  private readonly projections: readonly Graph[];
  private models: readonly Model[];
  private readonly store: AppStore;
  private cancelScheduled: (() => void) | null = null;
  private run = 0;
  private interacted = false;
  private previousWeights: ScoreWeights | null = null;
  private previousFilters: ModelFilters | null = null;
  private lastBatch = -1;
  private currentAppearance: CurrentAppearance | null = null;
  private reduced = motionPreference()?.matches ?? false;
  private readonly heatEncoding: boolean;
  private removeMotionListener: (() => void) | null = null;
  // FIX-D (#29): plotly_afterplot re-assert hardening. `afterPlotRegistered` is
  // set once a listener is attached to every plot (stage + projections). The
  // actual re-assert is DEFERRED to a microtask (`afterPlotCheckQueued` dedupes
  // a burst of afterplot events into one pass): Plotly can re-emit events
  // synchronously during a react/restyle, so a synchronous re-assert here would
  // run nested inside a hover→render cycle and recurse (stack overflow under the
  // intensive hover scan). A microtask unwinds the stack each pass, so it can
  // never recurse; it converges because a plot whose markers already match the
  // appearance writes nothing. See onAfterPlot.
  private afterPlotRegistered = false;
  private afterPlotCheckQueued = false;

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
      this.ensureAfterPlotListeners();
      const weightsChanged =
        !this.previousWeights ||
        Object.keys(state.weights).some(
          (key) =>
            state.weights[key as keyof ScoreWeights] !==
            this.previousWeights![key as keyof ScoreWeights],
        );
      const filtersChanged =
        !this.previousFilters || !sameFilters(this.previousFilters, state.filters);
      if (!weightsChanged && !filtersChanged && this.previousWeights) {
        // Store updates such as cinema mode re-render Plotly without starting a
        // sweep. Re-assert only when the visible universe is unchanged — never
        // clobber a filter-correct stage with stale full-catalog colors.
        this.reassertAppearance();
        return;
      }
      if (this.previousWeights && weightsChanged) this.interacted = true;
      this.previousWeights = { ...state.weights };
      this.previousFilters = {
        ...state.filters,
        providers: [...state.filters.providers],
        families: [...state.filters.families],
      };
      // Filter-only: recompute appearance from current models (visible set) without
      // treating it as a weight interaction unless weights also changed.
      this.start(state);
    });
  }

  /** Replace the scoring/appearance catalog (must be the current visible set). */
  setModels(models: readonly Model[]) {
    this.models = models;
    const state = this.store.getState();
    this.previousFilters = {
      ...state.filters,
      providers: [...state.filters.providers],
      families: [...state.filters.families],
    };
    this.start(state);
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
    const modelById = new Map(this.models.map((m) => [m.model, m]));
    const optimum = weightedOptimum(scores)?.model.model;
    const targetIds = new Set(ignitionOrder(this.models, weights, this.interacted));
    const semanticClassFor = (id: string): SemanticPointClass =>
      id === optimum ? "optimum" : frontierIds.has(id) ? "frontier" : "dominated";
    const make = (gd: Graph, target: boolean): MarkerState => {
      const ids = graphIds(gd);
      const colors = ids.map((id) => {
        const semanticClass = semanticClassFor(id);
        const model = modelById.get(id);
        const openness = model?.openness ?? "closed";
        return target
          ? aaPointFill(openness, semanticClass, scoreById.get(id) ?? 0, this.heatEncoding)
          : semanticFloorFill(semanticClass);
      });
      const sizes = ids.map((id) => target && id === optimum ? 16 : target && frontierIds.has(id) ? 11 : 8);
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
    // Three stage (or any non-Plotly host) registers a restyle-free appearance hook.
    const setAppearance = (gd as any).__setPointAppearance;
    if (typeof setAppearance === "function") {
      setAppearance(colors, sizes);
      return;
    }
    // Plotly requires each per-point array to be wrapped once for restyle.
    // Resolve the bundled namespace at call time so the render-suite spy
    // instruments the exact Plotly instance used by the scheduler.
    void loadPlotly().then((Plotly) => {
      const plotly = import.meta.env.DEV
        ? (window as any).__viz?.Plotly ?? Plotly
        : Plotly;
      void plotly.restyle(gd, { "marker.color": [colors], "marker.size": [sizes] }, [0]);
    });
  }

  private writeAppearance(appearance: CurrentAppearance) {
    this.write(this.stage, appearance.stage.colors, appearance.stage.sizes);
    this.projections.forEach((gd, index) => {
      const projection = appearance.projections[index];
      if (projection) this.write(gd, projection.colors, projection.sizes);
    });
    this.currentAppearance = appearance;
    // Plots are guaranteed ready once we have written them — arm the afterplot
    // re-assert here too (idempotent) so it registers even if no later store tick
    // would have done it before a styling-dropping render lands.
    this.ensureAfterPlotListeners();
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

  /**
   * FIX-D (#29): ensure a plotly_afterplot listener is registered on the stage and
   * every projection. Idempotent; a no-op until every plot div has Plotly's `.on`
   * emitter attached (which happens once the first newPlot resolves).
   */
  private ensureAfterPlotListeners() {
    if (this.afterPlotRegistered) return;
    // Three stage has no Plotly `.on`; still arm projections so afterplot
    // re-assert self-heals 2D markers after react races.
    const plotlyGraphs = [this.stage, ...this.projections].filter(
      (gd) => typeof (gd as any).on === "function",
    );
    if (plotlyGraphs.length === 0) return;
    // Wait until projections exist (chunk may load after stage).
    if (this.projections.length > 0 && plotlyGraphs.length < this.projections.length) return;
    this.afterPlotRegistered = true;
    plotlyGraphs.forEach((gd) =>
      (gd as any).on.call(gd, "plotly_afterplot", () => this.onAfterPlot(gd)),
    );
  }

  /** The appearance slice the scheduler owns for one graph div (stage or a projection). */
  private appearanceFor(gd: Graph): { colors: string[]; sizes: number[] } | null {
    if (!this.currentAppearance) return null;
    if (gd === this.stage) return this.currentAppearance.stage;
    const idx = this.projections.indexOf(gd);
    return idx >= 0 ? this.currentAppearance.projections[idx] ?? null : null;
  }

  /**
   * True iff the live trace markers already equal the scheduler's appearance for
   * this graph. Gates the afterplot re-assert so a converged plot writes nothing,
   * which also makes the restyle→afterplot echo terminate after one no-op (no
   * infinite loop) and adds zero restyles during a normal sweep.
   */
  private liveMatchesAppearance(gd: Graph): boolean {
    const slice = this.appearanceFor(gd);
    if (!slice) return true;
    const marker = (gd as any).data?.[0]?.marker;
    const liveColor = marker?.color;
    const liveSize = marker?.size;
    // Plotly keeps a per-point array once restyled; an unset/default marker is a
    // single string (e.g. "#636efa") or undefined → never deep-equals our array.
    return (
      Array.isArray(liveColor) &&
      Array.isArray(liveSize) &&
      liveColor.length === slice.colors.length &&
      liveColor.every((c: string, i: number) => c === slice.colors[i]) &&
      liveSize.every((s: number, i: number) => s === slice.sizes[i])
    );
  }

  /**
   * FIX-D (#29): after ANY plot redraw (newPlot/react/relayout/restyle), if the
   * scheduler's marker styling was dropped — e.g. a Plotly.react that re-applied a
   * color/size-less trace landed AFTER the store-tick reassert (the async race
   * that intermittently resets markers to Plotly defaults in long sessions) —
   * restore it. This makes the scheduler's appearance the terminal write on every
   * frame, so any operation ordering self-heals within one frame.
   *
   * The check is DEFERRED to a microtask (not run inline) so it can never execute
   * synchronously nested inside a hover→render cycle — Plotly may re-emit events
   * synchronously during react/restyle, and an inline re-assert there recurses
   * (stack overflow under the intensive hover-scan spec). A microtask unwinds the
   * stack each pass; the dedupe flag folds a burst of afterplot events into one
   * pass; and it converges because a plot whose markers already match the
   * appearance writes nothing.
   */
  private onAfterPlot(_gd: Graph) {
    if (this.afterPlotCheckQueued || !this.currentAppearance) return;
    this.afterPlotCheckQueued = true;
    queueMicrotask(() => {
      this.afterPlotCheckQueued = false;
      if (!this.currentAppearance) return;
      for (const gd of [this.stage, ...this.projections]) {
        const slice = this.appearanceFor(gd);
        if (slice && !this.liveMatchesAppearance(gd)) {
          this.write(gd, slice.colors.slice(), slice.sizes.slice());
        }
      }
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
          return style?.size ?? (states.frontierIds.has(id) ? 11 : 8);
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
