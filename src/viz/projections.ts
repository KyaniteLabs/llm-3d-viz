import { loadPlotly, type PlotlyModule } from "./plotly-loader";
import { Model, isScorable, Plotly3dSymbol } from "../data/models";
import { ScoreWeights, normalizedScores, weightedOptimum } from "../lib/score";
import { frontier } from "../lib/pareto";
import { isSingleton, pointEncoding, type PresentationMode, type SemanticPointClass } from "./palette";
import { markChannels } from "./mark-encoding";
import { familyIdOf } from "../lib/family";
import {
  DEFAULT_AXIS_MAPPING,
  buildAxisDomain,
  densityMarkerScale,
  getAxisMetric,
  normalizeAxisMapping,
  type AxisDomain,
  type AxisMapping,
  type AxisMetricId,
} from "../lib/axis-metrics";
import type { StageRenderOptions } from "./stage-api";

// Fallbacks mirror the DESIGN-SYSTEM.md token block, the visual source of truth.
// Kept identical to stage3d.ts so both views resolve the same palette when a
// custom property is missing.
const DESIGN_SYSTEM_TOKEN_FALLBACKS = {
  filament: "#E8F1E4",
  filamentDim: "#C9D4C4",
  slateCyan: "#3D5560",
  textWarm: "#E7E2D8",
  textMuted: "#89939E",
  inkField: "#070C0B",
  fontMono: '"IBM Plex Mono", "Geist Mono", ui-monospace, monospace',
} as const;

/** A stage-axis metric id; each projection plots two of the active three. */
type AxisKind = AxisMetricId;

/** A graph host after Plotly has attached its runtime graph properties. */
type PlotlyGraphDiv = HTMLDivElement & { data?: unknown };

interface ProjectionSpec {
  /** Stable key for CSS class + uirevision (`${x}--${y}`). */
  kind: string;
  x: AxisKind;
  y: AxisKind;
}

/**
 * Read the model id a hover point refers to, from the trace-carried `text`
 * label — the same production-safe identity T5's console uses (point.data.text).
 * Identity-stable: independent of where the point sits in any view's array.
 */
function modelIdFromPoint(point: any): string | null {
  const text = point?.data?.text ?? point?.fullData?.text;
  const id = Array.isArray(text) ? text[point?.pointNumber] : null;
  return typeof id === "string" ? id : null;
}

/** Resolve a model id to a view's pointNumber via that view's own `text` array. */
function pointNumberForModelId(gd: HTMLDivElement, modelId: string): number | null {
  const text = (gd as any).data?.[0]?.text;
  if (!Array.isArray(text)) return null;
  const idx = text.indexOf(modelId);
  return idx === -1 ? null : idx;
}

/**
 * Linked 2D projections of the model universe.
 *
 * Visual language is lifted directly from `stage3d.ts` (de-chromed Plotly as a
 * render engine only: no modebar, no default grid/tick styling, hoverinfo
 * 'none' so events still fire without Plotly's native hover card). Log axes are
 * used wherever the stage uses them (TPS, cost, and intelligence), and the two
 * $0.00 models land on the same ε price floor as the stage's cost axis.
 *
 * Coupling is bidirectional and keyed by MODEL ID, not by point position: a hover
 * on any of the four views (the three projections plus the stage) reads the
 * hovered point's trace-carried `text` label (the model id) and fans a
 * programmatic `Plotly.Fx.hover` out to the other three, resolving the model id
 * to each target view's own pointNumber via that view's `text` array. Keying by
 * model id keeps the coupling correct even if a stage-only or projection-only
 * re-render ever changes point order — the four views need not share an index.
 * An `isProgrammatic` guard suppresses re-entry — a programmatic hover never
 * re-triggers the fan-out, so the loop cannot chase itself.
 */
export class Projections {
  private readonly containers: HTMLElement[];
  private readonly stageGd: HTMLDivElement;
  private readonly tokens: {
    filament: string;
    filamentDim: string;
    slateCyan: string;
    textWarm: string;
    textMuted: string;
    inkField: string;
    fontMono: string;
  };
  /** One graph div per projection, in `ProjectionSpec` order. */
  public readonly gds: PlotlyGraphDiv[] = [];
  // V05: active axis mapping threaded in via render(); the three orthogonal
  // 2D specs are derived from its X/Y/Z instead of hard-coded tps/cost/intelligence.
  private axisMapping: AxisMapping = { ...DEFAULT_AXIS_MAPPING };
  private specs: ProjectionSpec[] = [];
  private initialized = false;
  private presentationMode: PresentationMode = "curve";
  private readonly heatEncoding: boolean;
  private priceFloor = 0.08125;
  /**
   * Shared domain builder snapshots for the current visible set (stage parity).
   * V05: keyed by the active metric ids (the three mapped axes), not a fixed
   * tps/cost/intelligence triple.
   */
  private domains: Record<string, AxisDomain> = {};
  /** Incremented every render so Plotly.react never silently skips a data diff. */
  private datarevision = 0;
  /** True while either direction of a coupling fan-out is driving Fx.hover. */
  private isProgrammatic = false;
  private coupled = false;
  private renderGen = 0;
  // V03: retain the resolved Plotly module so destroy() can purge owned graphs
  // without relying on window.Plotly (never set in the bundled path).
  private plotly: PlotlyModule | null = null;
  // V04: terminal flag so a render waiting on the lazy import cannot resurrect a
  // destroyed instance after teardown.
  private destroyed = false;
  private destroyFn: (() => void) | null = null;

  constructor(containers: HTMLElement[], stageGd: HTMLDivElement, heatEncoding = true) {
    this.containers = containers;
    this.stageGd = stageGd;
    this.heatEncoding = heatEncoding;
    const styles = getComputedStyle(document.documentElement);
    const resolveToken = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    // V01: color tokens serialize as color(display-p3 …) on wide-gamut browsers,
    // and Plotly's legacy parser (and this class's own colorWithAlpha) cannot
    // consume that syntax — it falls through to invalid/white (the projection
    // whiteout). Route the six color tokens through a 2D canvas so we always
    // hand Plotly browser-converted sRGB bytes (same implementation as
    // stage3d.ts / stage3d-three.ts). Plain resolveToken stays for --font-mono.
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

    this.specs = this.computeSpecs(this.axisMapping);
    this.updateEyebrows();
    this.buildGraphDivs();
  }

  /** P3-2: sync the static eyebrow labels to the active axis mapping. */
  private updateEyebrows(): void {
    this.specs.forEach((spec, i) => {
      const container = this.containers[i];
      if (!container) return;
      const eyebrow = container.querySelector<HTMLElement>(".eyebrow");
      if (!eyebrow) return;
      const shortX = getAxisMetric(spec.x).title.split(" (")[0];
      const shortY = getAxisMetric(spec.y).title.split(" (")[0];
      eyebrow.textContent = `${shortX} / ${shortY}`;
    });
  }

  /**
   * V05: derive the three orthogonal 2D projection specs (the X/Y, X/Z and Y/Z
   * faces) from the active axis mapping, instead of a fixed
   * tps/cost/intelligence triple. Each face's metrics follow the live controls.
   */
  private computeSpecs(mapping: AxisMapping): ProjectionSpec[] {
    // Face order (z,y), (z,x), (x,y) reproduces the original rate-basis panel
    // order so the static HTML eyebrows (SPEED/INTEL, SPEED/COST, COST/INTEL)
    // keep matching the default mapping; non-default mappings follow the live axes.
    return [
      { kind: `${mapping.z}--${mapping.y}`, x: mapping.z, y: mapping.y },
      { kind: `${mapping.z}--${mapping.x}`, x: mapping.z, y: mapping.x },
      { kind: `${mapping.x}--${mapping.y}`, x: mapping.x, y: mapping.y },
    ];
  }

  /** Materialise one plot div per projection container, in spec order. */
  private buildGraphDivs() {
    this.gds.length = 0;
    // V05: divs are face slots (X/Y, X/Z, Y/Z); the metrics plotted into each
    // follow the active mapping, recomputed every render.
    this.specs.forEach((spec, index) => {
      const container = this.containers[index];
      if (!container) return;
      // Preserve the existing eyebrow label; the plot fills the remaining space.
      const gd = document.createElement("div");
      gd.className = `projection-plot projection-plot--${spec.kind}`;
      gd.dataset.projectionKind = spec.kind;
      gd.style.width = "100%";
      gd.style.flex = "1 1 auto";
      gd.style.minHeight = "140px";
      container.appendChild(gd);
      // Plotly adds `data` to the graph host when it initializes the plot.
      this.gds.push(gd as PlotlyGraphDiv);
    });
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

  /**
   * Coordinates for one projection axis (V05). Resolves the active metric via
   * getAxisMetric and ε-clamps log axes to the domain floor (same as the stage),
   * so a remapped projection plots the correct metric instead of a fixed
   * cost/intelligence/speed field. Returns null for missing/non-finite values.
   */
  private axisValue(kind: AxisKind, model: Model): number | null {
    const v = getAxisMetric(kind).getValue(model);
    if (v === null || !Number.isFinite(v)) return null;
    const domain = this.domains[kind];
    if (domain && domain.scale === "log") {
      return v <= 0 ? domain.floor : Math.max(v, domain.floor);
    }
    return v;
  }

  /**
   * Per-point marker encoding mirrored from the 3D stage:
   * color = lab/family, glyph = openness×reasoning, size = value-score.
   */
  private pointStyle(
    model: Model,
    isOptimum: boolean,
    isFrontier: boolean,
    _otherFrontierSymbols: Set<Plotly3dSymbol>,
    score: number,
    visible: readonly Model[],
  ): { color: string; accent: string; core: string; size: number; symbol: Plotly3dSymbol } {
    const symbol = markChannels(model).plotlySymbol;

    const semanticClass: SemanticPointClass = isOptimum
      ? "optimum"
      : isFrontier
        ? "frontier"
        : "dominated";
    const enc = pointEncoding({
      openness: model.openness,
      semanticClass,
      score,
      heatEncoding: this.heatEncoding,
      presentationMode: this.presentationMode,
      familyId: familyIdOf(model),
      singleton: isSingleton(model, visible, familyIdOf),
      provider: model.provider,
      modelId: model.model,
      palette: {
        slateCyan: this.tokens.slateCyan,
        filamentDim: this.tokens.filamentDim,
        filament: this.tokens.filament,
        copper: "#C47A3A",
        gold: "#F4D58A",
      },
    });

    // Size = value-score (enc.sizeScale) + hierarchy floors.
    let size = Math.max(4, Math.round(8 * enc.sizeScale));
    if (isOptimum) size = Math.max(size, 16);
    else if (isFrontier) size = Math.max(size, 11);
    const density = densityMarkerScale(visible.length);
    size = Math.max(3, Math.round(size * (isOptimum ? Math.max(density, 0.85) : density)));

    return { color: enc.fill, accent: enc.accent, core: enc.core, size, symbol };
  }

  setPresentationMode(mode: PresentationMode) {
    this.presentationMode = mode;
  }

  private axisLayout(kind: AxisKind, gd?: HTMLDivElement, isX = false): Record<string, unknown> {
    // V05: scale/labels/title follow the active metric's domain (buildAxisDomain),
    // not a hard-coded intelligence=linear / else=log guess.
    const domain = this.domains[kind];
    if (!domain) {
      // Pre-first-render fallback (should not paint).
      const def = getAxisMetric(kind);
      return { type: def.scale, automargin: true };
    }
    const scale = domain.scale;
    const range: [number, number] =
      scale === "log"
        ? [Math.log10(domain.min), Math.log10(domain.max)]
        : [domain.min, domain.max];
    // F3: title is the single source of truth from buildAxisDomain (already decorated
    // with ' · log' for log axes) — no duplicate kind→label ternary here.
    const titleText = domain.title;
    // S+ iteration-4 (2026-08-16): Plotly paints every tick we hand it, and on
    // ~315×80px panels the shared domain tick set collides — measured on the
    // deployed build: endpoint-vs-nice "29"/"30" (121px²), duplicate floor
    // "0.1"/"0.1" (258px²), "60"/"65", "5"/"10". Gate ticks in pixel space with
    // the same keep-first NMS the 3D stage uses for its R4 tick dedup; the first
    // (lowest) tick always keeps, so an axis is never emptied.
    const isXAxis = isX;
    let tickvals: number[];
    let ticktext: string[];
    const usablePx = gd
      ? Math.max(60, isXAxis ? gd.clientWidth - 54 : gd.clientHeight - 48)
      : 0;
    if (gd && usablePx > 60) {
      const pos = (v: number) =>
        (scale === "log"
          ? (Math.log10(Math.max(v, domain.floor)) - Math.log10(domain.min)) /
            (Math.log10(domain.max) - Math.log10(domain.min))
          : (v - domain.min) / (domain.max - domain.min)) * usablePx;
      // 10px mono ≈ 6.2px/char + pad; y labels are 13px tall + 6px pad.
      const clearance = (label: string) => (isXAxis ? label.length * 6.2 + 8 : 19);
      tickvals = [];
      ticktext = [];
      let lastPos: number | null = null;
      for (const tick of domain.ticks) {
        const p = pos(tick.value);
        if (lastPos !== null && Math.abs(p - lastPos) < clearance(tick.label)) continue;
        tickvals.push(tick.value);
        ticktext.push(tick.label);
        lastPos = p;
      }
    } else {
      tickvals = domain.ticks.map((t) => t.value);
      ticktext = domain.ticks.map((t) => t.label);
    }
    return {
      type: scale,
      range,
      autorange: false,
      showgrid: true,
      gridcolor: this.colorWithAlpha(this.tokens.textWarm, 0.06),
      zeroline: false,
      showline: true,
      linecolor: this.colorWithAlpha(this.tokens.textWarm, 0.22),
      ticks: "outside",
      ticklen: 4,
      tickwidth: 1,
      tickcolor: this.colorWithAlpha(this.tokens.textWarm, 0.15),
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
          size: 10,
          color: this.tokens.textWarm,
        },
      },
      automargin: true,
    };
  }

  render(weights: ScoreWeights, modelsList: Model[], options?: StageRenderOptions): void {
    void this.renderWithPlotly(weights, modelsList, options);
  }

  private async renderWithPlotly(weights: ScoreWeights, modelsList: Model[], options?: StageRenderOptions): Promise<void> {
    // V04: capture the generation BEFORE the first await so a destroy() issued
    // while the lazy import is in flight cannot let this continuation resurrect
    // a torn-down instance.
    const gen = ++this.renderGen;
    if (this.destroyed) return;
    const Plotly = await loadPlotly();
    // Recheck after the await: destroy() may have run (bumped the gen / set the
    // terminal flag) while we were waiting on the chunk.
    if (this.destroyed || gen !== this.renderGen) return;
    this.plotly = Plotly;
    // V05: derive the active mapping from options, or fall back to the mapping
    // main.ts publishes to window.__viz.axisMapping (main.ts owns the render
    // callsite and does not pass options here yet). Defaults to the rate basis.
    const published = (typeof window !== "undefined"
      ? (window as any).__viz?.axisMapping
      : undefined) as AxisMapping | undefined;
    const mapping = normalizeAxisMapping(options?.axisMapping ?? published ?? this.axisMapping);
    const mappingChanged = mapping.x !== this.axisMapping.x || mapping.y !== this.axisMapping.y || mapping.z !== this.axisMapping.z;
    this.axisMapping = mapping;
    if (mappingChanged) {
      this.specs = this.computeSpecs(mapping);
      // A new mapping means a new set of faces — drop cached graph state so the
      // next pass takes the newPlot path instead of react-ing over stale traces.
      this.initialized = false;
      this.updateEyebrows();
    }
    const scorable = modelsList.filter(isScorable);
    const frontierModels = frontier(modelsList);
    const scores = normalizedScores(modelsList, weights, modelsList);
    const scoreById = new Map(scores.map((entry) => [entry.model.model, entry.score]));
    const optimumModel = weightedOptimum(scores)?.model;
    const frontierIds = new Set(frontierModels.map((model) => model.model));
    // V05: domains keyed by the active metric ids (not a fixed tps/cost/intel triple).
    this.domains = {
      [mapping.x]: buildAxisDomain(mapping.x, scorable),
      [mapping.y]: buildAxisDomain(mapping.y, scorable),
      [mapping.z]: buildAxisDomain(mapping.z, scorable),
    };
    this.priceFloor = this.domains[mapping.x]?.floor ?? this.priceFloor;

    const traces = this.specs.map((spec) => {
      const x: number[] = [];
      const y: number[] = [];
      const text: string[] = [];
      const colors: string[] = [];
      const accents: string[] = [];
      const sizes: number[] = [];
      const symbols: Plotly3dSymbol[] = [];
      scorable.forEach((model) => {
        // V05: axisValue now returns null for missing/non-finite mapped values;
        // skip such a row on this face so Plotly never sees a null coordinate.
        const xv = this.axisValue(spec.x, model);
        const yv = this.axisValue(spec.y, model);
        if (xv === null || yv === null) return;
        x.push(xv);
        y.push(yv);
        text.push(model.model);
        const style = this.pointStyle(
          model,
          Boolean(optimumModel && model.model === optimumModel.model),
          frontierIds.has(model.model),
          new Set(),
          scoreById.get(model.model) ?? 0,
          scorable,
        );
        colors.push(style.color);
        accents.push(style.accent);
        sizes.push(style.size);
        symbols.push(style.symbol);
      });
      return {
        type: "scatter",
        mode: "markers",
        x,
        y,
        text,
        hoverinfo: "none",
        marker: {
          ...(this.initialized ? {} : { color: colors, size: sizes }),
          symbol: symbols,
          line: { color: accents, width: 1.5 },
        },
      };
    });

    this.datarevision += 1;
    // FIX-D (#29): scrollZoom engages wheel/pinch zoom on the 2D projections.
    // showTips:false suppresses Plotly's "Double-click to zoom back out" notifier
    // tip (verified: that tip is gated by context.showTips in plotly.js 3.7.0) — a
    // de-chrome violation. uirevision (per-spec-kind, set on each layout below)
    // keeps a user's zoom across re-renders.
    const config = {
      displayModeBar: false,
      displaylogo: false,
      responsive: true,
      scrollZoom: "cartesian",
      showTips: false,
    };

    this.specs.forEach((spec, index) => {
      const gd = this.gds[index];
      if (!gd) return;
      const layout = {
        paper_bgcolor: this.tokens.inkField,
        plot_bgcolor: this.tokens.inkField,
        margin: { l: 44, r: 10, t: 8, b: 40 },
        showlegend: false,
        font: { family: this.tokens.fontMono, color: this.tokens.textWarm },
        // Pinned so a user's zoom/pan survives every re-render (Plotly.react).
        uirevision: `llm3d-proj-${spec.kind}`,
        datarevision: this.datarevision,
        hovermode: "closest",
        xaxis: this.axisLayout(spec.x, gd, true),
        yaxis: this.axisLayout(spec.y, gd, false),
      };
      if (!this.initialized || gd.data === undefined) {
        if (this.destroyed || gen !== this.renderGen) return;
        Plotly.newPlot(gd, [traces[index]], layout as any, config);
      } else {
        if (this.destroyed || gen !== this.renderGen) return;
        Plotly.react(gd, [traces[index]], layout as any, config);
      }
    });
    this.initialized = true;

    // V04: do not attach listeners / publish after teardown.
    if (this.destroyed || gen !== this.renderGen) return;
    // Coupling listeners attach once, after the first plot exists.
    this.attachCoupling();

    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      const viz = (window as any).__viz ?? {};
      viz.projections = {
        gds: this.gds,
        stageGd: this.stageGd,
        heatEncoding: this.heatEncoding,
        render: (w: ScoreWeights, m: Model[]) => this.render(w, m),
      };
      (window as any).__viz = viz;
    }
  }

  /** Register guarded bidirectional hover coupling on the stage and projections. */
  private attachCoupling(): void {
    if (this.coupled) return;
    this.coupled = true;

    const onHover = (data: any) => {
      if (this.isProgrammatic) return;
      const modelId = modelIdFromPoint(data?.points?.[0]);
      if (!modelId) return;
      this.fanOut(modelId);
    };

    this.gds.forEach((gd) => {
      const on = (gd as any).on;
      if (typeof on === "function") on.call(gd, "plotly_hover", onHover);
    });
    const stageOn = (this.stageGd as any).on;
    if (typeof stageOn === "function") stageOn.call(this.stageGd, "plotly_hover", onHover);
    // Three stage emits stage:hover with model id (no plotly_hover path).
    const onStageHover = ((event: CustomEvent<{ modelId: string | null }>) => {
      if (this.isProgrammatic) return;
      const modelId = event.detail?.modelId;
      if (!modelId) return;
      this.fanOut(modelId);
    }) as EventListener;
    this.stageGd.addEventListener("stage:hover", onStageHover);
    // Allow destroy() to tear down the DOM-level coupling listener. Plotly-level
    // plotly_hover listeners are cleaned by Plotly.purge on each graph div.
    this.destroyFn = () => {
      this.stageGd.removeEventListener("stage:hover", onStageHover);
    };
  }

  /**
   * Drive a programmatic `Fx.hover` onto every coupled view for one model id.
   * Each target view resolves the id to its own pointNumber via its `text`
   * array, so fan-out is correct even when views disagree on point order. The
   * whole batch runs under `isProgrammatic` so any `plotly_hover` emit (present
   * or future) is ignored by the listeners.
   */
  private fanOut(modelId: string): void {
    const previous = this.isProgrammatic;
    this.isProgrammatic = true;
    try {
      // Plotly stage only — Three has no Fx.hover surface; 2D still fans by id.
      if ((this.stageGd as any).__stageBackend !== "three") {
        this.programmaticHover(this.stageGd, modelId, "scene");
      }
      this.gds.forEach((gd) => this.programmaticHover(gd, modelId, "xy"));
    } finally {
      this.isProgrammatic = previous;
    }
  }

  private programmaticHover(gd: HTMLDivElement, modelId: string, subplot: string): void {
    const pointNumber = pointNumberForModelId(gd, modelId);
    if (pointNumber === null) return; // model not present on this view
    try {
      void loadPlotly().then((Plotly) => {
        Plotly.Fx.hover(gd, [{ curveNumber: 0, pointNumber }], subplot);
      }).catch(() => {
        // V13: programmatic hover is best-effort; never flood an unhandled promise.
      });
    } catch {
      // Programmatic hover on a de-chromed plot (hoverinfo 'none') is
      // best-effort; the coupling contract is the Fx.hover call by model id.
      // Swallow so a no-op never breaks coupling.
    }
  }
  destroy() {
    this.renderGen++;
    this.destroyed = true; // V04: terminal flag invalidates any in-flight import.
    // V03: purge via the retained module, not window.Plotly (never set in the
    // bundled path). V11: purge ONLY this.gds — stageGd is borrowed for hover
    // coupling and is owned by Stage3D; purging it blanks a still-live hero.
    const Plotly = this.plotly;
    if (Plotly) {
      this.gds.forEach((gd) => { try { Plotly.purge(gd); } catch {} });
    }
    this.gds.forEach((gd) => { if (gd.parentNode) gd.parentNode.removeChild(gd); });
    this.destroyFn?.();
    this.destroyFn = null;
    this.coupled = false;
  }
}
