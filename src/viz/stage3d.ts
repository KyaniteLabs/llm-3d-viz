import * as Plotly from "plotly.js-dist-min";
import { Model, isScorable, PROVIDER_SHAPES, Plotly3dSymbol } from "../data/models";
import { ScoreWeights, normalizedScores, weightedOptimum } from "../lib/score";
import { frontier, ridgeOrder } from "../lib/pareto";

// Fallbacks mirror the DESIGN-SYSTEM.md token block, the visual source of truth.
const DESIGN_SYSTEM_TOKEN_FALLBACKS = {
  filament: "#E8F1E4",
  filamentDim: "#C9D4C4",
  slateCyan: "#3D5560",
  textWarm: "#E7E2D8",
  textMuted: "#89939E",
  inkField: "#070C0B",
  fontMono: '"IBM Plex Mono", "Geist Mono", ui-monospace, monospace',
} as const;

export class Stage3D {
  private readonly container: HTMLElement;
  public readonly gd: HTMLDivElement;
  private readonly tokens: {
    filament: string;
    filamentDim: string;
    slateCyan: string;
    textWarm: string;
    textMuted: string;
    inkField: string;
    fontMono: string;
  };
  private camera: any;
  private isInitialized = false;
  private priceFloor = 0.08125; // default fallback, will be computed dynamically

  constructor(container: HTMLElement) {
    this.container = container;
    const styles = getComputedStyle(document.documentElement);
    const resolveToken = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    this.tokens = {
      filament: resolveToken("--filament", DESIGN_SYSTEM_TOKEN_FALLBACKS.filament),
      filamentDim: resolveToken("--filament-dim", DESIGN_SYSTEM_TOKEN_FALLBACKS.filamentDim),
      slateCyan: resolveToken("--slate-cyan", DESIGN_SYSTEM_TOKEN_FALLBACKS.slateCyan),
      textWarm: resolveToken("--text-warm", DESIGN_SYSTEM_TOKEN_FALLBACKS.textWarm),
      textMuted: resolveToken("--text-muted", DESIGN_SYSTEM_TOKEN_FALLBACKS.textMuted),
      inkField: resolveToken("--ink-field", DESIGN_SYSTEM_TOKEN_FALLBACKS.inkField),
      fontMono: resolveToken("--font-mono", DESIGN_SYSTEM_TOKEN_FALLBACKS.fontMono),
    };
    this.gd = document.createElement("div");
    this.gd.className = "stage-3d-canvas";
    this.gd.style.width = "100%";
    this.gd.style.height = "100%";
    this.container.appendChild(this.gd);

    this.camera = {
      eye: { x: 1.5, y: 1.5, z: 1.5 },
      up: { x: 0, y: 0, z: 1 },
      center: { x: 0, y: 0, z: 0 },
    };

    this.setupContextLostListener();
  }

  private colorWithAlpha(color: string | undefined, alpha: number): string {
    const resolvedColor = color?.trim() || DESIGN_SYSTEM_TOKEN_FALLBACKS.textWarm;
    const hex = resolvedColor.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
    if (hex) {
      const normalized = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
      const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
      return `rgba(${channels.join(", ")}, ${alpha})`;
    }
    const rgb = resolvedColor.match(/^rgba?\(([^)]+)\)$/i)?.[1];
    if (rgb) {
      const channels = rgb.split(",").slice(0, 3).map((channel) => channel.trim());
      return `rgba(${channels.join(", ")}, ${alpha})`;
    }
    return resolvedColor;
  }

  private setupContextLostListener() {
    // The native event is available before Plotly initializes the graph div.
    // Plotly's `.on()` listener is attached after `newPlot()` resolves below.
    this.gd.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.showReloadPrompt();
    }, false);
  }

  private showReloadPrompt() {
    const existing = this.container.querySelector(".webgl-lost-prompt");
    if (existing) return;

    const prompt = document.createElement("div");
    prompt.className = "webgl-lost-prompt";
    prompt.style.position = "absolute";
    prompt.style.inset = "0";
    prompt.innerHTML = `
      <div style="width: 100%; height: 100%; background: rgba(7, 12, 11, 0.95); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 9999; font-family: var(--font-mono); color: var(--color-text);">
        <p style="margin-bottom: 1rem; letter-spacing: 0.1em; font-size: var(--step-0);">WEBGL CONTEXT LOST</p>
        <button id="webgl-reload-btn" style="background: var(--filament); color: var(--ink-field); border: none; padding: 0.5rem 1rem; border-radius: var(--radius-control); cursor: pointer; font-family: var(--font-mono); font-weight: 500;">RELOAD GRAPH</button>
      </div>
    `;
    this.container.style.position = "relative";
    this.container.appendChild(prompt);

    prompt.querySelector("#webgl-reload-btn")?.addEventListener("click", () => {
      window.location.reload();
    });
  }

  public setCamera(camera: any) {
    this.camera = {
      ...this.camera,
      ...camera,
    };
    Plotly.relayout(this.gd, { "scene.camera": this.camera });
  }

  public orbitTo(angleRad: number) {
    const radius = 1.8;
    const height = 1.0;
    const x = radius * Math.cos(angleRad);
    const y = radius * Math.sin(angleRad);
    this.setCamera({
      eye: { x, y, z: height },
      up: { x: 0, y: 0, z: 1 },
      center: { x: 0, y: 0, z: 0 },
    });
  }

  public render(weights: ScoreWeights, modelsList: Model[]) {
    const scorable = modelsList.filter(isScorable);
    const frontierModels = frontier(modelsList);
    const scores = normalizedScores(modelsList, weights, modelsList);
    const optimumScore = weightedOptimum(scores);
    const optimumModel = optimumScore?.model;

    // Dynamically calculate priceFloor
    const positivePrices = scorable
      .map((m) => m.blended_price_per_M!)
      .filter((p) => p > 0);
    this.priceFloor = positivePrices.length > 0 ? Math.min(...positivePrices) / 2 : 0.08125;

    // Build lists for Scatter3D points
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];
    const colors: string[] = [];
    const sizes: number[] = [];
    const symbols: Plotly3dSymbol[] = [];
    const textLabels: string[] = [];
    const frontierIds = new Set(frontierModels.map((model) => model.model));
    const otherFrontierSymbols = new Set(
      scorable
        .filter((model) => frontierIds.has(model.model) && model.model !== optimumModel?.model)
        .map((model) => PROVIDER_SHAPES[model.provider] || "circle"),
    );
    const symbolCandidates: Plotly3dSymbol[] = [
      "circle",
      "circle-open",
      "cross",
      "diamond",
      "diamond-open",
      "square",
      "square-open",
      "x",
    ];

    scorable.forEach((model) => {
      const isOpt = optimumModel && model.model === optimumModel.model;
      const isFront = frontierModels.some((fm) => fm.model === model.model);

      x.push(model.tps!);
      y.push(model.aa_intelligence_index!);

      const price =
        model.blended_price_per_M! <= 0 ? this.priceFloor : model.blended_price_per_M!;
      z.push(price);

      const baseSymbol = PROVIDER_SHAPES[model.provider] || "circle";
      let symbol: Plotly3dSymbol = baseSymbol;
      if (isOpt) {
        // The optimum needs a non-colour channel that is distinct from every
        // other frontier point, not just from its own provider's base glyph.
        symbol =
          symbolCandidates.find((candidate) => candidate !== baseSymbol && !otherFrontierSymbols.has(candidate)) ??
          (baseSymbol === "diamond" ? "circle" : "diamond");
      }
      symbols.push(symbol);

      let color = this.tokens.textWarm;
      if (isOpt) {
        color = this.tokens.filament;
      } else if (isFront) {
        color = this.tokens.filamentDim;
      } else {
        color = this.colorWithAlpha(this.tokens.slateCyan, 0.5);
      }
      colors.push(color);

      let size = 8; // standard pearl base size
      if (isOpt) {
        size = 16; // Optimum gets larger size
      } else if (isFront) {
        size = 10; // Frontier slightly larger
      } else {
        size = 7; // Dominated slightly smaller
      }
      sizes.push(size);

      textLabels.push(model.model);
    });

    // Trace 0: Scorable models as points
    const pointsTrace = {
      type: "scatter3d",
      mode: "markers",
      x,
      y,
      z,
      text: textLabels,
      marker: {
        ...(this.isInitialized ? {} : { color: colors, size: sizes }),
        symbol: symbols,
        line: { color: this.tokens.inkField, width: 1 },
      },
      hoverinfo: "none",
    };

    // Trace 1: Pareto ridge polyline
    const vertices = ridgeOrder(frontierModels);
    const ridgeX = vertices.map((v) => v.model.tps!);
    const ridgeY = vertices.map((v) => v.model.aa_intelligence_index!);
    const ridgeZ = vertices.map((v) =>
      v.model.blended_price_per_M! <= 0 ? this.priceFloor : v.model.blended_price_per_M!
    );

    const ridgeTrace = {
      type: "scatter3d",
      mode: "lines",
      x: ridgeX,
      y: ridgeY,
      z: ridgeZ,
      line: {
        color: this.tokens.filament,
        width: 4,
      },
      hoverinfo: "none",
    };

    // De-chromed axis config
    const axisLayout = (titleText: string, tickvals: number[], ticktext: string[]) => ({
      type: "log",
      visible: true,
      showgrid: false,
      zeroline: false,
      showline: true,
      linecolor: this.colorWithAlpha(this.tokens.textWarm, 0.15),
      showbackground: false,
      showspikes: false,
      tickmode: "array",
      tickvals,
      ticktext,
      tickfont: {
        family: this.tokens.fontMono,
        size: 10,
        color: this.tokens.textMuted,
      },
      title: {
        text: titleText,
        font: {
          family: this.tokens.fontMono,
          size: 11,
          color: this.tokens.textWarm,
        },
      },
    });

    const layout = {
      paper_bgcolor: this.tokens.inkField,
      plot_bgcolor: this.tokens.inkField,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      showlegend: false,
      uirevision: "constant_camera",
      scene: {
        uirevision: "constant_camera",
        xaxis: axisLayout("SPEED (TPS)", [10, 100, 1000], ["10", "100", "1000"]),
        yaxis: axisLayout("INTELLIGENCE (INDEX)", [1, 10, 100], ["1", "10", "100"]),
        zaxis: axisLayout(
          "COST ($/M)",
          [this.priceFloor, 0.1, 1, 10, 100],
          ["≤ floor", "0.1", "1", "10", "100"]
        ),
        camera: this.camera,
        // 'closest' (not false) so the stage emits plotly_hover on hover and the
        // linked 2D projections can couple to it bidirectionally by model ID.
        // hoverinfo 'none' on the trace still suppresses the native hover card,
        // so the de-chrome contract (empty hoverlayer) is preserved.
        hovermode: "closest",
      },
    };

    const config = {
      displayModeBar: false,
      displaylogo: false,
      responsive: true,
    };

    if (!this.isInitialized) {
      const plotReady = Plotly.newPlot(this.gd, [pointsTrace, ridgeTrace], layout as any, config);
      this.isInitialized = true;
      void plotReady.then(() => this.setupPlotlyListeners());
    } else {
      Plotly.react(this.gd, [pointsTrace, ridgeTrace], layout as any, config);
    }

    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      const modelIndexToPointNumber: Record<number, number> = {};
      const pointNumberToModelIndex: Record<number, number> = {};
      const pointNumberToModelId: Record<number, string> = {};
      const modelIdToPointNumber: Record<string, number> = {};

      scorable.forEach((model, index) => {
        modelIndexToPointNumber[index] = index;
        pointNumberToModelIndex[index] = index;
        pointNumberToModelId[index] = model.model;
        modelIdToPointNumber[model.model] = index;
      });

      (window as any).__viz = {
        modelIndexToPointNumber,
        pointNumberToModelIndex,
        pointNumberToModelId,
        modelIdToPointNumber,
        scorableModels: scorable,
        providerShapes: PROVIDER_SHAPES,
        frontierModelIds: frontierModels.map((model) => model.model),
        gd: this.gd,
        priceFloor: this.priceFloor,
        Plotly,
      };
    }
  }

  private setupPlotlyListeners() {
    const on = (this.gd as any).on;
    if (typeof on !== "function") return;

    on.call(this.gd, "plotly_webglcontextlost", () => {
      this.showReloadPrompt();
    });
    on.call(this.gd, "plotly_relayout", (eventData: any) => {
      let updated = false;
      if (eventData["scene.camera"]) {
        this.camera = eventData["scene.camera"];
        updated = true;
      } else {
        const newCamera = { ...this.camera };
        if (eventData["scene.camera.eye"]) {
          newCamera.eye = eventData["scene.camera.eye"];
          updated = true;
        }
        if (eventData["scene.camera.up"]) {
          newCamera.up = eventData["scene.camera.up"];
          updated = true;
        }
        if (eventData["scene.camera.center"]) {
          newCamera.center = eventData["scene.camera.center"];
          updated = true;
        }
        if (updated) {
          this.camera = newCamera;
        }
      }
    });
  }
}
