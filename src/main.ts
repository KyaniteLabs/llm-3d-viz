import "./styles/tokens.css";
import { models } from "./data/models";
import { Stage3D } from "./viz/stage3d";
import type { ScoreWeights } from "./lib/score";

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

  const equalWeights: ScoreWeights = {
    speed: 0.3333,
    cost: 0.3333,
    intelligence: 0.3333,
  };

  const stage = new Stage3D(plotContainer);
  stage.render(equalWeights, models);
});
