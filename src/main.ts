import "./styles/tokens.css";
import { models } from "./data/models";
import { sameAxisMapping, type AxisMapping } from "./lib/axis-metrics";
import { applyFilters, sameFilters, type ModelFilters } from "./lib/filters";
import { parseShareableState, writeShareableUrl } from "./lib/url-state";
import { Stage3DThree } from "./viz/stage3d-three";
import type { Stage3DSurface } from "./viz/stage-api";
import { createStore, type AppState } from "./state";
import { DecisionConsole } from "./ui/console";
import { CinemaMode } from "./viz/cinema";
import { StageGuide } from "./ui/stage-guide";
import { groupByFamily, deriveEffortTier } from "./lib/family";
import { displayName } from "./lib/display-name";

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
// Product default: curve-focus. Legacy openness fill: ?enc=openness
const presentationMode = searchParams.get("enc") === "openness" ? "openness" as const : "curve" as const;
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


function updateEffortStrip(
  visible: readonly import("./data/models").Model[],
  state: AppState,
  store: import("./state").AppStore,
) {
  const host = document.querySelector("[data-effort-strip]") as HTMLElement | null;
  if (!host) return;
  const byFam = groupByFamily(visible);
  const multi = [...byFam.entries()].filter(([, m]) => m.length >= 2);
  const soloFamily =
    state.filters.families.length === 1
      ? state.filters.families[0]
      : multi.length === 1
        ? multi[0][0]
        : null;
  if (!soloFamily || !byFam.has(soloFamily) || (byFam.get(soloFamily)?.length ?? 0) < 2) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  const members = byFam.get(soloFamily)!;
  host.hidden = false;
  host.innerHTML = `
    <p class="eyebrow">EFFORT LADDER · ${soloFamily.replace(/</g, "")}</p>
    <ol class="effort-ladder" aria-label="Effort intensity steps">
      ${members
        .map((m) => {
          const tier = deriveEffortTier(m);
          const active =
            state.hoveredModelId === m.model || state.pinnedModelId === m.model ? " is-active" : "";
          return `<li class="effort-step${active}" data-model-id="${m.model}"><span class="effort-tier">${tier}</span><strong>${displayName(m.model)}</strong></li>`;
        })
        .join("")}
    </ol>`;
  host.querySelectorAll<HTMLElement>("[data-model-id]").forEach((el) => {
    el.onpointerenter = () => store.update({ hoveredModelId: el.dataset.modelId ?? null });
    el.onpointerleave = () => store.update({ hoveredModelId: null });
  });
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
  // Shareable URL: filters, axes, weights. Session-only: hover/pin/cinema.
  // `?age=0` remains the regression-suite escape hatch for the full catalog.
  const fromUrl = parseShareableState(searchParams);
  const store = createStore({
    filters: fromUrl.filters,
    axisMapping: fromUrl.axisMapping,
    weights: fromUrl.weights,
  });

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
    presentationMode,
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
  let projections: {
    render: (w: AppState["weights"], m: typeof models) => void;
    gds: HTMLDivElement[];
    setPresentationMode?: (m: "curve" | "openness") => void;
  } | null = null;
  let sweep: {
    setModels: (m: typeof models) => void;
    setPresentationMode?: (m: "curve" | "openness") => void;
  } | null = null;
  let didInitialFit = false;
  let lastFilterFitKey = "";

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

    const filterKey = JSON.stringify({
      age: filters.ageEnabled,
      providers: [...filters.providers].sort(),
      families: [...filters.families].sort(),
    });
    const shouldFit =
      !didInitialFit || filterKey !== lastFilterFitKey;
    if (shouldFit) {
      didInitialFit = true;
      lastFilterFitKey = filterKey;
    }
    stage.render(weights, visibleSet, {
      axisMapping,
      presentationMode,
      fit: shouldFit ? "multi-effort" : "none",
    });
    projections?.setPresentationMode?.(presentationMode);
    projections?.render(weights, visibleSet);
    sweep?.setPresentationMode?.(presentationMode);
    updateEffortStrip(visibleSet, store.getState(), store);
    // Console/guide track the visible set; do NOT restart the sweep here.
    // SweepScheduler owns weight-driven ignition; setModels is only for catalog
    // (filter) changes — restarting on every paint raced mid-sweep size=11 frames
    // and made Playwright settle checks flaky.
    consoleUi.setModels(visibleSet);
    stageGuide.setModels(visibleSet);

    // Always publish instrument state for Playwright/QA (preview + prod).
    const viz = (window as any).__viz ?? {};
    viz.stage = stage;
    viz.gd = stage.gd;
    viz.heatEncoding = heatEncoding;
    viz.presentationMode = presentationMode;
    viz.projectionsInstance = projections;
    viz.axisMapping = { ...axisMapping };
    viz.filters = { ...filters, providers: [...filters.providers], families: [...filters.families] };
    viz.visibleCount = visibleSet.length;
    viz.pointCount = (window as any).__viz?.pointCount ?? visibleSet.length;
    (window as any).__viz = viz;
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

    // Filter changes rewrite the visible catalog — console, guide, and sweep need
    // the new set immediately. Weight/axis-only changes leave membership alone;
    // SweepScheduler starts its own ignition from its store subscription.
    if (!filtersSame) {
      const visibleNow = applyFilters(models, state.filters, sessionReferenceDate());
      consoleUi.setModels(visibleNow);
      stageGuide.setModels(visibleNow);
      sweep?.setModels(visibleNow);
    }

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

  // Keep the address bar in sync with shareable instrument state (replaceState).
  store.subscribe((state) => {
    writeShareableUrl({
      filters: state.filters,
      axisMapping: state.axisMapping,
      weights: state.weights,
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
  const initialVisible = applyFilters(models, store.getState().filters, sessionReferenceDate());
  const sweepScheduler = new SweepScheduler(
    stage.gd,
    projections?.gds ?? [],
    store,
    initialVisible,
    heatEncoding,
  );
  sweep = sweepScheduler;

  // Re-render once projections exist so 2D views fill, then arm sweep once the
  // stage graph has model ids (setModels restarts ignition against the live set).
  const latest = store.getState();
  renderVisuals(latest.weights, latest.axisMapping, latest.filters);
  sweepScheduler.setModels(initialVisible);

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
