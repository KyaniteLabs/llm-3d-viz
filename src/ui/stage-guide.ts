import { PROVIDER_SHAPES, type Model } from "../data/models";
import { frontier } from "../lib/pareto";
import { normalizedScores, weightedOptimum } from "../lib/score";
import { displayName } from "../lib/display-name";
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
  private models: readonly Model[];
  private readonly heatEncoding: boolean;
  /** User-controlled open state; null until first paint (then defaults apply). */
  private stageKeyOpen: boolean | null = null;
  private providerOpen: boolean | null = null;

  constructor(root: HTMLElement, store: AppStore, models: readonly Model[], heatEncoding = true) {
    this.root = root;
    this.store = store;
    this.models = models;
    this.heatEncoding = heatEncoding;
    this.store.subscribe((state) => this.render(state));
  }

  /** Replace catalog with the current visible set (score/frontier must match stage). */
  setModels(models: readonly Model[]) {
    this.models = models;
    this.render(this.store.getState());
  }

  private captureDisclosureState() {
    const stage = this.root.querySelector<HTMLDetailsElement>(".stage-guide-disclosure");
    const provider = this.root.querySelector<HTMLDetailsElement>(".provider-disclosure");
    if (stage) this.stageKeyOpen = stage.open;
    if (provider) this.providerOpen = provider.open;
  }

  private defaultOpen(isCompact: boolean): { stage: boolean; provider: boolean } {
    // Compact: start collapsed so the plot is unobstructed; desktop: open both.
    return {
      stage: this.stageKeyOpen ?? !isCompact,
      provider: this.providerOpen ?? !isCompact,
    };
  }

  private render(state: Readonly<AppState>) {
    this.captureDisclosureState();
    const frontierModels = frontier(this.models).sort((a, b) => a.model.localeCompare(b.model));
    const optimum = weightedOptimum(normalizedScores(this.models, state.weights, this.models))?.model;
    const groups = providerGroups(this.models);
    const isCompact = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
    const open = this.defaultOpen(isCompact);

    this.root.innerHTML = `
      <details class="stage-guide-disclosure"${open.stage ? " open" : ""}>
        <summary><span>STAGE KEY</span><span class="stage-guide-count">${frontierModels.length} FRONTIER</span></summary>
        <div class="stage-guide-body">
          <section class="stage-legend" aria-label="Stage legend">
            <p class="stage-guide-heading">ENCODING</p>
            <ul class="semantic-key">
              <li data-legend-entry="frontier-ridge"><span class="key-mark key-mark--ridge" aria-hidden="true"></span><span><strong>Pareto frontier</strong><small>white ridge / efficient boundary</small></span></li>
              <li data-legend-entry="optimum-marker"><span class="key-mark key-mark--optimum" aria-hidden="true"></span><span><strong>Optimum marker</strong><small>bright gold / largest</small></span></li>
              <li data-legend-entry="open-point"><span class="key-mark key-mark--open" aria-hidden="true"></span><span><strong>Open weights</strong><small>blue fill (dominated)</small></span></li>
              <li data-legend-entry="closed-point"><span class="key-mark key-mark--closed" aria-hidden="true"></span><span><strong>Closed / proprietary</strong><small>near-black fill (dominated)</small></span></li>
              <li data-legend-entry="reasoning-mark"><span class="key-mark key-mark--reasoning" aria-hidden="true"></span><span><strong>Reasoning</strong><small>open / wireframe glyph</small></span></li>
              <li data-legend-entry="frontier-point"><span class="key-mark key-mark--frontier" aria-hidden="true"></span><span><strong>Frontier point</strong><small>filament-dim size</small></span></li>
            </ul>
            ${this.heatEncoding ? '<p class="heat-encoding-note" data-heat-encoding="true">HEAT ON · copper→filament by value score (diagnostic ?heat=1). Openness still secondary.</p>' : '<p class="heat-encoding-note" data-heat-encoding="false">HEAT OFF · openness fill is primary. Pass ?heat=1 for score heat.</p>'}
          </section>

          <details class="provider-disclosure"${open.provider ? " open" : ""}>
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
                  <strong>${escapeHtml(displayName(model.model))}</strong>
                  <small>${escapeHtml(model.provider)}</small>
                </li>`;
              }).join("")}
            </ol>
            <p class="stage-guide-note" id="frontier-label-note">Names stay in this HTML rail so they remain legible through camera moves; Plotly v0 has no 3D-to-pixel label API.</p>
          </section>

        </div>
      </details>`;

    // Persist toggles from user interaction without waiting for the next store tick.
    this.root.querySelector(".stage-guide-disclosure")?.addEventListener("toggle", (event) => {
      this.stageKeyOpen = (event.currentTarget as HTMLDetailsElement).open;
    });
    this.root.querySelector(".provider-disclosure")?.addEventListener("toggle", (event) => {
      this.providerOpen = (event.currentTarget as HTMLDetailsElement).open;
    });
  }
}
