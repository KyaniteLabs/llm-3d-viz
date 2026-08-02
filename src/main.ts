import "./styles/tokens.css";
import { models } from "./data/models";
import { Stage3D } from "./viz/stage3d";
import { Projections } from "./viz/projections";
import { createStore, type AppState } from "./state";
import { DecisionConsole } from "./ui/console";
import { SweepScheduler } from "./viz/sweep";
import { CinemaMode } from "./viz/cinema";
import { StageGuide } from "./ui/stage-guide";

// Trace-carried `text` labels hold the model ID (see stage3d.ts / projections.ts),
// so a hover point resolves to a stable model identity regardless of point order.
function modelIdFromPlotlyPoint(point: any): string | null {
  const text = point?.data?.text ?? point?.fullData?.text;
  const modelId = Array.isArray(text) ? text[point?.pointNumber] : null;
  return typeof modelId === "string" ? modelId : null;
}

// Keep the scaffold's typed dataset in the entry graph. The chart layer consumes it in T2+.
document.documentElement.dataset.modelCount = String(models.length);
// The score-luminance encoding is the shipped default. Keep a reversible URL
// opt-out for A/B comparison and capture work: `?heat=0`.
const heatEncoding = new URLSearchParams(window.location.search).get("heat") !== "0";

document.addEventListener("DOMContentLoaded", () => {
  const stagePanel = document.querySelector(".stage") as HTMLElement;
  const stageVisual = stagePanel?.querySelector(".stage-visual") as HTMLElement | null;
  const placeholder = stageVisual?.querySelector(".stage-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  const plotContainer = document.createElement("div");
  plotContainer.id = "stage-3d-plot-container";
  plotContainer.style.flex = "1";
  plotContainer.style.minHeight = "300px";
  plotContainer.style.width = "100%";
  stageVisual?.appendChild(plotContainer);
  const consoleRoot = document.querySelector(".console") as HTMLElement;
  const store = createStore();
  const stage = new Stage3D(plotContainer, heatEncoding);
  new StageGuide(stagePanel?.querySelector(".stage-guide") as HTMLElement, store, models, heatEncoding);

  // Linked 2D projections couple to the stage bidirectionally by model ID (hover
  // fans out via Plotly.Fx.hover; see src/viz/projections.ts). Constructed after
  // the stage so the coupling can bind to the stage's graph div.
  const projectionContainers = Array.from(
    document.querySelectorAll(".projection-row .projection"),
  ) as HTMLElement[];
  const projections =
    projectionContainers.length > 0 ? new Projections(projectionContainers, stage.gd, heatEncoding) : null;
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
  new SweepScheduler(stage.gd, projections?.gds ?? [], store, models, heatEncoding);

  // FIX-D (#29): the cinema shortcut yields only to genuine TEXT-ENTRY focus.
  // Buttons, preset chips, and the range sliders (the weight controls) must NOT
  // swallow "C". A bare <input> with no type defaults to "text" (text-entry →
  // blocks); range/checkbox/radio/button-type inputs, <button>, and chips never do.
  const isTextEntryTarget = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return !["range", "checkbox", "radio", "button", "submit", "reset", "image", "file", "color"].includes(type);
    }
    return false;
  };

  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTextEntryTarget(event.target as HTMLElement | null)) return;
    event.preventDefault();
    cinema.toggle();
  });

  // Console wiring: the graph div owns cursor truth because gl3d plotly_hover
  // payloads do not reliably include event coordinates.
  let pointer = { x: 0, y: 0 };
  stage.gd.addEventListener("mouseenter", () => {
    // Re-entering the stage starts a fresh hover snapshot. If the pointer then
    // lands on a point, Plotly's hover event immediately replaces this null.
    consoleUi.handleStageEnter();
  });
  stage.gd.addEventListener("mousemove", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    consoleUi.setCursor(event.clientX, event.clientY);
  });
  stage.gd.addEventListener("mouseleave", () => {
    consoleUi.handleStageLeave();
  });

  const plotlyOn = (stage.gd as any).on;
  if (typeof plotlyOn === "function") {
    plotlyOn.call(stage.gd, "plotly_hover", (event: any) => {
      const point = event.points?.[0];
      const modelId = modelIdFromPlotlyPoint(point);
      if (!modelId) return;
      consoleUi.handleHover(modelId);
    });
    plotlyOn.call(stage.gd, "plotly_unhover", () => {
      // Plotly emits this when the pointer remains inside the stage but leaves
      // the last point. Clear only hover; a pin is an independent click state.
      consoleUi.handleStageLeave();
    });
  }
  stage.gd.addEventListener("click", (event) => {
    // The store is the authoritative hover snapshot. A DOM click can arrive
    // after Plotly's hover event and must not be resolved through a time/space
    // heuristic that can turn a real point click into an empty click.
    consoleUi.handleStageClick(store.getState().hoveredModelId, event.clientX, event.clientY);
  });
});
