import { loadPlotly } from "./plotly-loader";
import { Model, isScorable, Plotly3dSymbol } from "../data/models";
import { ScoreWeights, normalizedScores, weightedOptimum } from "../lib/score";
import { frontier, ridgeOrder } from "../lib/pareto";
import { isSingleton, pointEncoding, type PresentationMode, type SemanticPointClass } from "./palette";
import { markChannels } from "./mark-encoding";
import { familyIdOf } from "../lib/family";
import {
  DEFAULT_AXIS_MAPPING,
  buildAxisDomain,
  densityMarkerScale,
  hasMappedAxes,
} from "../lib/axis-metrics";

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
  /** Stage API mount root — same as gd for the Plotly implementation. */
  public readonly el: HTMLDivElement;
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
  // FIX-D (#29): re-entrancy guard for the corrective relayout that enforces the
  // eye.z floor on the plotly_relayout read-back path (a normal orbit drag can
  // otherwise flip the camera below the stage plane).
  private relayoutClampInFlight = false;
  private isInitialized = false;
  private presentationMode: PresentationMode = "curve";
  private readonly heatEncoding: boolean;
  private priceFloor = 0.08125;
  private renderGen = 0; // default fallback, will be computed dynamically

  constructor(container: HTMLElement, heatEncoding = true) {
    this.container = container;
    const styles = getComputedStyle(document.documentElement);
    const resolveToken = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    // Color tokens may serialize as color(display-p3 …) in wide-gamut browsers;
    // route through a 2D canvas so we get browser-converted sRGB bytes (mirrors
    // stage3d-three.ts — see the whiteout note there).
    const resolveColorToken = (name: string, fallback: string): string => {
      const raw = styles.getPropertyValue(name).trim();
      if (!raw) return fallback;
      const c = document.createElement("canvas");
      c.width = 1; c.height = 1;
      const ctx = c.getContext("2d");
      if (!ctx) return fallback;
      ctx.fillStyle = raw;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
    };
    this.tokens = {
      filament: resolveColorToken("--filament", DESIGN_SYSTEM_TOKEN_FALLBACKS.filament),
      filamentDim: resolveColorToken("--filament-dim", DESIGN_SYSTEM_TOKEN_FALLBACKS.filamentDim),
      slateCyan: resolveColorToken("--slate-cyan", DESIGN_SYSTEM_TOKEN_FALLBACKS.slateCyan),
      textWarm: resolveColorToken("--text-warm", DESIGN_SYSTEM_TOKEN_FALLBACKS.textWarm),
      textMuted: resolveColorToken("--text-muted", DESIGN_SYSTEM_TOKEN_FALLBACKS.textMuted),
      inkField: resolveColorToken("--ink-field", DESIGN_SYSTEM_TOKEN_FALLBACKS.inkField),
      fontMono: resolveToken("--font-mono", DESIGN_SYSTEM_TOKEN_FALLBACKS.fontMono),
    };
    this.gd = document.createElement("div");
    this.gd.className = "stage-3d-canvas";
    this.gd.style.width = "100%";
    this.gd.style.height = "100%";
    this.el = this.gd;
    this.container.appendChild(this.gd);
    (this.gd as any).__stageBackend = "plotly";
    this.gd.setAttribute("role", "img");
    this.gd.setAttribute("aria-label", "3D model benchmark stage: speed, cost, and intelligence");

    this.camera = {
      // Hero eye sits in the −cost / −intelligence octant so floor-axis ticks
      // read the natural way on screen: low values near the camera (lower on the
      // floor plane) and high values recede (higher on screen). The old +x/+y eye
      // put 0/cheap at the far edge, so intelligence/cost looked reversed
      // (high numbers at the bottom of the axis). Z = speed stays camera-up.
      // User camera state remains the single writer after Plotly init.
      eye: { x: -1.45, y: -1.25, z: 1.15 },
      up: { x: 0, y: 0, z: 1 },
      center: { x: 0, y: 0, z: 0 },
    };
    this.heatEncoding = heatEncoding;

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

  /**
   * Floor for eye.z (FIX-D #29). Keeps the camera above the z=0 stage plane and
   * off the degenerate horizon where axis labels clip and rotate. Small relative
   * to the default eye radius (~2.6), and robust across the scene's zoom range.
   */
  private static readonly EYE_Z_FLOOR = 0.2;

  /**
   * Below this plot-container width (FIX-D #29) the stage is treated as "narrow"
   * (phones). The native 3D axis titles are WebGL textures fixed at the axis ends;
   * on a narrow stage the long titles clip at the canvas edge and no paper margin
   * reclaims them, so at narrow widths the titles are shortened to the metric name
   * and the title/tick fonts shrunk. Threshold is in plot-container px (≈317 at a
   * 375px viewport), comfortably below any desktop column width, so the default
   * (1280px) render suite is unaffected.
   */
  private static readonly NARROW_PX = 460;

  /** Clamp eye.z to EYE_Z_FLOOR; returns true iff it raised the eye. */
  private clampCameraEye(): boolean {
    const eye = this.camera?.eye;
    if (eye && typeof eye.z === "number" && eye.z < Stage3D.EYE_Z_FLOOR) {
      eye.z = Stage3D.EYE_Z_FLOOR;
      return true;
    }
    return false;
  }

  public setCamera(camera: any) {
    this.camera = {
      ...this.camera,
      ...camera,
    };
    this.clampCameraEye();
    // Prefer the QA-instrumented Plotly on __viz when present (cinema orbit tests).
    void loadPlotly().then((Plotly) => {
      const plotly = (window as any).__viz?.Plotly ?? Plotly;
      return plotly.relayout(this.gd, { "scene.camera": this.camera });
    });
  }

  public orbitTo(angleRad: number) {
    const radius = 1.9;
    const height = 1.15;
    // Phase offset so cinema starts near the default −x/−y hero octant rather
    // than the +x axis (where floor ticks read reversed on first paint).
    const phase = (Math.PI * 5) / 4; // 225° ≈ (−x, −y)
    const x = radius * Math.cos(angleRad + phase);
    const y = radius * Math.sin(angleRad + phase);
    this.setCamera({
      eye: { x, y, z: height },
      up: { x: 0, y: 0, z: 1 },
      center: { x: 0, y: 0, z: 0 },
    });
  }

  public render(weights: ScoreWeights, modelsList: Model[], options?: import("./stage-api").StageRenderOptions) {
    if (options?.presentationMode) this.presentationMode = options.presentationMode;
    // Plotly fallback keeps the product default axes; remapping is Three-primary.
    void options;
    void this.renderWithPlotly(weights, modelsList);
  }

  private async renderWithPlotly(weights: ScoreWeights, modelsList: Model[]) {
    const Plotly = await loadPlotly();
    const gen = ++this.renderGen;
    const mapping = DEFAULT_AXIS_MAPPING;
    const scorable = modelsList.filter((m) => isScorable(m) && hasMappedAxes(m, mapping));
    const frontierModels = frontier(modelsList);
    const scores = normalizedScores(modelsList, weights, modelsList);
    const optimumScore = weightedOptimum(scores);
    const optimumModel = optimumScore?.model;

    const containerWidth = this.container.clientWidth;
    const narrow = containerWidth > 0 && containerWidth < Stage3D.NARROW_PX;
    const costDomain = buildAxisDomain("blended_price", scorable, { narrow });
    const intelDomain = buildAxisDomain("intelligence", scorable, { narrow });
    const speedDomain = buildAxisDomain("tps", scorable, { narrow });
    this.priceFloor = costDomain.floor;
    const markerDensity = densityMarkerScale(scorable.length);

    // Build lists for Scatter3D points
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];
    const colors: string[] = [];
    const accents: string[] = [];
    const sizes: number[] = [];
    const symbols: Plotly3dSymbol[] = [];
    const textLabels: string[] = [];
    const frontierIds = new Set(frontierModels.map((model) => model.model));

    scorable.forEach((model) => {
      const isOptimum = Boolean(optimumModel && model.model === optimumModel.model);
      const isFrontier = frontierModels.some((fm) => fm.model === model.model);
      const semanticClass: SemanticPointClass = isOptimum
        ? "optimum"
        : isFrontier
          ? "frontier"
          : "dominated";

      // Axis mapping (locked by Simon 2026-08-02): x = COST, y = INTELLIGENCE, z = SPEED.
      const price =
        model.blended_price_per_M! <= 0 ? this.priceFloor : model.blended_price_per_M!;
      x.push(price);
      y.push(model.aa_intelligence_index!);
      z.push(model.tps!);

      // Glyph = openness × reasoning only (lab is color; optimum is gold+size).
      symbols.push(markChannels(model).plotlySymbol);

      const score = scores.find((candidate) => candidate.model.model === model.model)?.score ?? 0;
      const enc = pointEncoding({
        openness: model.openness,
        semanticClass,
        score,
        heatEncoding: this.heatEncoding,
        presentationMode: this.presentationMode,
        familyId: familyIdOf(model),
        singleton: isSingleton(model, scorable, familyIdOf),
        provider: model.provider,
        palette: {
          slateCyan: this.tokens.slateCyan,
          filamentDim: this.tokens.filamentDim,
          filament: this.tokens.filament,
          copper: "#C47A3A",
          gold: "#F4D58A",
        },
      });
      colors.push(enc.fill);
      accents.push(enc.accent);

      // Size = value-score (enc.sizeScale) + hierarchy floors for frontier/optimum.
      let size = Math.max(4, Math.round(8 * enc.sizeScale));
      if (isOptimum) size = Math.max(size, 16);
      else if (isFrontier) size = Math.max(size, 11);
      size = Math.max(3, Math.round(size * (isOptimum ? Math.max(markerDensity, 0.85) : markerDensity)));
      sizes.push(size);

      textLabels.push(model.model);
    });

    // Trace 0: Scorable models as points.
    // Pass *copies* into Plotly — gl3d can empty/replace per-point arrays in place.
    const pointsTrace = {
      type: "scatter3d",
      mode: "markers",
      x: x.slice(),
      y: y.slice(),
      z: z.slice(),
      text: textLabels.slice(),
      marker: {
        // Always re-apply AA/heat colors + sizes. Omitting them after first paint
        // left Plotly without per-point arrays when sweep restyle lagged (Playwright flake).
        color: colors.slice(),
        size: sizes.slice(),
        symbol: symbols.slice(),
        // Brand secondary as outline so two-color labs stay unique.
        line: { color: accents.slice(), width: 1.5 },
      },
      hoverinfo: "none",
    };

    // Trace 1: Pareto ridge polyline
    const vertices = ridgeOrder(frontierModels);
    const ridgeX = vertices.map((v) =>
      v.model.blended_price_per_M! <= 0 ? this.priceFloor : v.model.blended_price_per_M!
    );
    const ridgeY = vertices.map((v) => v.model.aa_intelligence_index!);
    const ridgeZ = vertices.map((v) => v.model.tps!);

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

    // De-chromed axis config. Speed and cost stay LOG (heavy-tailed). Intelligence
    // is LINEAR data min–max (frontier-math §3.3) — logging AA Index would distort.
    // Domains come from buildAxisDomain over the visible set (same as Three stage).
    // FIX-D (#29): narrow-stage axis legibility (see NARROW_PX).
    const axisTitleSize = narrow ? 10 : 11;
    const axisTickSize = 10;
    const pickTicks = (domain: { ticks: Array<{ value: number; label: string }>; title: string }, shortTitle: string) => {
      let ticks = domain.ticks;
      // On a narrow stage the three axes converge at one corner — keep fewer labels.
      if (narrow && ticks.length > 3) {
        ticks = [ticks[0], ticks[Math.floor(ticks.length / 2)], ticks[ticks.length - 1]];
      } else if (narrow && ticks.length > 2) {
        ticks = [ticks[Math.floor(ticks.length / 2)], ticks[ticks.length - 1]];
      }
      return {
        title: narrow ? shortTitle : domain.title,
        ticks: ticks.map((t) => t.value),
        labels: ticks.map((t) => t.label),
      };
    };
    const axisCfg = {
      cost: pickTicks(costDomain, "COST"),
      intelligence: pickTicks(intelDomain, "INTEL"),
      speed: pickTicks(speedDomain, "SPEED"),
    };

    const axisLayout = (
      titleText: string,
      tickvals: number[],
      ticktext: string[],
      scale: "log" | "linear" = "log",
      range?: [number, number],
    ) => ({
      type: scale,
      ...(range ? { range, autorange: false as const } : {}),
      visible: true,
      // Grid only — never filled axis planes. Plotly gl3d ignores/wipes alpha on
      // backgroundcolor and paints solid cream (visual regression #40 residual).
      showgrid: true,
      gridcolor: this.colorWithAlpha(this.tokens.textWarm, 0.10),
      gridwidth: 1,
      zeroline: false,
      showline: true,
      linecolor: this.colorWithAlpha(this.tokens.textWarm, 0.28),
      showbackground: false,
      showspikes: false,
      tickmode: "array",
      tickvals,
      ticktext,
      tickfont: {
        family: this.tokens.fontMono,
        size: axisTickSize,
        color: this.tokens.textMuted,
      },
      title: {
        text: titleText,
        font: {
          family: this.tokens.fontMono,
          size: axisTitleSize,
          color: this.tokens.textWarm,
        },
      },
    });

    const layout = {
      paper_bgcolor: this.tokens.inkField,
      plot_bgcolor: this.tokens.inkField,
      // FIX-D (#29): margin stays flush (0) at every width — an earlier 8px inset
      // was tried to reclaim title clipping but did not help (titles are fixed by
      // shortening), and insetting only shrinks the 3D scene and worsens
      // point-cloud overlap with the back-face axes on a small canvas.
      margin: { l: 0, r: 0, t: 0, b: 0 },
      showlegend: false,
      uirevision: "constant_camera",
      scene: {
        uirevision: "constant_camera",
        aspectmode: "manual",
        aspectratio: { x: 1.15, y: 1, z: 1 },
        // Explicit ascending ranges from the shared domain builder so Plotly and
        // Three stages stay aligned (data-fit cost/speed log + intelligence linear).
        xaxis: axisLayout(
          axisCfg.cost.title,
          axisCfg.cost.ticks,
          axisCfg.cost.labels,
          "log",
          [Math.log10(costDomain.min), Math.log10(costDomain.max)],
        ),
        yaxis: axisLayout(
          axisCfg.intelligence.title,
          axisCfg.intelligence.ticks,
          axisCfg.intelligence.labels,
          "linear",
          [intelDomain.min, intelDomain.max],
        ),
        zaxis: axisLayout(
          axisCfg.speed.title,
          axisCfg.speed.ticks,
          axisCfg.speed.labels,
          "log",
          [Math.log10(speedDomain.min), Math.log10(speedDomain.max)],
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
      // FIX-D (#29): de-chrome parity — suppress the "Double-click to zoom back
      // out" notifier tip on the 3D stage too (same showTips-gated chrome class
      // as the 2D projections; it leaks here on a 3D double-click-reset).
      showTips: false,
    };

    const publishViz = () => {
      if (gen !== this.renderGen) return;
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

      // Always publish intentional marker arrays for QA (gl3d data[] can drop them).
      const prev = (window as any).__viz ?? {};
      (window as any).__viz = {
        ...prev,
        modelIndexToPointNumber,
        pointNumberToModelIndex,
        pointNumberToModelId,
        modelIdToPointNumber,
        scorableModels: scorable,
        markGlyphLegend: ["circle", "circle-open", "diamond", "diamond-open"],
        frontierModelIds: frontierModels.map((model) => model.model),
        scoreByModel: Object.fromEntries(scores.map((entry) => [entry.model.model, entry.score])),
        heatEncoding: this.heatEncoding,
        gd: this.gd,
        priceFloor: this.priceFloor,
        Plotly,
        markerColors: colors.slice(),
        markerSizes: sizes.slice(),
        markerSymbols: symbols.slice(),
      };
    };

    const applyMarkers = async () => {
      if (gen !== this.renderGen) return;
      // gl3d can drop per-point marker arrays; re-assert after plot and mirror on __viz.
      // Copies so Plotly cannot empty the intentional arrays we keep for QA.
      const colorCopy = colors.slice();
      const sizeCopy = sizes.slice();
      await Plotly.restyle(this.gd, { "marker.color": [colorCopy], "marker.size": [sizeCopy] }, [0]);
      publishViz();
    };

    if (!this.isInitialized) {
      if (gen !== this.renderGen) return;
      const plotReady = Plotly.newPlot(this.gd, [pointsTrace, ridgeTrace], layout as any, config);
      this.isInitialized = true;
      void plotReady.then(async () => {
        this.setupPlotlyListeners();
        await applyMarkers();
      });
    } else {
      if (gen !== this.renderGen) return;
      void Plotly.react(this.gd, [pointsTrace, ridgeTrace], layout as any, config).then(applyMarkers);
    }

    // Publish immediately with intentional arrays so tests don't race plotReady.
    publishViz();
  }

  private setupPlotlyListeners() {
    const on = (this.gd as any).on;
    if (typeof on !== "function") return;

    on.call(this.gd, "plotly_webglcontextlost", () => {
      this.showReloadPrompt();
    });
    // Bridge gl3d hover into the Stage API's stage:hover CustomEvent (same as
    // Stage3DThree). Main + projections listen on that event. Registering here
    // (after first newPlot) avoids the race where main attaches plotly_hover
    // before newPlot and Plotly drops those listeners on first paint.
    on.call(this.gd, "plotly_hover", (event: any) => {
      const point = event?.points?.[0];
      const text = point?.data?.text ?? point?.fullData?.text;
      const modelId = Array.isArray(text) ? text[point?.pointNumber] : null;
      this.gd.dispatchEvent(
        new CustomEvent("stage:hover", {
          detail: { modelId: typeof modelId === "string" ? modelId : null },
          bubbles: true,
        }),
      );
    });
    on.call(this.gd, "plotly_unhover", () => {
      this.gd.dispatchEvent(
        new CustomEvent("stage:hover", { detail: { modelId: null }, bubbles: true }),
      );
    });
    on.call(this.gd, "plotly_relayout", (eventData: any) => {
      // FIX-D (#29) review: Plotly emits camera drags in three shapes — the full
      // `scene.camera` object, partial objects (`scene.camera.eye`), and fully
      // flattened per-component keys (`scene.camera.eye.z`). The first two were
      // already clamped, but the flattened shape (verified live: a tilt pushed
      // eye.z to -5) fell through `updated === false` and never reached the clamp.
      // Merge every dotted camera key present — partial OR flattened — so all
      // three shapes converge on clampCameraEye.
      let updated = false;
      if (eventData["scene.camera"]) {
        this.camera = eventData["scene.camera"];
        updated = true;
      }
      const dotted = Object.keys(eventData).filter((k) =>
        k.startsWith("scene.camera."),
      );
      if (dotted.length) {
        const newCamera = { ...this.camera };
        for (const key of dotted) {
          updated = true;
          // "scene.camera.eye.z" → ["eye","z"]; "scene.camera.eye" → ["eye"].
          const parts = key.slice("scene.camera.".length).split(".");
          let node: any = newCamera;
          for (let i = 0; i < parts.length - 1; i++) {
            const k = parts[i];
            node[k] = { ...(node[k] || {}) };
            node = node[k];
          }
          node[parts[parts.length - 1]] = eventData[key];
        }
        this.camera = newCamera;
      }
      // FIX-D (#29): a normal orbit drag can push eye.z at/below the stage plane
      // (eye.z < floor), flipping the view and clipping/rotating axis labels.
      // Clamp and re-apply so the camera can never cross the horizon. The
      // corrective relayout re-emits plotly_relayout, but with eye.z already at
      // the floor the next read-back is a no-op, so it converges; the in-flight
      // guard is belt-and-suspenders against any re-entrant scheduling.
      if (updated && this.clampCameraEye() && !this.relayoutClampInFlight) {
        this.relayoutClampInFlight = true;
        void loadPlotly().then((Plotly) => Plotly.relayout(this.gd, { "scene.camera": this.camera })).then(
          () => { this.relayoutClampInFlight = false; },
        );
      }
    });
  }
}
