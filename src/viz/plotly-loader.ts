/** Dynamic Plotly loader — keeps gl3d out of the Three-only main chunk. */
export type PlotlyModule = typeof import("plotly.js-dist-min");

let pending: Promise<PlotlyModule> | null = null;

type PlotlyImport = { default?: PlotlyModule } & PlotlyModule;

/** `importFn` is injectable so the rejection-retry path (V13) is unit-testable. */
export function loadPlotly(
  importFn: () => Promise<PlotlyImport> = () => import("plotly.js-dist-min"),
): Promise<PlotlyModule> {
  if (!pending) {
    pending = importFn().then((mod) => {
      const plotly = (mod as { default?: PlotlyModule }).default ?? (mod as PlotlyModule);
      if (import.meta.env.DEV && typeof window !== "undefined") {
        const viz = ((window as unknown as { __viz?: Record<string, unknown> }).__viz ??= {});
        viz.Plotly = plotly;
      }
      return plotly;
    });
    // V13: a rejected dynamic import is cached as long as `pending` stays
    // truthy, permanently disabling every Plotly-backed operation for the
    // session. Reset the cache on rejection so the next call retries. The
    // original promise still rejects to existing awaiters; only the cache is
    // cleared (this handler runs alongside, it does not consume the rejection).
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
