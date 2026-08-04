import { incompleteModels, incompleteAxisCoverage, quarantinedModels, type Model } from "../data/models";
import {
  availableAxisMetrics,
  isAxisMetricId,
  mappingHeading,
  type AxisMetricId,
  type SceneAxis,
} from "../lib/axis-metrics";
import { familyIdOf } from "../lib/family";
import { listFamilies, listProviders } from "../lib/filters";
import { normalizedScores, presets, weightedOptimum, type ScoreWeights } from "../lib/score";
import { frontier } from "../lib/pareto";
import { formatTps, formatPricePerM, formatIntelligence, formatTtftSeconds, ttftCaveat } from "../lib/format";
import { displayName } from "../lib/display-name";
import type { AppStore, AppState } from "../state";

const weightKeys = ["speed", "cost", "intelligence"] as const;
type WeightKey = (typeof weightKeys)[number];
const sceneAxes: SceneAxis[] = ["x", "y", "z"];
const axisRoleLabel: Record<SceneAxis, string> = {
  x: "X axis",
  y: "Y axis",
  z: "Z axis",
};
const AXIS_STUB_NOTE =
  "Cost/time per Index task axes unlock when those fields ship in the dataset.";

function weightShares(weights: AppState["weights"]): Record<WeightKey, number> {
  const total = weightKeys.reduce((sum, weightKey) => sum + Math.max(0, weights[weightKey]), 0);
  const exact = weightKeys.map((key) => ({
    key,
    value: total === 0 ? 100 / weightKeys.length : (Math.max(0, weights[key]) / total) * 100,
  }));
  const shares = Object.fromEntries(exact.map(({ key, value }) => [key, Math.floor(value)])) as Record<WeightKey, number>;
  let remaining = 100 - weightKeys.reduce((sum, key) => sum + shares[key], 0);
  exact
    .slice()
    .sort((a, b) => b.value - Math.floor(b.value) - (a.value - Math.floor(a.value)))
    .forEach(({ key }) => {
      if (remaining > 0) {
        shares[key] += 1;
        remaining -= 1;
      }
    });
  return shares;
}

export class DecisionConsole {
  private readonly root: HTMLElement;
  private readonly store: AppStore;
  /** Full catalog (for incomplete list + filter option lists). */
  private readonly catalog: readonly Model[];
  /** Current visible set for scores / charts / readout. */
  private models: readonly Model[];
  private readonly tooltip: HTMLElement;
  private cursor = { x: 0, y: 0 };
  private filtersBound = false;

  constructor(root: HTMLElement, store: AppStore, models: readonly Model[], onCinemaToggle: () => void) {
    this.root = root;
    this.store = store;
    this.catalog = models;
    this.models = models;
    this.root.innerHTML = `
      <p class="eyebrow">INSTRUMENT CONSOLE</p>
      <h2 id="console-title">Value readout</h2>
      <button class="cinema-toggle" type="button" data-cinema-toggle aria-pressed="false">ENTER CINEMA [C]</button>
      <section class="filter-controls" aria-label="Visible-set filters">
        <p class="weight-heading">VISIBLE SET / FILTERS</p>
      </section>
      <section class="axis-controls" aria-label="Stage axis metrics"></section>
      <section class="weight-controls" aria-label="Value-score weight shares"></section>
      <section class="preset-controls" aria-label="Workload presets"></section>
      <section class="model-readout" aria-live="polite"></section>
      <section class="task-charts" aria-label="Cost and time per Index task"></section>
      <section class="score-table-host" aria-label="Model score table"></section>
      <section class="incomplete-data" aria-label="Incomplete benchmark data"></section>`;

    this.renderControls();
    this.renderAxisControls();
    this.renderFilterControls();
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

  setModels(models: readonly Model[]) {
    this.models = models;
    this.render(this.store.getState());
  }

  private renderFilterControls() {
    const section = this.root.querySelector(".filter-controls")!;
    const providers = listProviders(this.catalog);
    const families = listFamilies(this.catalog);
    section.innerHTML = `
      <p class="weight-heading">VISIBLE SET / FILTERS</p>
      <label class="filter-toggle">
        <input type="checkbox" data-filter-age checked />
        <span>Age ≤ 6 months (default on)</span>
      </label>
      <label class="axis-control" for="filter-providers">
        <span>Providers</span>
        <select id="filter-providers" data-filter-providers multiple size="5" aria-label="Filter by provider">
          ${providers.map((p) => `<option value="${p}">${p}</option>`).join("")}
        </select>
      </label>
      <label class="axis-control" for="filter-families">
        <span>Families</span>
        <select id="filter-families" data-filter-families multiple size="5" aria-label="Filter by family">
          ${families.map((f) => `<option value="${f}">${f}</option>`).join("")}
        </select>
      </label>
      <p class="axis-hint">Empty multi-select = all. Visible count drives stage, projections, score, and sweep.</p>`;

    if (this.filtersBound) return;
    this.filtersBound = true;
    section.addEventListener("change", (event) => {
      const target = event.target as HTMLElement;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      const age = section.querySelector<HTMLInputElement>("[data-filter-age]")!;
      const prov = section.querySelector<HTMLSelectElement>("[data-filter-providers]")!;
      const fam = section.querySelector<HTMLSelectElement>("[data-filter-families]")!;
      const providersSelected = Array.from(prov.selectedOptions).map((o) => o.value);
      const familiesSelected = Array.from(fam.selectedOptions).map((o) => o.value);
      this.store.update({
        filters: {
          ageEnabled: age.checked,
          ageMonths: 6,
          providers: providersSelected,
          families: familiesSelected,
        },
      });
    });
  }

  private renderAxisControls() {
    const section = this.root.querySelector(".axis-controls")!;
    const options = availableAxisMetrics()
      .map((m) => `<option value="${m.id}">${m.label}</option>`)
      .join("");
    section.innerHTML = `
      <p class="weight-heading">STAGE AXES</p>
      <p class="axis-hint">Remap X / Y / Z metrics — no permanent cost-axis choice required.</p>
      ${sceneAxes
        .map(
          (axis) => `
        <label class="axis-control" for="axis-${axis}">
          <span>${axisRoleLabel[axis]}</span>
          <select id="axis-${axis}" data-axis="${axis}" aria-label="${axisRoleLabel[axis]} metric">
            ${options}
          </select>
        </label>`,
        )
        .join("")}
      <p class="axis-note">${AXIS_STUB_NOTE}</p>`;
    section.querySelectorAll<HTMLSelectElement>("select[data-axis]").forEach((select) => {
      select.addEventListener("change", () => {
        const axis = select.dataset.axis as SceneAxis;
        const value = select.value;
        if (!isAxisMetricId(value)) return;
        const current = this.store.getState().axisMapping;
        this.store.update({
          axisMapping: { ...current, [axis]: value as AxisMetricId },
        });
      });
    });
  }

  private renderControls() {
    const controls = this.root.querySelector(".weight-controls")!;
    controls.innerHTML = `<p class="weight-heading">VALUE SCORE / WEIGHT SHARE</p>${weightKeys
      .map(
        (key) => `
      <label class="weight-control" for="weight-${key}">
        <span>${key === "intelligence" ? "Intelligence" : key[0].toUpperCase() + key.slice(1)}</span>
        <output for="weight-${key}" data-weight-output="${key}" aria-live="polite"></output>
        <input id="weight-${key}" data-weight="${key}" type="range" min="0" max="10" step="0.01" aria-label="${key} weight" />
      </label>`,
      )
      .join("")}`;
    controls.querySelectorAll<HTMLInputElement>("input[data-weight]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.weight as WeightKey;
        this.store.update({ weights: { ...this.store.getState().weights, [key]: Number(input.value) } });
      });
    });

    const chips = this.root.querySelector(".preset-controls")!;
    chips.innerHTML = Object.keys(presets)
      .map((name) => `<button class="preset-chip" type="button" data-preset="${name}">${name}</button>`)
      .join("");
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
    section.innerHTML = `<details class="incomplete-disclosure"><summary>INCOMPLETE DATA / EXCLUDED <span>${incomplete.length}</span></summary><div class="incomplete-data-body">${incomplete
      .map((model) => {
        const axes = incompleteAxisCoverage(model)
          .map((a) => `<span class="incomplete-axis">${a.label}: ${a.display}</span>`)
          .join("");
        return `<p class="incomplete-data-entry" data-model-id="${model.model}"><strong>${displayName(model.model)}</strong>${axes}</p>`;
      })
      .join("")}</div></details>`;
  }

  private activeModel(state: Readonly<AppState>) {
    const id = state.pinnedModelId ?? state.hoveredModelId;
    return id ? this.models.find((model) => model.model === id) : undefined;
  }

  private details(model: Model, state: Readonly<AppState>) {
    const score = normalizedScores(this.models, state.weights, this.models).find(
      (candidate) => candidate.model.model === model.model,
    )?.score;
    const caveat = ttftCaveat(model);
    const ttftCell = caveat
      ? `${formatTtftSeconds(model.ttft)}<span class="ttft-caveat">${caveat}</span>`
      : formatTtftSeconds(model.ttft);
    return `<strong data-model-id="${model.model}">${model.model}</strong><span>${model.provider} · ${model.openness}${model.reasoning ? " · reasoning" : ""}</span>
      <dl><div><dt>TPS</dt><dd>${formatTps(model.tps)}</dd></div>
      <div><dt>TTFT</dt><dd>${ttftCell}</dd></div>
      <div><dt>Blended price</dt><dd>${formatPricePerM(model.blended_price_per_M)}</dd></div>
      <div><dt>AA index</dt><dd>${formatIntelligence(model.aa_intelligence_index)}</dd></div>
      <div><dt>Family</dt><dd>${familyIdOf(model)}</dd></div>
      <div><dt>Value score</dt><dd>${score === undefined ? "—" : score.toFixed(3)}</dd></div></dl>`;
  }

  private leaderboard(state: Readonly<AppState>, activePreset: string | undefined) {
    if (this.models.length === 0) {
      return `<p class="console-note">No models in the visible set. Relax age, provider, or family filters.</p>`;
    }
    const scores = normalizedScores(this.models, state.weights, this.models)
      .slice()
      .sort((left, right) => right.score - left.score || left.model.model.localeCompare(right.model.model));
    const optimum = weightedOptimum(scores) ?? scores[0];
    if (!optimum) return `<p class="console-note">No complete benchmark rows are available in the visible set.</p>`;
    const shares = weightShares(state.weights);
    const presetLabel = activePreset ?? "custom weights";
    return `<section class="value-leaderboard" aria-label="Current value-score leaderboard">
      <p class="eyebrow">CURRENT OPTIMUM · ${this.models.length} VISIBLE</p>
      <p class="optimum-readout" data-optimum-model-id="${optimum.model.model}"><strong>${displayName(optimum.model.model)}</strong><span>${optimum.score.toFixed(3)} VALUE SCORE</span></p>
      <ol>${scores
        .slice(0, 3)
        .map(
          ({ model, score }) =>
            `<li data-model-id="${model.model}"><span>${displayName(model.model)}</span><strong>${score.toFixed(3)}</strong></li>`,
        )
        .join("")}</ol>
      <p class="preset-outcome" data-preset-outcome="${activePreset ?? "custom"}">${presetLabel} · ${shares.speed}% speed / ${shares.cost}% cost / ${shares.intelligence}% intelligence → ${displayName(optimum.model.model)}</p>
    </section>`;
  }

  private renderTaskCharts() {
    const host = this.root.querySelector(".task-charts");
    if (!host) return;
    const withCost = this.models
      .filter((m) => m.cost_per_index_task_usd != null && Number.isFinite(m.cost_per_index_task_usd))
      .slice()
      .sort((a, b) => (a.cost_per_index_task_usd! - b.cost_per_index_task_usd!) || a.model.localeCompare(b.model));
    const withTime = this.models
      .filter((m) => m.time_per_index_task_s != null && Number.isFinite(m.time_per_index_task_s))
      .slice()
      .sort((a, b) => (a.time_per_index_task_s! - b.time_per_index_task_s!) || a.model.localeCompare(b.model));

    const costBody =
      withCost.length === 0
        ? `<p class="console-note" data-task-chart="cost-empty">Cost per Index task — no measured values in the visible set (not estimated from $/M).</p>`
        : `<ol class="task-rank">${withCost
            .slice(0, 12)
            .map(
              (m) =>
                `<li data-model-id="${m.model}"><span>${displayName(m.model)}</span><strong>$${m.cost_per_index_task_usd!.toFixed(4)}</strong></li>`,
            )
            .join("")}</ol>`;

    const timeBody =
      withTime.length === 0
        ? `<p class="console-note" data-task-chart="time-empty">Time per Index task — no measured values in the visible set.</p>`
        : `<ol class="task-rank">${withTime
            .slice(0, 12)
            .map(
              (m) =>
                `<li data-model-id="${m.model}"><span>${displayName(m.model)}</span><strong>${m.time_per_index_task_s!.toFixed(1)}s</strong></li>`,
            )
            .join("")}</ol>`;

    host.innerHTML = `
      <p class="weight-heading">TASK ECONOMICS (VISIBLE SET)</p>
      <div class="task-chart-block" data-task-chart="cost">
        <p class="eyebrow">COST / INDEX TASK</p>
        ${costBody}
      </div>
      <div class="task-chart-block" data-task-chart="time">
        <p class="eyebrow">TIME / INDEX TASK</p>
        ${timeBody}
      </div>`;
  }

  render(state: Readonly<AppState>) {
    weightKeys.forEach((key) => {
      const input = this.root.querySelector<HTMLInputElement>(`[data-weight="${key}"]`)!;
      const output = this.root.querySelector<HTMLOutputElement>(`[data-weight-output="${key}"]`)!;
      input.value = String(state.weights[key]);
      const share = weightShares(state.weights)[key];
      output.value = `${share}%`;
      output.textContent = `${share}%`;
      input.setAttribute("aria-valuetext", `${share}% share`);
    });
    sceneAxes.forEach((axis) => {
      const select = this.root.querySelector<HTMLSelectElement>(`[data-axis="${axis}"]`);
      if (select) select.value = state.axisMapping[axis];
    });
    const age = this.root.querySelector<HTMLInputElement>("[data-filter-age]");
    if (age) age.checked = state.filters.ageEnabled;

    const stageTitle = document.getElementById("stage-title");
    if (stageTitle) stageTitle.textContent = mappingHeading(state.axisMapping);

    const activePreset = (
      Object.entries(presets) as [keyof typeof presets, (typeof presets)[keyof typeof presets]][]
    ).find(([, weights]) => weightKeys.every((key) => weights[key] === state.weights[key]))?.[0];
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
    readout.innerHTML = model ? this.details(model, state) : this.leaderboard(state, activePreset);
    this.renderTaskCharts();
    this.renderScoreTable(state.weights);
    if (model) {
      this.tooltip.innerHTML = this.details(model, state);
      this.tooltip.hidden = false;
      this.positionTooltip();
    } else {
      this.tooltip.hidden = true;
    }
  }

  renderScoreTable(weights: ScoreWeights) {
    const host = this.root.querySelector(".score-table-host");
    if (!host) return;
    const scores = normalizedScores(this.models, weights, this.models)
      .slice()
      .sort((a, b) => b.score - a.score || a.model.model.localeCompare(b.model.model));
    const frontierIds = new Set(frontier(this.models).map((m) => m.model));
    const optimum = weightedOptimum(scores)?.model.model;
    const rows = scores
      .map(({ model, score }) => {
        const role =
          model.model === optimum ? "optimum" : frontierIds.has(model.model) ? "frontier" : "dominated";
        return `<tr data-model-id="${model.model}" data-role="${role}" tabindex="0">
          <th scope="row">${displayName(model.model)}</th>
          <td>${model.provider}</td>
          <td>${model.openness}</td>
          <td>${formatTps(model.tps)}</td>
          <td>${formatPricePerM(model.blended_price_per_M)}</td>
          <td>${formatIntelligence(model.aa_intelligence_index)}</td>
          <td>${score.toFixed(3)}</td>
          <td>${role}</td>
        </tr>`;
      })
      .join("");
    host.innerHTML = `<details class="score-table-disclosure" open>
      <summary>MODEL TABLE · ${scores.length} SCORABLE IN VIEW</summary>
      <div class="score-table-wrap" role="region" aria-label="Scorable models by value score">
        <table class="score-table">
          <caption class="visually-hidden">Visible scorable models with speed, cost, intelligence, and value score.</caption>
          <thead><tr>
            <th scope="col">Model</th><th scope="col">Provider</th><th scope="col">Open</th><th scope="col">TPS</th>
            <th scope="col">Cost $/M</th><th scope="col">Intel</th><th scope="col">Score</th><th scope="col">Class</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="8">No scorable models in the visible set.</td></tr>`}</tbody>
        </table>
      </div>
    </details>`;
    host.querySelectorAll<HTMLTableRowElement>("tbody tr[data-model-id]").forEach((row) => {
      const activate = () => {
        const id = row.dataset.modelId;
        if (!id) return;
        this.store.update({ hoveredModelId: id, pinnedModelId: id });
      };
      row.addEventListener("click", activate);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    });
  }

  setCursor(clientX: number, clientY: number) {
    this.cursor = { x: clientX, y: clientY };
    this.positionTooltip();
  }

  private positionTooltip() {
    if (this.tooltip.hidden) return;
    const offset = 12;
    const left =
      this.cursor.x + offset + this.tooltip.offsetWidth > window.innerWidth
        ? this.cursor.x - this.tooltip.offsetWidth - offset
        : this.cursor.x + offset;
    const top =
      this.cursor.y + offset + this.tooltip.offsetHeight > window.innerHeight
        ? this.cursor.y - this.tooltip.offsetHeight - offset
        : this.cursor.y + offset;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  handleHover(modelId: string, clientX?: number, clientY?: number) {
    if (clientX !== undefined && clientY !== undefined) this.setCursor(clientX, clientY);
    this.store.update({ hoveredModelId: modelId });
  }

  handleStageEnter() {
    this.store.update({ hoveredModelId: null });
  }

  handleStageLeave() {
    this.store.update({ hoveredModelId: null });
  }

  handleStageClick(modelId: string | null, clientX: number, clientY: number) {
    this.setCursor(clientX, clientY);
    if (modelId) {
      this.store.update({ pinnedModelId: modelId, hoveredModelId: modelId });
      return;
    }
    this.store.update({ pinnedModelId: null, hoveredModelId: null });
  }
}
