import { PROVIDER_SHAPES, type Model } from "../data/models";
import { frontier } from "../lib/pareto";
import { normalizedScores, weightedOptimum } from "../lib/score";
import type { AppState, AppStore } from "../state";

const SHAPE_LABELS: Record<string, string> = {
  circle: "circle",
  "circle-open": "open circle",
  cross: "cross",
  diamond: "diamond",
  "diamond-open": "open diamond",
  square: "square",
  "square-open": "open square",
  x: "x",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function providerGroups(models: readonly Model[]): Array<{ shape: string; providers: string[] }> {
  const present = new Set(models.map((model) => model.provider));
  const groups = new Map<string, string[]>();
  Object.entries(PROVIDER_SHAPES).forEach(([provider, shape]) => {
    if (!present.has(provider)) return;
    const names = groups.get(shape) ?? [];
    names.push(provider);
    groups.set(shape, names);
  });
  return [...groups.entries()].map(([shape, providers]) => ({ shape, providers }));
}

/**
 * HTML comprehension rail for the Plotly stage. Frontier names are kept in a
 * stable DOM list rather than positioned over 3D coordinates: Plotly v0 does
 * not expose a supported 3D-to-pixel projection for camera-following labels.
 */
export class StageGuide {
  private readonly root: HTMLElement;
  private readonly store: AppStore;
  private readonly models: readonly Model[];
  private readonly heatEncoding: boolean;

  constructor(root: HTMLElement, store: AppStore, models: readonly Model[], heatEncoding = true) {
    this.root = root;
    this.store = store;
    this.models = models;
    this.heatEncoding = heatEncoding;
    this.store.subscribe((state) => this.render(state));
  }

  private render(state: Readonly<AppState>) {
    const frontierModels = frontier(this.models).sort((a, b) => a.model.localeCompare(b.model));
    const optimum = weightedOptimum(normalizedScores(this.models, state.weights, this.models))?.model;
    const groups = providerGroups(this.models);
    const isCompact = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;

    this.root.innerHTML = `
      <details class="stage-guide-disclosure"${isCompact ? "" : " open"}>
        <summary><span>STAGE KEY</span><span class="stage-guide-count">${frontierModels.length} FRONTIER</span></summary>
        <div class="stage-guide-body">
          <section class="stage-legend" aria-label="Stage legend">
            <p class="stage-guide-heading">ENCODING</p>
            <ul class="semantic-key">
              <li data-legend-entry="frontier-ridge"><span class="key-mark key-mark--ridge" aria-hidden="true"></span><span><strong>Pareto frontier</strong><small>white ridge / efficient boundary</small></span></li>
              <li data-legend-entry="optimum-marker"><span class="key-mark key-mark--optimum" aria-hidden="true"></span><span><strong>Optimum marker</strong><small>filament / largest point</small></span></li>
              <li data-legend-entry="frontier-point"><span class="key-mark key-mark--frontier" aria-hidden="true"></span><span><strong>Frontier point</strong><small>filament-dim / efficient model</small></span></li>
              <li data-legend-entry="dominated-point"><span class="key-mark key-mark--dominated" aria-hidden="true"></span><span><strong>Dominated point</strong><small>dim slate / tradeoff set</small></span></li>
            </ul>
            ${this.heatEncoding ? '<p class="heat-encoding-note" data-heat-encoding="true">HEAT · point luminance follows the current value score; glyphs and frontier ridge retain their meaning.</p>' : ""}
          </section>

          <details class="provider-disclosure">
            <summary class="stage-guide-heading">PROVIDER SHAPES · ${Object.keys(PROVIDER_SHAPES).length} PROVIDERS</summary>
            <section class="provider-key" aria-label="Provider shape key">
              <ul class="provider-shape-list">
                ${groups.map(({ shape, providers }) => `<li data-provider-shape="${escapeHtml(shape)}">
                  <span class="provider-glyph provider-glyph--${escapeHtml(shape)}" aria-label="${escapeHtml(SHAPE_LABELS[shape] ?? shape)}" role="img"></span>
                  <span>${providers.map(escapeHtml).join(", ")}</span>
                </li>`).join("")}
              </ul>
            </section>
          </details>

          <section class="frontier-labels" aria-label="Frontier model labels">
            <p class="stage-guide-heading">FRONTIER MODELS</p>
            <ol class="frontier-model-list">
              ${frontierModels.map((model) => {
                const isOptimum = model.model === optimum?.model;
                return `<li data-frontier-model="${escapeHtml(model.model)}"${isOptimum ? ' data-optimum="true"' : ""}>
                  <span class="frontier-model-status">${isOptimum ? "OPTIMUM" : "FRONTIER"}</span>
                  <strong>${escapeHtml(model.model)}</strong>
                  <small>${escapeHtml(model.provider)}</small>
                </li>`;
              }).join("")}
            </ol>
            <p class="stage-guide-note" id="frontier-label-note">Names stay in this HTML rail so they remain legible through camera moves; Plotly v0 has no 3D-to-pixel label API.</p>
          </section>

        </div>
      </details>`;
  }
}
