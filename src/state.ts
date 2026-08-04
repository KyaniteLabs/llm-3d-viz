import {
  DEFAULT_AXIS_MAPPING,
  normalizeAxisMapping,
  sameAxisMapping,
  type AxisMapping,
} from "./lib/axis-metrics";
import { DEFAULT_FILTERS, sameFilters, type ModelFilters } from "./lib/filters";
import { presets, type ScoreWeights } from "./lib/score";

export interface AppState {
  weights: ScoreWeights;
  /** Which metrics bind to scene X / Y / Z (default = product cost×intel×speed). */
  axisMapping: AxisMapping;
  filters: ModelFilters;
  hoveredModelId: string | null;
  pinnedModelId: string | null;
  cinemaMode: boolean;
  datarevision: number;
}

export type StateListener = (state: Readonly<AppState>) => void;

function sameWeights(left: ScoreWeights, right: ScoreWeights): boolean {
  return left.speed === right.speed && left.cost === right.cost && left.intelligence === right.intelligence;
}

export function createStore(initial: Partial<AppState> = {}) {
  const { axisMapping: initialAxes, filters: initialFilters, ...restInitial } = initial;
  let state: AppState = {
    weights: { ...presets.chat },
    axisMapping: normalizeAxisMapping(initialAxes ?? DEFAULT_AXIS_MAPPING),
    filters: { ...DEFAULT_FILTERS, ...(initialFilters ?? {}), providers: [...(initialFilters?.providers ?? DEFAULT_FILTERS.providers)], families: [...(initialFilters?.families ?? DEFAULT_FILTERS.families)] },
    hoveredModelId: null,
    pinnedModelId: null,
    cinemaMode: false,
    datarevision: 0,
    ...restInitial,
  };
  state.axisMapping = normalizeAxisMapping(state.axisMapping);
  state.filters = {
    ...DEFAULT_FILTERS,
    ...state.filters,
    providers: [...(state.filters.providers ?? [])],
    families: [...(state.filters.families ?? [])],
  };
  const listeners = new Set<StateListener>();

  const emit = () => listeners.forEach((listener) => listener(state));

  return {
    getState: () => state as Readonly<AppState>,
    replace: (next: Omit<AppState, "datarevision"> | AppState) => {
      state = {
        ...next,
        axisMapping: normalizeAxisMapping(next.axisMapping),
        filters: {
          ...DEFAULT_FILTERS,
          ...next.filters,
          providers: [...(next.filters?.providers ?? [])],
          families: [...(next.filters?.families ?? [])],
        },
        datarevision: state.datarevision + 1,
      };
      emit();
    },
    update: (patch: Partial<Omit<AppState, "datarevision">>) => {
      const weightsChanged = patch.weights !== undefined && !sameWeights(state.weights, patch.weights);
      const axesChanged =
        patch.axisMapping !== undefined &&
        !sameAxisMapping(state.axisMapping, normalizeAxisMapping(patch.axisMapping));
      const filtersChanged =
        patch.filters !== undefined &&
        !sameFilters(state.filters, {
          ...state.filters,
          ...patch.filters,
          providers: patch.filters.providers ?? state.filters.providers,
          families: patch.filters.families ?? state.filters.families,
        });
      const scalarChanged = (Object.keys(patch) as Array<keyof Omit<AppState, "datarevision">>)
        .filter((key) => key !== "weights" && key !== "axisMapping" && key !== "filters")
        .some((key) => patch[key] !== state[key]);
      if (!weightsChanged && !axesChanged && !filtersChanged && !scalarChanged) return;
      state = {
        ...state,
        ...patch,
        weights: patch.weights ? { ...patch.weights } : state.weights,
        axisMapping: patch.axisMapping
          ? normalizeAxisMapping(patch.axisMapping)
          : state.axisMapping,
        filters: patch.filters
          ? {
              ...state.filters,
              ...patch.filters,
              providers: [...(patch.filters.providers ?? state.filters.providers)],
              families: [...(patch.filters.families ?? state.filters.families)],
            }
          : state.filters,
        datarevision: state.datarevision + 1,
      };
      emit();
    },
    subscribe: (listener: StateListener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}

export type AppStore = ReturnType<typeof createStore>;
