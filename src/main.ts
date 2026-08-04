import "./styles/tokens.css";
import { models } from "./data/models";
import { sameAxisMapping, type AxisMapping } from "./lib/axis-metrics";
import { applyFilters, sameFilters, type ModelFilters } from "./lib/filters";
import { Stage3DThree } from "./viz/stage3d-three";
import type { Stage3DSurface } from "./viz/stage-api";
import { createStore, type AppState } from "./state";
import { DecisionConsole } from "./ui/console";
import { CinemaMode } from "./viz/cinema";
import { StageGuide } from "./ui/stage-guide";

// Trace-carried `text` labels hold the model ID (see stage3d.ts / projections.ts),
// so a hover point resolves to a stable model identity regardless of point order.
function modelIdFromPlotlyPoint(point: any): string | null {
  const text = point?.data?.text ?? point?.fullData?.text;
  const modelId = Array.isArray(text) ? text[point?.pointNumber] : null;
  return typeof modelId === "string" ? modelId : null;
}

document.documentElement.dataset.modelCount = String(models.length);
const searchParams = new URLSearchParams(window.location.search);
// AA-density default: openness fill primary; score heat is diagnostic opt-in only.
const heatEncoding = searchParams.get("heat") === "1";
// Spike default: Three hero. Opt out: ?stage=plotly
const stageBackend = searchParams.get("stage") === "plotly" ? "plotly" : "r3f";
const debugStage = searchParams.get("debug") === "1";

/** Session wall clock for age filter; tests can override via __viz.referenceDate. */
function sessionReferenceDate(): Date {
  const override = (window as any).__viz?.referenceDate;
  if (override instanceof Date) return override;
  if (typeof override === "string" && Number.isFinite(Date.parse(override))) {
    return new Date(override);
  }
  return new Date();
}

document.addEventListener("DOMContentLoaded", () => {
  void boot();
});

async function boot() {
  const stagePanel = document.querySelector(".stage") as HTMLElement;
  const stageVisual = stagePanel?.querySelector(".stage-visual") as HTMLElement | null;
  const placeholder = stageVisual?.querySelector(".stage-placeholder");
  if (placeholder) placeholder.remove();

  const plotContainer = document.createElement("div");
  plotContainer.id = "stage-3d-plot-container";
  plotContainer.style.flex = "1";
  plotContainer.style.minHeight = "300px";
  plotContainer.style.width = "100%";
  plotContainer.style.height = "100%";
  plotContainer.style.position = "relative";
  stageVisual?.appendChild(plotContainer);

  const consoleRoot = document.querySelector(".console") as HTMLElement;
  const store = createStore();

  let stage: Stage3DSurface;
  let activeBackend = stageBackend;
  if (stageBackend === "r3f") {
    try {
      stage = new Stage3DThree(plotContainer, heatEncoding, { debugBadge: debugStage });
    } catch (err) {
      console.error("[stage] Three init failed; falling back to Plotly", err);
      plotContainer.replaceChildren();
      const { Stage3D } = await import("./viz/stage3d");
      stage = new Stage3D(plotContainer, heatEncoding);
      activeBackend = "plotly";
    }
  } else {
    const { Stage3D } = await import("./viz/stage3d");
    stage = new Stage3D(plotContainer, heatEncoding);
  }
  document.documentElement.dataset.stageBackend = activeBackend;
  const stageGuide = new StageGuide(
    stagePanel?.querySelector(".stage-guide") as HTMLElement,
    store,
    models,
    heatEncoding,
  );

  const cinema = new CinemaMode(stage, store);
  const consoleUi = new DecisionConsole(consoleRoot, store, models, () => cinema.toggle());

  let renderedWeights: AppState["weights"] | null = null;
  let renderedAxes: AxisMapping | null = null;
  let renderedFilters: ModelFilters | null = null;
  let pending: {
    weights: AppState["weights"];
    axisMapping: AxisMapping;
    filters: ModelFilters;
  } | null = null;
  let renderFrame: number | null = null;
  let projections: { render: (w: AppState["weights"], m: typeof models) => void; gds: HTMLDivElement[] } | null =
    null;
  let sweep: { setModels: (m: typeof models) => void } | null = null;

  const sameWeights = (left: AppState["weights"], right: AppState["weights"]) =>
    left.speed === right.speed && left.cost === right.cost && left.intelligence === right.intelligence;

  const renderVisuals = (
    weights: AppState["weights"],
    axisMapping: AxisMapping,
    filters: ModelFilters,
  ) => {
    renderedWeights = { ...weights };
    renderedAxes = { ...axisMapping };
    renderedFilters = {
      ...filters,
      providers: [...filters.providers],
      families: [...filters.families],
    };

    const visibleSet = applyFilters(models, filters, sessionReferenceDate());
    // Drop pin/hover if filtered out.
    const state = store.getState();
    const stillVisible = (id: string | null) =>
      id === null || visibleSet.some((m) => m.model === id);
    if (!stillVisible(state.hoveredModelId) || !stillVisible(state.pinnedModelId)) {
      store.update({
        hoveredModelId: stillVisible(state.hoveredModelId) ? state.hoveredModelId : null,
        pinnedModelId: stillVisible(state.pinnedModelId) ? state.pinnedModelId : null,
      });
    }

    stage.render(weights, visibleSet, { axisMapping });
    projections?.render(weights, visibleSet);
    // setModels already applied synchronously on store tick; refresh after stage ids update.
    consoleUi.setModels(visibleSet);
    stageGuide.setModels(visibleSet);
    sweep?.setModels(visibleSet);

    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      const viz = (window as any).__viz ?? {};
      viz.stage = stage;
      viz.gd = stage.gd;
      viz.heatEncoding = heatEncoding;
      viz.projectionsInstance = projections;
      viz.axisMapping = { ...axisMapping };
      viz.filters = { ...filters, providers: [...filters.providers], families: [...filters.families] };
      viz.visibleCount = visibleSet.length;
      viz.pointCount = (window as any).__viz?.pointCount;
      (window as any).__viz = viz;
    }
  };

  store.subscribe((state) => {
    if (!renderedWeights || !renderedAxes || !renderedFilters) {
      renderVisuals(state.weights, state.axisMapping, state.filters);
      return;
    }
    const weightsSame = sameWeights(renderedWeights, state.weights);
    const axesSame = sameAxisMapping(renderedAxes, state.axisMapping);
    const filtersSame = sameFilters(renderedFilters, state.filters);
    if (weightsSame && axesSame && filtersSame) return;

    // Sync visible-set consumers immediately on filter/weight/axis paint triggers
    // (not on hover-only ticks) so console/sweep don't lag a frame.
    const visibleNow = applyFilters(models, state.filters, sessionReferenceDate());
    consoleUi.setModels(visibleNow);
    stageGuide.setModels(visibleNow);
    sweep?.setModels(visibleNow);

    pending = {
      weights: { ...state.weights },
      axisMapping: { ...state.axisMapping },
      filters: {
        ...state.filters,
        providers: [...state.filters.providers],
        families: [...state.filters.families],
      },
    };
    if (renderFrame !== null) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = null;
      const next = pending;
      pending = null;
      if (next) renderVisuals(next.weights, next.axisMapping, next.filters);
    });
  });

  // Wire stage interaction immediately.
  const isTextEntryTarget = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return !["range", "checkbox", "radio", "button", "submit", "reset", "image", "file", "color"].includes(type);
    }
    return false;
  };

  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTextEntryTarget(event.target as HTMLElement | null)) return;
    event.preventDefault();
    cinema.toggle();
  });

  const pointerRoot = stage.el ?? stage.gd;
  pointerRoot.addEventListener("mouseenter", () => consoleUi.handleStageEnter());
  pointerRoot.addEventListener("mousemove", (event) => consoleUi.setCursor(event.clientX, event.clientY));
  pointerRoot.addEventListener("mouseleave", () => consoleUi.handleStageLeave());
  pointerRoot.addEventListener("stage:hover", ((event: CustomEvent<{ modelId: string | null }>) => {
    const modelId = event.detail?.modelId ?? null;
    if (modelId) consoleUi.handleHover(modelId);
    else consoleUi.handleStageLeave();
  }) as EventListener);
  pointerRoot.addEventListener("click", (event) => {
    consoleUi.handleStageClick(store.getState().hoveredModelId, event.clientX, event.clientY);
  });

  // Plotly-backed projections + sweep load in a separate chunk after stage paint.
  const projectionContainers = Array.from(
    document.querySelectorAll(".projection-row .projection"),
  ) as HTMLElement[];
  const [{ Projections }, { SweepScheduler }] = await Promise.all([
    import("./viz/projections"),
    import("./viz/sweep"),
  ]);
  projections =
    projectionContainers.length > 0
      ? new Projections(projectionContainers, stage.gd, heatEncoding)
      : null;
  const sweepScheduler = new SweepScheduler(
    stage.gd,
    projections?.gds ?? [],
    store,
    applyFilters(models, store.getState().filters, sessionReferenceDate()),
    heatEncoding,
  );
  sweep = sweepScheduler;

  // Re-render once projections exist so 2D views fill.
  const latest = store.getState();
  renderVisuals(latest.weights, latest.axisMapping, latest.filters);

  const plotlyOn = (stage.gd as any).on;
  if (typeof plotlyOn === "function") {
    plotlyOn.call(stage.gd, "plotly_hover", (event: any) => {
      const point = event.points?.[0];
      const modelId = modelIdFromPlotlyPoint(point);
      if (!modelId) return;
      consoleUi.handleHover(modelId);
    });
    plotlyOn.call(stage.gd, "plotly_unhover", () => {
      consoleUi.handleStageLeave();
    });
  }
}
