import "./styles/tokens.css";
import { models } from "./data/models";
import { sameAxisMapping, type AxisMapping } from "./lib/axis-metrics";
import { applyFilters, sameFilters, type ModelFilters } from "./lib/filters";
import { parseShareableState, writeShareableUrl } from "./lib/url-state";
import { Stage3DThree } from "./viz/stage3d-three";
import type { Stage3DSurface } from "./viz/stage-api";
import { createStore, type AppState } from "./state";
import { DecisionConsole } from "./ui/console";
import { FilterShelf, formatScopeSummary } from "./ui/filter-shelf";
import { renderMembershipTable } from "./ui/membership-table";
import { RELEASE_FLOOR_ISO } from "./data/catalog-scope";
import { CinemaMode } from "./viz/cinema";
import { StageGuide } from "./ui/stage-guide";
import { groupByFamily, deriveEffortTier, familyIdOf } from "./lib/family";
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
// Curve-focus product default; score heat is diagnostic opt-in only.
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
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  host.innerHTML = `
    <p class="eyebrow">EFFORT LADDER · ${esc(soloFamily)}</p>
    <ol class="effort-ladder" aria-label="Effort intensity steps for ${esc(soloFamily)}">
      ${members
        .map((m) => {
          const tier = deriveEffortTier(m);
          const active =
            state.hoveredModelId === m.model || state.pinnedModelId === m.model ? " is-active" : "";
          const intel =
            m.aa_intelligence_index != null ? m.aa_intelligence_index.toFixed(0) : "—";
          const cost =
            m.blended_price_per_M != null ? `$${m.blended_price_per_M.toFixed(2)}` : "—";
          const tps = m.tps != null ? `${Math.round(m.tps)} t/s` : "—";
          return `<li class="effort-step${active}" data-model-id="${esc(m.model)}" tabindex="0">
            <span class="effort-tier">${esc(tier)}</span>
            <strong>${esc(displayName(m.model))}</strong>
            <span class="effort-metrics"><span>IQ ${intel}</span><span>${esc(cost)}/M</span><span>${esc(tps)}</span></span>
          </li>`;
        })
        .join("")}
    </ol>`;
  host.querySelectorAll<HTMLElement>("[data-model-id]").forEach((el) => {
    el.onpointerenter = () => store.update({ hoveredModelId: el.dataset.modelId ?? null });
    el.onpointerleave = () => store.update({ hoveredModelId: null });
    el.onclick = () =>
      store.update({
        pinnedModelId: el.dataset.modelId ?? null,
        hoveredModelId: el.dataset.modelId ?? null,
      });
  });
}

function updateEmptyState(visibleCount: number, filters?: { multiEffortOnly?: boolean; families?: string[] }) {
  const stage = document.querySelector(".stage-visual") as HTMLElement | null;
  if (!stage) return;
  let banner = stage.querySelector("[data-empty-visible]") as HTMLElement | null;
  if (visibleCount > 0) {
    banner?.remove();
    return;
  }
  const famHint =
    filters?.families?.length && filters.multiEffortOnly
      ? `Selected families may be single-effort on AA (e.g. Claude Fable 5). Turn off <strong>Multi-effort only</strong> in Edit scope, or solo via a family chip (auto-widens).`
      : `Nothing matches the current filters. Clear filters or turn off <strong>Multi-effort only</strong> / age to widen the set.`;
  if (!banner) {
    banner = document.createElement("div");
    banner.dataset.emptyVisible = "1";
    banner.className = "empty-visible-banner";
    banner.setAttribute("role", "status");
    stage.appendChild(banner);
  }
  banner.innerHTML = `
      <p class="eyebrow">NO MODELS IN VIEW</p>
      <p>${famHint}</p>
      <p class="axis-hint">Tip: <code>?me=0</code> shows single-effort models; <code>?families=Claude%20Fable%205&amp;me=0</code> solos Fable.</p>`;
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
  plotContainer.style.minHeight = "0";
  plotContainer.style.width = "100%";
  plotContainer.style.height = "100%";
  plotContainer.style.position = "relative";
  stageVisual?.appendChild(plotContainer);

  const consoleRoot = document.querySelector(".inspector") as HTMLElement;
  const shell = document.getElementById("app-shell") as HTMLElement;
  const filterShelfHost = document.querySelector("[data-filter-shelf]") as HTMLElement;
  const scopeText = document.querySelector("[data-scope-text]") as HTMLElement;
  const statusText = document.querySelector("[data-status-text]") as HTMLElement;
  const canvasHost = document.querySelector(".canvas-host") as HTMLElement;
  const tableHost = document.querySelector("[data-membership-table]") as HTMLElement;
  // Shareable URL: filters, axes, weights. Session-only: hover/pin/cinema.
  // `?age=0` remains the regression-suite escape hatch for the full catalog.
  const fromUrl = parseShareableState(searchParams);
  const store = createStore({
    filters: fromUrl.filters,
    axisMapping: fromUrl.axisMapping,
    weights: fromUrl.weights,
  });

  const filterShelf = new FilterShelf(filterShelfHost, store, models, sessionReferenceDate);
  filterShelf.render();

  const setScopeOpen = (open: boolean) => {
    shell.classList.toggle("is-scope-open", open);
    const shelf = document.getElementById("filter-shelf");
    if (shelf) shelf.hidden = !open;
    document.querySelectorAll("[data-scope-edit]").forEach((btn) => {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    if (open) filterShelf.resetDraftFromStore();
  };

  document.querySelectorAll("[data-scope-edit]").forEach((btn) => {
    btn.addEventListener("click", () => setScopeOpen(!shell.classList.contains("is-scope-open")));
  });
  document.querySelector("[data-scope-close]")?.addEventListener("click", () => setScopeOpen(false));
  document.querySelector("[data-scope-apply]")?.addEventListener("click", () => {
    filterShelf.apply();
    setScopeOpen(false);
  });
  document.querySelector("[data-scope-reset]")?.addEventListener("click", () => filterShelf.resetDraftFromStore());

  const setCanvasMode = (mode: "3d" | "2d" | "table") => {
    canvasHost.dataset.canvasMode = mode;
    canvasHost.querySelectorAll(".mode-tab").forEach((tab) => {
      const m = (tab as HTMLElement).dataset.mode;
      const on = m === mode;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    const stageEl = canvasHost.querySelector<HTMLElement>('[data-pane="3d"]');
    const projEl = canvasHost.querySelector<HTMLElement>('[data-pane="2d"]');
    const tableEl = canvasHost.querySelector<HTMLElement>('[data-pane="table"]');
    const effortEl = canvasHost.querySelector<HTMLElement>("[data-effort-strip]");
    if (stageEl) stageEl.hidden = mode !== "3d";
    if (projEl) projEl.hidden = mode !== "2d";
    if (tableEl) tableEl.hidden = mode !== "table";
    // effort only in 3d when solo
    if (effortEl && mode !== "3d") effortEl.hidden = true;
    // Plotly plots are born in a 6.75rem strip — resize once the 2D pane is full-height.
    if (mode === "2d") {
      requestAnimationFrame(() => {
        void import("./viz/plotly-loader").then(({ loadPlotly }) =>
          loadPlotly().then((Plotly) => {
            projections?.gds?.forEach((gd) => {
              try {
                Plotly.Plots.resize(gd);
              } catch {
                /* plot not ready */
              }
            });
          }),
        ).catch(() => {
          /* plotly not loaded yet */
        });
      });
    }
    if (mode === "3d") {
      // Force Three resize after leaving a hidden/zeroed layout slot.
      window.dispatchEvent(new Event("resize"));
    }
  };
  canvasHost.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = (tab as HTMLElement).dataset.mode as "3d" | "2d" | "table";
      if (mode) setCanvasMode(mode);
      // refresh table when entering table mode
      if (mode === "table") {
        const vis = applyFilters(models, store.getState().filters, sessionReferenceDate());
        if (tableHost) renderMembershipTable(tableHost, vis, store);
      }
    });
  });
  setCanvasMode("3d");

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
  document.querySelector("[data-cinema-toggle]")?.addEventListener("click", () => cinema.toggle());
  document.querySelector("[data-global-search]")?.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Enter") return;
    const q = ((event.target as HTMLInputElement).value || "").trim().toLowerCase();
    if (!q) return;
    const vis = applyFilters(models, store.getState().filters, sessionReferenceDate());
    const hit = vis.find(
      (m) =>
        m.model.toLowerCase().includes(q) ||
        familyIdOf(m).toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
    );
    if (hit) {
      store.update({ pinnedModelId: hit.model, hoveredModelId: hit.model });
      setCanvasMode("3d");
    }
  });

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
      multiEffortOnly: filters.multiEffortOnly,
      providers: [...filters.providers],
      families: [...filters.families],
    };

    const visibleSet = applyFilters(models, filters, sessionReferenceDate());
    if (scopeText) {
      scopeText.textContent = formatScopeSummary(filters, visibleSet.length, models.length);
    }
    if (statusText) {
      statusText.textContent = `${visibleSet.length} models · ${filters.multiEffortOnly ? "multi-effort" : "all variants"} · stage ${activeBackend}`;
    }
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
      me: filters.multiEffortOnly,
      providers: [...filters.providers].sort(),
      families: [...filters.families].sort(),
    });
    const shouldFit =
      !didInitialFit || filterKey !== lastFilterFitKey;
    if (shouldFit) {
      didInitialFit = true;
      lastFilterFitKey = filterKey;
    }
    const soloFamily = filters.families.length === 1;
    const hoverId = store.getState().hoveredModelId ?? store.getState().pinnedModelId;
    const hoverModel = hoverId ? visibleSet.find((m) => m.model === hoverId) : null;
    const highlightFamilyId = hoverModel ? familyIdOf(hoverModel) : null;
    stage.render(weights, visibleSet, {
      axisMapping,
      presentationMode,
      fit: shouldFit ? (soloFamily ? "all" : "multi-effort") : "none",
      soloFamily,
      highlightFamilyId: soloFamily ? filters.families[0] : highlightFamilyId,
    });
    updateEmptyState(visibleSet.length, filters);
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
    // Hover/pin: lightweight family emphasis (no full rebuild / no sweep race).
    if (weightsSame && axesSame && filtersSame) {
      const visibleNow = applyFilters(models, state.filters, sessionReferenceDate());
      const soloFamily = state.filters.families.length === 1;
      const hoverId = state.hoveredModelId ?? state.pinnedModelId;
      const hoverModel = hoverId ? visibleNow.find((m) => m.model === hoverId) : null;
      const highlightFamilyId = soloFamily
        ? state.filters.families[0]
        : hoverModel
          ? familyIdOf(hoverModel)
          : null;
      stage.setFamilyHighlight?.(highlightFamilyId);
      return;
    }

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
        multiEffortOnly: state.filters.multiEffortOnly,
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

  // Effort strip active state follows hover/pin without waiting for filter re-render.
  let lastStripHover: string | null | undefined = undefined;
  let lastStripPin: string | null | undefined = undefined;
  store.subscribe((state) => {
    if (state.hoveredModelId === lastStripHover && state.pinnedModelId === lastStripPin) return;
    lastStripHover = state.hoveredModelId;
    lastStripPin = state.pinnedModelId;
    const visibleSet = applyFilters(models, state.filters, sessionReferenceDate());
    updateEffortStrip(visibleSet, state, store);
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
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTextEntryTarget(event.target as HTMLElement | null)) return;
    // Don't steal arrows when stage canvas owns focus (orbit).
    const stageFocused = document.activeElement === (stage.el?.querySelector?.("canvas") ?? null)
      || document.activeElement === stage.gd;
    const key = event.key;
    if (key === "c" || key === "C") {
      event.preventDefault();
      cinema.toggle();
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      consoleUi.showAllFamilies();
      return;
    }
    if (key === "[" || key === "PageUp") {
      event.preventDefault();
      consoleUi.stepFamily(-1);
      return;
    }
    if (key === "]" || key === "PageDown") {
      event.preventDefault();
      consoleUi.stepFamily(1);
      return;
    }
    if (!stageFocused && (key === "," || key === "<")) {
      event.preventDefault();
      consoleUi.stepEffort(-1);
      return;
    }
    if (!stageFocused && (key === "." || key === ">")) {
      event.preventDefault();
      consoleUi.stepEffort(1);
      return;
    }
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
