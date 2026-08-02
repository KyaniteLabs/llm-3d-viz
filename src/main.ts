import "./styles/tokens.css";
import { models } from "./data/models";
import { Stage3D } from "./viz/stage3d";
import { Projections } from "./viz/projections";
import { createStore, type AppState } from "./state";
import { DecisionConsole } from "./ui/console";
import { SweepScheduler } from "./viz/sweep";
import { CinemaMode } from "./viz/cinema";

// Trace-carried `text` labels hold the model ID (see stage3d.ts / projections.ts),
// so a hover point resolves to a stable model identity regardless of point order.
function modelIdFromPlotlyPoint(point: any): string | null {
  const text = point?.data?.text ?? point?.fullData?.text;
  const modelId = Array.isArray(text) ? text[point?.pointNumber] : null;
  return typeof modelId === "string" ? modelId : null;
}

// Keep the scaffold's typed dataset in the entry graph. The chart layer consumes it in T2+.
document.documentElement.dataset.modelCount = String(models.length);

document.addEventListener("DOMContentLoaded", () => {
  const stagePanel = document.querySelector(".stage") as HTMLElement;
  const placeholder = stagePanel?.querySelector(".stage-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  const plotContainer = document.createElement("div");
  plotContainer.id = "stage-3d-plot-container";
  plotContainer.style.flex = "1";
  plotContainer.style.minHeight = "300px";
  plotContainer.style.width = "100%";
  stagePanel?.appendChild(plotContainer);
  const consoleRoot = document.querySelector(".console") as HTMLElement;
  const store = createStore();
  const stage = new Stage3D(plotContainer);

  // Linked 2D projections couple to the stage bidirectionally by model ID (hover
  // fans out via Plotly.Fx.hover; see src/viz/projections.ts). Constructed after
  // the stage so the coupling can bind to the stage's graph div.
  const projectionContainers = Array.from(
    document.querySelectorAll(".projection-row .projection"),
  ) as HTMLElement[];
  const projections =
    projectionContainers.length > 0 ? new Projections(projectionContainers, stage.gd) : null;
  const cinema = new CinemaMode(stage, store);
  const consoleUi = new DecisionConsole(consoleRoot, store, models, () => cinema.toggle());

  // A weight change re-ranks the stage AND the linked projections together: both
  // are pure functions of (weights, models) driven from the same store tick.
  // Hover/pin/cinema state does not affect either plot, so only weight changes
  // enter this rAF-coalesced render path.
  let renderedWeights: AppState["weights"] | null = null;
  let pendingWeights: AppState["weights"] | null = null;
  let renderFrame: number | null = null;
  const sameWeights = (left: AppState["weights"], right: AppState["weights"]) =>
    left.speed === right.speed && left.cost === right.cost && left.intelligence === right.intelligence;
  const renderVisuals = (weights: AppState["weights"]) => {
    renderedWeights = { ...weights };
    stage.render(weights, models);
    projections?.render(weights, models);
    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      const viz = (window as any).__viz ?? {};
      viz.stage = stage;
      viz.projectionsInstance = projections;
      (window as any).__viz = viz;
    }
  };
  store.subscribe((state) => {
    if (!renderedWeights) {
      renderVisuals(state.weights);
      return;
    }
    if (sameWeights(renderedWeights, state.weights)) return;
    pendingWeights = { ...state.weights };
    if (renderFrame !== null) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = null;
      const weights = pendingWeights;
      pendingWeights = null;
      if (weights) renderVisuals(weights);
    });
  });
  new SweepScheduler(stage.gd, projections?.gds ?? [], store, models);

  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, button")) return;
    event.preventDefault();
    cinema.toggle();
  });

  // Console wiring: the graph div owns cursor truth because gl3d plotly_hover
  // payloads do not reliably include event coordinates.
  const HOVER_GRACE_MS = 300;
  let stagePointerInside = false;
  let pointer = { x: 0, y: 0 };
  let lastHover: { modelId: string; at: number; x: number; y: number } | null = null;
  stage.gd.addEventListener("mouseenter", () => {
    stagePointerInside = true;
  });
  stage.gd.addEventListener("mousemove", (event) => {
    stagePointerInside = true;
    pointer = { x: event.clientX, y: event.clientY };
    consoleUi.setCursor(event.clientX, event.clientY);
  });
  stage.gd.addEventListener("mouseleave", () => {
    stagePointerInside = false;
    lastHover = null;
    consoleUi.handleStageLeave();
  });

  const plotlyOn = (stage.gd as any).on;
  if (typeof plotlyOn === "function") {
    plotlyOn.call(stage.gd, "plotly_hover", (event: any) => {
      const point = event.points?.[0];
      const modelId = modelIdFromPlotlyPoint(point);
      if (!modelId) return;
      if (stagePointerInside) lastHover = { modelId, at: performance.now(), ...pointer };
      consoleUi.handleHover(modelId);
    });
  }
  stage.gd.addEventListener("click", (event) => {
    const hoverAge = lastHover ? performance.now() - lastHover.at : Number.POSITIVE_INFINITY;
    const hoverDistance = lastHover
      ? Math.hypot(event.clientX - lastHover.x, event.clientY - lastHover.y)
      : Number.POSITIVE_INFINITY;
    const recentHover = stagePointerInside && lastHover && hoverAge <= HOVER_GRACE_MS && hoverDistance <= 24
      ? lastHover.modelId
      : null;
    consoleUi.handleStageClick(recentHover, event.clientX, event.clientY);
  });
});
