import type { ScoreWeights } from "./lib/score";

export interface CameraState {
  eye: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
}

export interface AppState {
  weights: ScoreWeights;
  hoveredModelId: string | null;
  pinnedModelId: string | null;
  cinemaMode: boolean;
  camera: CameraState;
  datarevision: number;
}

export type StateListener = (state: Readonly<AppState>) => void;

const initialCamera: CameraState = {
  eye: { x: 1.5, y: 1.5, z: 1.5 },
  up: { x: 0, y: 0, z: 1 },
  center: { x: 0, y: 0, z: 0 },
};

export function createStore(initial: Partial<AppState> = {}) {
  let state: AppState = {
    weights: { speed: 0.3333, cost: 0.3333, intelligence: 0.3333 },
    hoveredModelId: null,
    pinnedModelId: null,
    cinemaMode: false,
    camera: initialCamera,
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
        camera: patch.camera ? { ...patch.camera } : state.camera,
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
