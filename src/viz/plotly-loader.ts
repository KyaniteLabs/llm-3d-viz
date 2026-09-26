/** Dynamic Plotly loader — keeps gl3d out of the Three-only main chunk. */
export type PlotlyModule = typeof import("plotly.js-dist-min");

let pending: Promise<PlotlyModule> | null = null;

export function loadPlotly(): Promise<PlotlyModule> {
  if (!pending) {
    pending = import("plotly.js-dist-min").then((mod) => {
      const plotly = (mod as { default?: PlotlyModule }).default ?? (mod as PlotlyModule);
      if (import.meta.env.DEV) {
        const viz = ((window as unknown as { __viz?: Record<string, unknown> }).__viz ??= {});
        viz.Plotly = plotly;
      }
      return plotly;
    });
  }
  return pending;
}
