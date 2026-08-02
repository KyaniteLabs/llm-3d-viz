import type { ScoreWeights } from "./lib/score";

export interface AppState {
  weights: ScoreWeights;
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
  let state: AppState = {
    weights: { speed: 0.3333, cost: 0.3333, intelligence: 0.3333 },
    hoveredModelId: null,
    pinnedModelId: null,
    cinemaMode: false,
    datarevision: 0,
    ...initial,
  };
  const listeners = new Set<StateListener>();

  const emit = () => listeners.forEach((listener) => listener(state));

  return {
    getState: () => state as Readonly<AppState>,
    replace: (next: Omit<AppState, "datarevision"> | AppState) => {
      state = { ...next, datarevision: state.datarevision + 1 };
      emit();
    },
    update: (patch: Partial<Omit<AppState, "datarevision">>) => {
      const weightsChanged = patch.weights !== undefined && !sameWeights(state.weights, patch.weights);
      const scalarChanged = (Object.keys(patch) as Array<keyof Omit<AppState, "datarevision" >>)
        .filter((key) => key !== "weights")
        .some((key) => patch[key] !== state[key]);
      if (!weightsChanged && !scalarChanged) return;
      state = {
        ...state,
        ...patch,
        weights: patch.weights ? { ...patch.weights } : state.weights,
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
