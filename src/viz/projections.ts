import * as Plotly from "plotly.js-dist-min";
import { Model, isScorable, PROVIDER_SHAPES, Plotly3dSymbol } from "../data/models";
import { ScoreWeights, normalizedScores, weightedOptimum } from "../lib/score";
import { frontier } from "../lib/pareto";
import { dominatedFill } from "./palette";

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

/** One of the stage's three axes; each projection picks two. */
type AxisKind = "tps" | "cost" | "intelligence";

/** The three orthogonal 2D projections of the SPEED × COST × INTELLIGENCE stage. */
type ProjectionKind = "tps-intelligence" | "tps-cost" | "cost-intelligence";

/** A graph host after Plotly has attached its runtime graph properties. */
type PlotlyGraphDiv = HTMLDivElement & { data?: unknown };

interface ProjectionSpec {
  kind: ProjectionKind;
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
  private readonly specs: ProjectionSpec[];
  private initialized = false;
  private priceFloor = 0.08125;
  /** Incremented every render so Plotly.react never silently skips a data diff. */
  private datarevision = 0;
  /** True while either direction of a coupling fan-out is driving Fx.hover. */
  private isProgrammatic = false;
  private coupled = false;

  constructor(containers: HTMLElement[], stageGd: HTMLDivElement) {
    this.containers = containers;
    this.stageGd = stageGd;
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

    this.specs = [
      { kind: "tps-intelligence", x: "tps", y: "intelligence" },
      { kind: "tps-cost", x: "tps", y: "cost" },
      { kind: "cost-intelligence", x: "cost", y: "intelligence" },
    ];

    this.buildGraphDivs();
  }

  /** Materialise one plot div per projection container, in spec order. */
  private buildGraphDivs() {
    this.gds.length = 0;
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

  /** ε floor = half the smallest positive blended price, identical to the stage. */
  private computePriceFloor(scorable: Model[]): number {
    const positive = scorable.map((m) => m.blended_price_per_M!).filter((p) => p > 0);
    return positive.length > 0 ? Math.min(...positive) / 2 : 0.08125;
  }

  /** Coordinates for one projection, ε-clamping cost exactly as the stage does. */
  private axisValue(kind: AxisKind, model: Model): number {
    switch (kind) {
      case "tps":
        return model.tps!;
      case "intelligence":
        return model.aa_intelligence_index!;
      case "cost":
        return model.blended_price_per_M! <= 0 ? this.priceFloor : model.blended_price_per_M!;
    }
  }

  /**
   * Per-point marker encoding mirrored from `stage3d.ts`: provider glyph base,
   * filament optimum (size + distinct symbol), filament-dim frontier, slate-cyan
   * subtraction for dominated points. Kept in sync so the projections read as
   * the same instrument as the stage.
   */
  private pointStyle(
    model: Model,
    isOptimum: boolean,
    isFrontier: boolean,
    otherFrontierSymbols: Set<Plotly3dSymbol>,
  ): { color: string; size: number; symbol: Plotly3dSymbol } {
    const baseSymbol = PROVIDER_SHAPES[model.provider] || "circle";
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
    let symbol = baseSymbol;
    if (isOptimum) {
      symbol =
        symbolCandidates.find(
          (candidate) => candidate !== baseSymbol && !otherFrontierSymbols.has(candidate),
        ) ?? (baseSymbol === "diamond" ? "circle" : "diamond");
    }

    let color = dominatedFill(this.tokens.slateCyan);
    if (isOptimum) color = this.tokens.filament;
    else if (isFrontier) color = this.tokens.filamentDim;

    let size = 7;
    if (isOptimum) size = 16;
    else if (isFrontier) size = 10;

    return { color, size, symbol };
  }

  private axisLayout(kind: AxisKind): Record<string, unknown> {
    let titleText: string;
    let tickvals: number[];
    let ticktext: string[];
    // Intelligence is LINEAR on its native 0–100 index (frontier-math §3.3 —
    // "logging it would distort"); speed + cost stay log, matching the stage.
    let scale: "log" | "linear" = "log";
    let range: [number, number] | undefined;
    switch (kind) {
      case "tps":
        titleText = "SPEED (TPS)";
        tickvals = [10, 100, 1000];
        ticktext = ["10", "100", "1000"];
        break;
      case "intelligence":
        titleText = "INTELLIGENCE (INDEX)";
        tickvals = [0, 20, 40, 60, 80, 100];
        ticktext = ["0", "20", "40", "60", "80", "100"];
        scale = "linear";
        range = [0, 100];
        break;
      case "cost":
        titleText = "COST ($/M)";
        // The single ε "≤ floor" tick mirrors the stage's cost axis.
        tickvals = [this.priceFloor, 0.1, 1, 10, 100];
        ticktext = ["≤ floor", "0.1", "1", "10", "100"];
        break;
    }
    return {
      type: scale,
      ...(range ? { range, autorange: false } : {}),
      showgrid: false,
      zeroline: false,
      showline: true,
      linecolor: this.colorWithAlpha(this.tokens.textWarm, 0.15),
      ticks: "outside",
      ticklen: 4,
      tickwidth: 1,
      tickcolor: this.colorWithAlpha(this.tokens.textWarm, 0.15),
      tickmode: "array",
      tickvals,
      ticktext,
      tickfont: {
        family: this.tokens.fontMono,
        size: 9,
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

  render(weights: ScoreWeights, modelsList: Model[]): void {
    const scorable = modelsList.filter(isScorable);
    const frontierModels = frontier(modelsList);
    const scores = normalizedScores(modelsList, weights, modelsList);
    const optimumModel = weightedOptimum(scores)?.model;
    const frontierIds = new Set(frontierModels.map((model) => model.model));
    this.priceFloor = this.computePriceFloor(scorable);
    const otherFrontierSymbols = new Set<Plotly3dSymbol>(
      scorable
        .filter((model) => frontierIds.has(model.model) && model.model !== optimumModel?.model)
        .map((model) => PROVIDER_SHAPES[model.provider] || "circle"),
    );

    const traces = this.specs.map((spec) => {
      const x: number[] = [];
      const y: number[] = [];
      const text: string[] = [];
      const colors: string[] = [];
      const sizes: number[] = [];
      const symbols: Plotly3dSymbol[] = [];
      scorable.forEach((model) => {
        x.push(this.axisValue(spec.x, model));
        y.push(this.axisValue(spec.y, model));
        text.push(model.model);
        const style = this.pointStyle(
          model,
          Boolean(optimumModel && model.model === optimumModel.model),
          frontierIds.has(model.model),
          otherFrontierSymbols,
        );
        colors.push(style.color);
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
          line: { color: this.tokens.inkField, width: 1 },
        },
      };
    });

    this.datarevision += 1;
    const config = { displayModeBar: false, displaylogo: false, responsive: true };

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
        xaxis: this.axisLayout(spec.x),
        yaxis: this.axisLayout(spec.y),
      };
      if (!this.initialized || gd.data === undefined) {
        Plotly.newPlot(gd, [traces[index]], layout as any, config);
      } else {
        Plotly.react(gd, [traces[index]], layout as any, config);
      }
    });
    this.initialized = true;

    // Coupling listeners attach once, after the first plot exists.
    this.attachCoupling();

    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      const viz = (window as any).__viz ?? {};
      viz.projections = {
        gds: this.gds,
        stageGd: this.stageGd,
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
      this.programmaticHover(this.stageGd, modelId, "scene");
      this.gds.forEach((gd) => this.programmaticHover(gd, modelId, "xy"));
    } finally {
      this.isProgrammatic = previous;
    }
  }

  private programmaticHover(gd: HTMLDivElement, modelId: string, subplot: string): void {
    const pointNumber = pointNumberForModelId(gd, modelId);
    if (pointNumber === null) return; // model not present on this view
    try {
      Plotly.Fx.hover(gd, [{ curveNumber: 0, pointNumber }], subplot);
    } catch {
      // Programmatic hover on a de-chromed plot (hoverinfo 'none') is
      // best-effort; the coupling contract is the Fx.hover call by model id.
      // Swallow so a no-op never breaks coupling.
    }
  }
}
