import type { Model } from "../data/models";
import { frontier } from "../lib/pareto";
import { normalizedScores, weightedOptimum } from "../lib/score";
import { displayName } from "../lib/display-name";
import type { AppState, AppStore } from "../state";
import { legendEntries, labLegendEntries, type PresentationMode } from "../viz/palette";
import { MARK_GLYPH_LEGEND } from "../viz/mark-encoding";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
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
  private readonly presentationMode: PresentationMode;
  /** User-controlled open state; null until first paint (then defaults apply). */
  private stageKeyOpen: boolean | null = null;
  private glyphOpen: boolean | null = null;

  constructor(
    root: HTMLElement,
    store: AppStore,
    models: readonly Model[],
    heatEncoding = true,
    presentationMode: PresentationMode = "curve",
  ) {
    this.root = root;
    this.store = store;
    this.models = models;
    this.heatEncoding = heatEncoding;
    this.presentationMode = presentationMode;
    this.store.subscribe((state) => this.render(state));
  }

  /** Replace catalog with the current visible set (score/frontier must match stage). */
  setModels(models: readonly Model[]) {
    this.models = models;
    this.render(this.store.getState());
  }

  private captureDisclosureState() {
    const stage = this.root.querySelector<HTMLDetailsElement>(".stage-guide-disclosure");
    const glyph = this.root.querySelector<HTMLDetailsElement>(".glyph-disclosure");
    if (stage) this.stageKeyOpen = stage.open;
    if (glyph) this.glyphOpen = glyph.open;
  }

  private defaultOpen(isCompact: boolean): { stage: boolean; glyph: boolean } {
    // S+: encoding HUD open by default (glanceable decode; no hover tour).
    // User open state is sticky after first toggle.
    return {
      stage: this.stageKeyOpen ?? true,
      glyph: this.glyphOpen ?? true,
    };
  }

  private render(state: Readonly<AppState>) {
    this.captureDisclosureState();
    const frontierModels = frontier(this.models).sort((a, b) => a.model.localeCompare(b.model));
    // Decide mode: no value-score optimum (B′ single ranking authority).
    const optimum = state.decideMode
      ? undefined
      : weightedOptimum(normalizedScores(this.models, state.weights, this.models))?.model;
    const isCompact = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
    const open = this.defaultOpen(isCompact);

    this.root.innerHTML = `
      <details class="stage-guide-disclosure"${open.stage ? " open" : ""}>
        <summary><span>STAGE KEY</span><span class="stage-guide-count">${frontierModels.length} FRONTIER</span></summary>
        <div class="stage-guide-body">
          <section class="stage-legend" aria-label="Stage legend">
            <p class="stage-guide-heading">ENCODING</p>
            <ul class="semantic-key">
              ${legendEntries(this.presentationMode, this.heatEncoding)
                .filter((e) => e.id !== "heat-note")
                .map(
                  (e) =>
                    `<li data-legend-entry="${e.id}"><span class="key-mark key-mark--${e.id}" aria-hidden="true"></span><span><strong>${e.title}</strong><small>${e.detail}</small></span></li>`,
                )
                .join("")}
            </ul>
            ${
              this.heatEncoding
                ? '<p class="heat-encoding-note" data-heat-encoding="true">HEAT ON · copper→filament by value score (diagnostic ?heat=1).</p>'
                : this.presentationMode === "curve"
                  ? '<p class="heat-encoding-note" data-heat-encoding="false">Lab = color · shape = open/closed (all wire) · size = value score. Reasoning is not a glyph.</p>'
                  : '<p class="heat-encoding-note" data-heat-encoding="false">OPENNESS MODE · blue/slate fill primary. Glyphs = open/closed wire only.</p>'
            }
          </section>

          <details class="lab-disclosure" open>
            <summary class="stage-guide-heading">LAB COLORS · ${labLegendEntries(
              this.models.map((m) => m.provider),
              this.models.map((m) => ({ provider: m.provider, model: m.model })),
            ).length}</summary>
            <section class="lab-key" aria-label="Lab color key">
              <ul class="lab-color-list">
                ${labLegendEntries(
                  this.models.map((m) => m.provider),
                  this.models.map((m) => ({ provider: m.provider, model: m.model })),
                )
                  .map(({ provider, colors }) => {
                    const shown = colors.slice(0, Math.max(3, Math.min(5, colors.length)));
                    const hexLine = shown.map((c) => escapeHtml(c)).join(" · ");
                    const chips = shown
                      .map(
                        (c, i) =>
                          `<span class="lab-swatch lab-swatch--n${i}" style="background:${escapeHtml(c)}; box-shadow: inset 0 0 0 1px rgba(231,226,216,0.2)"></span>`,
                      )
                      .join("");
                    return `<li data-lab="${escapeHtml(provider)}">
                        <span class="lab-swatch-strip" aria-hidden="true">${chips}</span>
                        <span>${escapeHtml(provider)} <small class="lab-hex">${hexLine}</small></span>
                      </li>`;
                  })
                  .join("")}
              </ul>
              <p class="stage-guide-note">Color = lab only. ≥3 brand colors always: fill · outer ring · core. Qwen is violet (not Alibaba orange). Family shades only the primary.</p>
            </section>
          </details>

          <details class="glyph-disclosure"${open.glyph ? " open" : ""}>
            <summary class="stage-guide-heading">GLYPHS · OPEN VS CLOSED (ALL WIRE)</summary>
            <section class="provider-key glyph-key" aria-label="Glyph encoding key">
              <ul class="provider-shape-list">
                ${MARK_GLYPH_LEGEND.map(
                  (row) => `<li data-glyph-key="${escapeHtml(row.id)}" data-provider-shape="${escapeHtml(row.plotlySymbol)}">
                  <span class="provider-glyph provider-glyph--${escapeHtml(row.plotlySymbol)}" aria-label="${escapeHtml(row.title)}" role="img"></span>
                  <span><strong>${escapeHtml(row.title)}</strong><small> · ${escapeHtml(row.detail)}</small></span>
                </li>`,
                ).join("")}
              </ul>
              <p class="stage-guide-note">Wire sphere = closed weights · wire octa = open weights. All marks wireframe. Reasoning is not a shape (inspector only). Lab is never shape.</p>
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
    this.root.querySelector(".glyph-disclosure")?.addEventListener("toggle", (event) => {
      this.glyphOpen = (event.currentTarget as HTMLDetailsElement).open;
    });
  }
}
