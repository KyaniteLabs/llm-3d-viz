import "./styles/tokens.css";
import { models } from "./data/models";
import { Stage3D } from "./viz/stage3d";
import { Projections } from "./viz/projections";
import { createStore } from "./state";
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

  let plotlyPointClicked = false;

  // A weight change re-ranks the stage AND the linked projections together: both
  // are pure functions of (weights, models) driven from the same store tick.
  store.subscribe((state) => {
    stage.render(state.weights, models);
    projections?.render(state.weights, models);
  });
  new SweepScheduler(stage.gd, projections?.gds ?? [], store, models);

  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, button")) return;
    event.preventDefault();
    cinema.toggle();
  });

  // Console wiring: stage hover/click drive the value-score readout + tooltip.
  // (Projection hovers fan a programmatic Fx.hover onto the stage, which does NOT
  // re-emit plotly_hover — verified against the locked plotly.js-dist-min 3.7.0 —
  // so this listener never double-fires from a projection-driven hover.)
  const plotlyOn = (stage.gd as any).on;
  if (typeof plotlyOn === "function") {
    plotlyOn.call(stage.gd, "plotly_hover", (event: any) => {
      const point = event.points?.[0];
      const modelId = modelIdFromPlotlyPoint(point);
      if (modelId) consoleUi.handleHover(modelId, event.event?.clientX ?? 0, event.event?.clientY ?? 0);
    });
    plotlyOn.call(stage.gd, "plotly_click", (event: any) => {
      const point = event.points?.[0];
      const modelId = modelIdFromPlotlyPoint(point);
      plotlyPointClicked = true;
      window.setTimeout(() => { plotlyPointClicked = false; }, 0);
      consoleUi.handleStageClick(modelId, event.event?.clientX ?? 0, event.event?.clientY ?? 0);
    });
  }
  stage.gd.addEventListener("click", (event) => {
    if (!plotlyPointClicked) consoleUi.handleStageClick(null, event.clientX, event.clientY);
  });
});
