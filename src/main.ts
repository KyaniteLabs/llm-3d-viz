import "./styles/tokens.css";
import { models } from "./data/models";
import { Stage3D } from "./viz/stage3d";
import { createStore } from "./state";
import { DecisionConsole } from "./ui/console";

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
  const consoleUi = new DecisionConsole(consoleRoot, store, models);
  let plotlyPointClicked = false;

  store.subscribe((state) => stage.render(state.weights, models));
  const plotlyOn = (stage.gd as any).on;
  if (typeof plotlyOn === "function") {
    plotlyOn.call(stage.gd, "plotly_hover", (event: any) => {
      const point = event.points?.[0];
      const modelId = (window as any).__viz?.pointNumberToModelId?.[point?.pointNumber];
      if (modelId) consoleUi.handleHover(modelId, event.event?.clientX ?? 0, event.event?.clientY ?? 0);
    });
    plotlyOn.call(stage.gd, "plotly_click", (event: any) => {
      const point = event.points?.[0];
      const modelId = (window as any).__viz?.pointNumberToModelId?.[point?.pointNumber] ?? null;
      plotlyPointClicked = true;
      window.setTimeout(() => { plotlyPointClicked = false; }, 0);
      consoleUi.handleStageClick(modelId, event.event?.clientX ?? 0, event.event?.clientY ?? 0);
    });
  }
  stage.gd.addEventListener("click", (event) => {
    if (!plotlyPointClicked) consoleUi.handleStageClick(null, event.clientX, event.clientY);
  });
});
