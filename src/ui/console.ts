import { incompleteModels, incompleteAxisCoverage, quarantinedModels, type Model } from "../data/models";
import { normalizedScores, presets } from "../lib/score";
import { formatTps, formatPricePerM, formatIntelligence, formatTtftSeconds, ttftCaveat } from "../lib/format";
import type { AppStore, AppState } from "../state";

const weightKeys = ["speed", "cost", "intelligence"] as const;
type WeightKey = (typeof weightKeys)[number];

export class DecisionConsole {
  private readonly root: HTMLElement;
  private readonly store: AppStore;
  private readonly models: readonly Model[];
  private readonly tooltip: HTMLElement;
  private cursor = { x: 0, y: 0 };

  constructor(root: HTMLElement, store: AppStore, models: readonly Model[], onCinemaToggle: () => void) {
    this.root = root;
    this.store = store;
    this.models = models;
    this.root.innerHTML = `
      <p class="eyebrow">INSTRUMENT CONSOLE</p>
      <h2 id="console-title">Value readout</h2>
      <button class="cinema-toggle" type="button" data-cinema-toggle aria-pressed="false">ENTER CINEMA [C]</button>
      <section class="weight-controls" aria-label="Value-score weights"></section>
      <section class="preset-controls" aria-label="Workload presets"></section>
      <section class="model-readout" aria-live="polite"></section>
      <section class="incomplete-data" aria-label="Incomplete benchmark data"></section>`;

    this.renderControls();
    this.root.querySelector<HTMLButtonElement>("[data-cinema-toggle]")!.addEventListener("click", () => {
      onCinemaToggle();
    });
    this.renderIncompleteData();
    this.tooltip = document.createElement("aside");
    this.tooltip.className = "stage-tooltip";
    this.tooltip.hidden = true;
    this.tooltip.setAttribute("role", "status");
    document.body.appendChild(this.tooltip);
    this.store.subscribe((state) => this.render(state));
  }

  private renderControls() {
    const controls = this.root.querySelector(".weight-controls")!;
    controls.innerHTML = weightKeys.map((key) => `
      <label class="weight-control" for="weight-${key}">
        <span>${key === "intelligence" ? "Intelligence" : key[0].toUpperCase() + key.slice(1)}</span>
        <output for="weight-${key}" data-weight-output="${key}"></output>
        <input id="weight-${key}" data-weight="${key}" type="range" min="0" max="10" step="0.01" aria-label="${key} weight" />
      </label>`).join("");
    controls.querySelectorAll<HTMLInputElement>("input[data-weight]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.weight as WeightKey;
        this.store.update({ weights: { ...this.store.getState().weights, [key]: Number(input.value) } });
      });
    });

    const chips = this.root.querySelector(".preset-controls")!;
    chips.innerHTML = Object.keys(presets).map((name) =>
      `<button class="preset-chip" type="button" data-preset="${name}">${name}</button>`,
    ).join("");
    chips.querySelectorAll<HTMLButtonElement>("button[data-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        const preset = presets[button.dataset.preset as keyof typeof presets];
        this.store.update({ weights: { ...preset } });
      });
    });
  }

  private renderIncompleteData() {
    const incomplete = [...incompleteModels(), ...quarantinedModels()];
    const section = this.root.querySelector(".incomplete-data")!;
    section.innerHTML = `<p class="eyebrow">INCOMPLETE DATA / EXCLUDED</p>${incomplete
      .map((model) => {
        // Per-axis coverage (frontier-math §5.2): show each measured value where
        // known and mark missing axes with their reason, instead of one generic
        // "missing" line. One block span per axis (`.incomplete-data-entry span`
        // is already display:block in tokens.css).
        const axes = incompleteAxisCoverage(model)
          .map((a) => `<span class="incomplete-axis">${a.label}: ${a.display}</span>`)
          .join("");
        return `<p class="incomplete-data-entry" data-model-id="${model.model}"><strong>${model.model}</strong>${axes}</p>`;
      })
      .join("")}`;
  }

  private activeModel(state: Readonly<AppState>) {
    const id = state.pinnedModelId ?? state.hoveredModelId;
    return id ? this.models.find((model) => model.model === id) : undefined;
  }

  private details(model: Model, state: Readonly<AppState>) {
    const score = normalizedScores(this.models, state.weights, this.models)
      .find((candidate) => candidate.model.model === model.model)?.score;
    // Multi-minute TTFTs (reasoning models) carry the honest thinking-time
    // caveat wherever TTFT is shown — this same cell feeds both the value-score
    // readout and the stage tooltip. ttft is stored in ms; shown in seconds.
    const caveat = ttftCaveat(model.ttft);
    const ttftCell = caveat
      ? `${formatTtftSeconds(model.ttft)}<span class="ttft-caveat">${caveat}</span>`
      : formatTtftSeconds(model.ttft);
    return `<strong>${model.model}</strong><span>${model.provider}</span>
      <dl><div><dt>TPS</dt><dd>${formatTps(model.tps)}</dd></div>
      <div><dt>TTFT</dt><dd>${ttftCell}</dd></div>
      <div><dt>Blended price</dt><dd>${formatPricePerM(model.blended_price_per_M)}</dd></div>
      <div><dt>AA index</dt><dd>${formatIntelligence(model.aa_intelligence_index)}</dd></div>
      <div><dt>Value score</dt><dd>${score === undefined ? "—" : score.toFixed(3)}</dd></div></dl>`;
  }

  render(state: Readonly<AppState>) {
    weightKeys.forEach((key) => {
      const input = this.root.querySelector<HTMLInputElement>(`[data-weight="${key}"]`)!;
      const output = this.root.querySelector<HTMLOutputElement>(`[data-weight-output="${key}"]`)!;
      input.value = String(state.weights[key]);
      output.value = state.weights[key].toFixed(2);
    });
    const activePreset = (Object.entries(presets) as [keyof typeof presets, typeof presets[keyof typeof presets]][])
      .find(([, weights]) => weightKeys.every((key) => weights[key] === state.weights[key]))?.[0];
    this.root.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.preset === activePreset);
      button.setAttribute("aria-pressed", String(button.dataset.preset === activePreset));
    });
    const cinemaButton = this.root.querySelector<HTMLButtonElement>("[data-cinema-toggle]");
    if (cinemaButton) {
      cinemaButton.setAttribute("aria-pressed", String(state.cinemaMode));
      cinemaButton.textContent = state.cinemaMode ? "EXIT CINEMA [C]" : "ENTER CINEMA [C]";
    }
    const readout = this.root.querySelector(".model-readout")!;
    const model = this.activeModel(state);
    readout.innerHTML = model ? this.details(model, state) : `<p class="console-note">Hover a model point to inspect its current value score.</p>`;
    if (model) {
      this.tooltip.innerHTML = this.details(model, state);
      this.tooltip.hidden = false;
      this.positionTooltip();
    } else {
      this.tooltip.hidden = true;
    }
  }

  setCursor(clientX: number, clientY: number) {
    this.cursor = { x: clientX, y: clientY };
    this.positionTooltip();
  }

  private positionTooltip() {
    if (this.tooltip.hidden) return;
    const offset = 12;
    const left = this.cursor.x + offset + this.tooltip.offsetWidth > window.innerWidth
      ? this.cursor.x - this.tooltip.offsetWidth - offset
      : this.cursor.x + offset;
    const top = this.cursor.y + offset + this.tooltip.offsetHeight > window.innerHeight
      ? this.cursor.y - this.tooltip.offsetHeight - offset
      : this.cursor.y + offset;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  handleHover(modelId: string, clientX: number, clientY: number) {
    this.setCursor(clientX, clientY);
    if (!this.store.getState().pinnedModelId) this.store.update({ hoveredModelId: modelId });
  }

  handleStageClick(modelId: string | null, clientX: number, clientY: number) {
    this.setCursor(clientX, clientY);
    const state = this.store.getState();
    if (state.pinnedModelId) {
      this.store.update({ pinnedModelId: null, hoveredModelId: modelId });
    } else if (modelId) {
      this.store.update({ pinnedModelId: modelId, hoveredModelId: modelId });
    } else {
      this.store.update({ hoveredModelId: null });
    }
  }
}
