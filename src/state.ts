import type { ScoreWeights } from "./lib/score";

export interface AppState {
  weights: ScoreWeights;
  hoveredModelId: string | null;
  pinnedModelId: string | null;
  cinemaMode: boolean;
  datarevision: number;
}

export type StateListener = (state: Readonly<AppState>) => void;

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
