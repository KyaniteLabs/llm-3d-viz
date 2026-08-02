import "./styles/tokens.css";
import { incompleteModels, models } from "./data/models";
import { Stage3D } from "./viz/stage3d";
import { ScoreWeights, normalizedScores, weightedOptimum } from "./lib/score";

// Keep the scaffold's typed dataset in the entry graph. The chart layer consumes it in T2+.
document.documentElement.dataset.modelCount = String(models.length);
document.documentElement.dataset.incompleteModelCount = String(incompleteModels().length);

// Wait for DOM to load
document.addEventListener("DOMContentLoaded", () => {
  const stagePanel = document.querySelector(".stage") as HTMLElement;
  const placeholder = stagePanel?.querySelector(".stage-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  const incomplete = incompleteModels();
  const incompleteSection = document.createElement("section");
  incompleteSection.className = "incomplete-data";
  incompleteSection.setAttribute("aria-labelledby", "incomplete-data-title");
  incompleteSection.innerHTML = `<p id="incomplete-data-title" class="eyebrow">INCOMPLETE DATA / EXCLUDED</p>`;
  incomplete.forEach((model) => {
    const entry = document.createElement("p");
    entry.className = "incomplete-data-entry";
    entry.textContent = `${model.model} — ${model.null_reason}`;
    incompleteSection.appendChild(entry);
  });
  stagePanel?.appendChild(incompleteSection);

  // Create element to house the 3D plot
  const plotContainer = document.createElement("div");
  plotContainer.id = "stage-3d-plot-container";
  plotContainer.style.flex = "1";
  plotContainer.style.minHeight = "300px";
  plotContainer.style.width = "100%";
  stagePanel?.appendChild(plotContainer);

  // Initialize 3D stage
  const stage = new Stage3D(plotContainer);

  const equalWeights: ScoreWeights = {
    speed: 0.3333,
    cost: 0.3333,
    intelligence: 0.3333,
  };

  const codingPreset: ScoreWeights = {
    speed: 0.25,
    cost: 0.15,
    intelligence: 0.6,
  };

  let currentWeights = { ...equalWeights };

  // Render function helper
  function updateViz(weights: ScoreWeights) {
    currentWeights = { ...weights };
    stage.render(currentWeights, models);
    updateConsoleReadout(currentWeights);
  }

  function updateConsoleReadout(weights: ScoreWeights) {
    const scores = normalizedScores(models, weights, models);
    const optimum = weightedOptimum(scores);

    const title = document.getElementById("console-title");
    if (title) {
      if (optimum) {
        title.textContent = `Optimum: ${optimum.model.model}`;
      } else {
        title.textContent = "Value readout";
      }
    }

    const dds = document.querySelectorAll(".console dl dd");
    if (dds.length >= 3) {
      if (optimum) {
        dds[0].textContent = `${optimum.model.tps} TPS`;
        dds[1].textContent =
          optimum.model.blended_price_per_M === 0
            ? "$0.00 / M"
            : `$${optimum.model.blended_price_per_M?.toFixed(3)} / M`;
        dds[2].textContent = `${optimum.model.aa_intelligence_index}%`;
      } else {
        dds[0].textContent = "— TPS";
        dds[1].textContent = "— / M";
        dds[2].textContent = "— INDEX";
      }
    }
  }

  // Wire up temporary presets in the console
  const consolePanel = document.querySelector(".console") as HTMLElement;
  if (consolePanel) {
    const presetContainer = document.createElement("div");
    presetContainer.className = "preset-selector-container";
    presetContainer.style.marginTop = "1.5rem";
    presetContainer.style.display = "flex";
    presetContainer.style.flexDirection = "column";
    presetContainer.style.gap = "0.75rem";

    const presetLabel = document.createElement("p");
    presetLabel.className = "eyebrow";
    presetLabel.textContent = "TEMPORARY PRESETS";
    presetContainer.appendChild(presetLabel);

    const equalBtn = document.createElement("button");
    equalBtn.id = "preset-equal-btn";
    equalBtn.textContent = "USE EQUAL WEIGHTS";
    styleButton(equalBtn);
    equalBtn.addEventListener("click", () => {
      updateViz(equalWeights);
    });

    const codingBtn = document.createElement("button");
    codingBtn.id = "preset-coding-btn";
    codingBtn.textContent = "USE CODING PRESET";
    styleButton(codingBtn);
    codingBtn.addEventListener("click", () => {
      updateViz(codingPreset);
    });

    presetContainer.appendChild(equalBtn);
    presetContainer.appendChild(codingBtn);
    consolePanel.appendChild(presetContainer);
  }

  function styleButton(btn: HTMLButtonElement) {
    btn.style.background = "transparent";
    btn.style.border = "1px solid var(--color-border)";
    btn.style.color = "var(--color-text)";
    btn.style.padding = "0.5rem 1rem";
    btn.style.borderRadius = "var(--radius-control)";
    btn.style.cursor = "pointer";
    btn.style.fontFamily = "var(--font-mono)";
    btn.style.fontSize = "var(--step--1)";
    btn.style.textAlign = "left";
    btn.style.transition = "background-color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)";

    btn.addEventListener("mouseenter", () => {
      btn.style.backgroundColor = "rgba(231, 226, 216, 0.05)";
      btn.style.borderColor = "var(--filament)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.backgroundColor = "transparent";
      btn.style.borderColor = "var(--color-border)";
    });
  }

  // Initial render
  updateViz(equalWeights);
});
