/**
 * Swappable stage-axis metrics.
 *
 * Product default remains x=cost (blended $/M), y=intelligence (AA Index),
 * z=speed (tok/s). Users can remap any scene axis to another measured metric
 * so permanent product-axis choices (e.g. blended vs input vs output cost)
 * are not required.
 */

import type { Model } from "../data/models";

/** Scene axis in product coordinates (Three: x/y/z = right / up / toward camera-depth). */
export type SceneAxis = "x" | "y" | "z";

/** Metrics that can be bound to a scene axis. Stubs stay listed but unavailable. */
export type AxisMetricId =
  | "blended_price"
  | "price_in"
  | "price_out"
  | "tps"
  | "ttft"
  | "intelligence"
  | "cost_per_index"
  | "time_per_index";

export type AxisScale = "log" | "linear";

export interface AxisMapping {
  x: AxisMetricId;
  y: AxisMetricId;
  z: AxisMetricId;
}

export interface AxisMetricDef {
  id: AxisMetricId;
  /** Short option label for the console. */
  label: string;
  /** Axis title drawn on the stage. */
  title: string;
  scale: AxisScale;
  /** True when the dataset carries enough rows for this metric to be selectable. */
  available: boolean;
  /** Raw value used for positioning; null when unmeasured. */
  getValue: (model: Model) => number | null;
  /** Format a tick value for display. */
  formatTick: (value: number) => string;
  /**
   * When set, scene mapping uses this fixed domain (after floor/clamp).
   * Otherwise domain is data-driven from the visible set.
   */
  fixedDomain?: readonly [number, number];
}

/** Landing / product-default mapping (SPEC axis lock as the default, not a hard lock). */
export const DEFAULT_AXIS_MAPPING: AxisMapping = {
  x: "blended_price",
  y: "intelligence",
  z: "tps",
};

function formatPriceTick(value: number): string {
  // ε price floor marker (half the cheapest positive blended price).
  if (value < 0.05) return "≤ floor";
  if (value < 1) return value.toFixed(1).replace(/\.0$/, "");
  if (value >= 100) return String(Math.round(value));
  return String(Number(value.toPrecision(2)));
}

function formatTpsTick(value: number): string {
  if (value >= 1000) return String(Math.round(value));
  return String(Number(value.toPrecision(2)));
}

function formatTtftTickSeconds(ms: number): string {
  const s = ms / 1000;
  if (s < 1) return s.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "s";
  if (s < 10) return s.toFixed(1) + "s";
  return Math.round(s) + "s";
}

function formatIntelTick(value: number): string {
  return String(Math.round(value));
}

export const AXIS_METRICS: readonly AxisMetricDef[] = [
  {
    id: "blended_price",
    label: "Cost $/M (7:2:1)",
    title: "COST ($/M)",
    scale: "log",
    available: true,
    getValue: (m) => m.blended_price_per_M,
    formatTick: formatPriceTick,
  },
  {
    id: "price_in",
    label: "Input $/M",
    title: "INPUT ($/M)",
    scale: "log",
    available: true,
    getValue: (m) => m.price_in_per_M,
    formatTick: formatPriceTick,
  },
  {
    id: "price_out",
    label: "Output $/M",
    title: "OUTPUT ($/M)",
    scale: "log",
    available: true,
    getValue: (m) => m.price_out_per_M,
    formatTick: formatPriceTick,
  },
  {
    id: "tps",
    label: "Speed (tok/s)",
    title: "SPEED (TPS)",
    scale: "log",
    available: true,
    getValue: (m) => m.tps,
    formatTick: formatTpsTick,
  },
  {
    id: "ttft",
    label: "TTFT (s)",
    title: "TTFT (s)",
    scale: "log",
    available: true,
    // Stored ms; domain still uses ms so log floors stay consistent.
    getValue: (m) => m.ttft,
    formatTick: formatTtftTickSeconds,
  },
  {
    id: "intelligence",
    label: "AA Intelligence",
    title: "INTELLIGENCE",
    scale: "linear",
    available: true,
    getValue: (m) => m.aa_intelligence_index,
    formatTick: formatIntelTick,
    // Domain is data-driven over the visible set (frontier-math §3.3 min-max).
    // Hard instrument bounds stay [0, 100] as clamp only — not a forced axis span.
  },
  {
    id: "cost_per_index",
    label: "Cost / Index task",
    title: "COST / TASK",
    scale: "log",
    available: true,
    getValue: (m) =>
      m.cost_per_index_task_usd != null && m.cost_per_index_task_usd > 0
        ? m.cost_per_index_task_usd
        : null,
    formatTick: formatPriceTick,
  },
  {
    id: "time_per_index",
    label: "Time / Index task",
    title: "TIME / TASK",
    scale: "log",
    available: true,
    getValue: (m) =>
      m.time_per_index_task_s != null && m.time_per_index_task_s > 0
        ? m.time_per_index_task_s
        : null,
    formatTick: (v) => (v >= 100 ? `${Math.round(v)}s` : `${Number(v.toPrecision(3))}s`),
  },
] as const;

const METRIC_BY_ID = Object.fromEntries(AXIS_METRICS.map((m) => [m.id, m])) as Record<
  AxisMetricId,
  AxisMetricDef
>;

export function getAxisMetric(id: AxisMetricId): AxisMetricDef {
  return METRIC_BY_ID[id];
}

export function availableAxisMetrics(): AxisMetricDef[] {
  return AXIS_METRICS.filter((m) => m.available);
}

export function isAxisMetricId(value: string): value is AxisMetricId {
  return value in METRIC_BY_ID;
}

export function sameAxisMapping(a: AxisMapping, b: AxisMapping): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function normalizeAxisMapping(partial?: Partial<AxisMapping> | null): AxisMapping {
  const pick = (id: AxisMetricId | undefined, fallback: AxisMetricId): AxisMetricId => {
    if (!id || !isAxisMetricId(id)) return fallback;
    const def = getAxisMetric(id);
    return def.available ? id : fallback;
  };
  return {
    x: pick(partial?.x, DEFAULT_AXIS_MAPPING.x),
    y: pick(partial?.y, DEFAULT_AXIS_MAPPING.y),
    z: pick(partial?.z, DEFAULT_AXIS_MAPPING.z),
  };
}

/** True when a model has measured values for all three mapped axes. */
export function hasMappedAxes(model: Model, mapping: AxisMapping): boolean {
  return (["x", "y", "z"] as const).every((axis) => {
    const def = getAxisMetric(mapping[axis]);
    const v = def.getValue(model);
    if (v === null || Number.isNaN(v)) return false;
    // Log-scale axes need a positive value (or will be floored later for $0).
    if (def.scale === "log" && v < 0) return false;
    return true;
  });
}

export interface AxisDomain {
  metricId: AxisMetricId;
  scale: AxisScale;
  /** Inclusive domain in raw units used for mapping to [-S, S]. */
  min: number;
  max: number;
  /** Positive floor applied for log metrics (ε for zeros). */
  floor: number;
  ticks: Array<{ value: number; label: string }>;
  title: string;
}

function minPositive(values: readonly number[]): number {
  const positive = values.filter((v) => v > 0);
  return positive.length > 0 ? Math.min(...positive) : 1;
}

/** Linear interpolation percentile on a pre-sorted ascending array. */
function percentileSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const t = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const lo = Math.floor(t);
  const hi = Math.ceil(t);
  if (lo === hi) return sorted[lo];
  const f = t - lo;
  return sorted[lo] * (1 - f) + sorted[hi] * f;
}

/**
 * Soft-trim extreme tails so the bulk of points owns more of the cube.
 * True outliers still map (clamped to faces via valueToUnit → unitToScene).
 * Only applies when n is large enough that p02/p98 are meaningful.
 */
function robustDataExtent(
  values: readonly number[],
  options: { log?: boolean } = {},
): { min: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const dataMin = sorted[0];
  const dataMax = sorted[sorted.length - 1];
  if (sorted.length < 12 || dataMax <= dataMin) {
    return { min: dataMin, max: dataMax };
  }
  const p02 = percentileSorted(sorted, 0.02);
  const p98 = percentileSorted(sorted, 0.98);
  let min = dataMin;
  let max = dataMax;
  if (options.log) {
    // Heavy upper tails (e.g. one 2000 tok/s model vs bulk ~100) crush neighbors.
    if (p98 > 0 && dataMax / p98 > 2.5) max = p98;
    if (p02 > 0 && p02 / dataMin > 2.5 && p02 < max) min = p02;
  } else {
    const span = dataMax - dataMin;
    // Only trim when the tail is a real chunk of the span (≥3%).
    if (dataMax - p98 >= span * 0.03) max = p98;
    if (p02 - dataMin >= span * 0.03) min = p02;
  }
  if (max <= min) return { min: dataMin, max: dataMax };
  return { min, max };
}

/**
 * Log ticks that adapt to the *visible* span:
 * - multi-decade: 1–2–5 mid-decade marks when the view is tight
 * - wide span: decade anchors
 * - always denser than the old decade-only grid so solo-family views stay readable
 */
function niceLogTicks(min: number, max: number, narrow: boolean): number[] {
  const lo = Math.log10(Math.max(min, Number.MIN_VALUE));
  const hi = Math.log10(Math.max(max, min * 1.01));
  const spanDecades = hi - lo;
  const mags = [1, 2, 5];
  const out: number[] = [];
  const e0 = Math.floor(lo);
  const e1 = Math.ceil(hi);
  for (let e = e0; e <= e1; e++) {
    for (const m of mags) {
      const v = m * 10 ** e;
      if (v >= min * 0.98 && v <= max * 1.02) out.push(v);
    }
  }
  if (out.length === 0) return [min, max];
  // Cap density: narrow UI → fewer labels; tight data span → keep mid-decade marks.
  const maxTicks = narrow ? 3 : spanDecades <= 1.2 ? 7 : spanDecades <= 2.5 ? 6 : 5;
  if (out.length <= maxTicks) return out;
  // Prefer endpoints + evenly spaced selection.
  const picked = [out[0]];
  const step = (out.length - 1) / (maxTicks - 1);
  for (let i = 1; i < maxTicks - 1; i++) {
    picked.push(out[Math.round(i * step)]);
  }
  picked.push(out[out.length - 1]);
  return [...new Set(picked)].sort((a, b) => a - b);
}

/** Linear ticks: denser when the visible span is small (solo family / filtered set). */
function linearTicks(min: number, max: number, narrow: boolean): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  // Familiar full-instrument grid only when the domain actually covers it.
  if (min <= 0.01 && max >= 99.5) {
    return narrow ? [0, 50, 100] : [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  }
  // Nice step from span
  const target = narrow ? 3 : span <= 15 ? 6 : span <= 40 ? 5 : 4;
  const rawStep = span / target;
  const pow = 10 ** Math.floor(Math.log10(rawStep));
  const niceCandidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  let step = niceCandidates[0];
  for (const c of niceCandidates) {
    if (c >= rawStep * 0.85) {
      step = c;
      break;
    }
    step = c;
  }
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  if (start > min + step * 0.05) out.push(min);
  for (let v = start; v <= max + step * 1e-9; v += step) {
    out.push(Number(v.toPrecision(8)));
  }
  if (out[out.length - 1] < max - step * 0.05) out.push(max);
  return out;
}

/** Build domain + ticks for one metric from a model set (usually axis-complete rows). */
export function buildAxisDomain(
  metricId: AxisMetricId,
  models: readonly Model[],
  options: { narrow?: boolean } = {},
): AxisDomain {
  const def = getAxisMetric(metricId);
  const narrow = options.narrow === true;
  const raw = models
    .map((m) => def.getValue(m))
    .filter((v): v is number => v !== null && !Number.isNaN(v));

  if (def.fixedDomain) {
    const [min, max] = def.fixedDomain;
    const ticks = linearTicks(min, max, narrow).map((value) => ({
      value,
      label: def.formatTick(value),
    }));
    return {
      metricId,
      scale: def.scale,
      min,
      max,
      floor: min,
      ticks,
      title: def.title,
    };
  }

  if (def.scale === "log") {
    const positives = raw.filter((v) => v > 0);
    const floor = positives.length > 0 ? minPositive(positives) / 2 : 0.05;
    const effective = raw.map((v) => (v <= 0 ? floor : Math.max(v, floor)));
    let min = effective.length > 0 ? Math.min(...effective) : floor;
    let max = effective.length > 0 ? Math.max(...effective) : floor * 100;
    // Soft-trim extreme log tails so one ultra-fast / ultra-cheap outlier does
    // not compress the rest of the field into a thin slab of the cube.
    if (positives.length >= 12) {
      const robust = robustDataExtent(positives, { log: true });
      min = Math.max(min, robust.min);
      max = Math.min(max, robust.max);
    }
    // Keep a usable log span when data collapses.
    if (max <= min) max = min * 10;
    // Modest edge breath — enough that marks are not glued to the wall, small
    // enough that the data band still owns most of the axis (inter-point space).
    const logPad = 10 ** ((Math.log10(max) - Math.log10(min)) * 0.07);
    min = Math.max(floor * 0.9, min / Math.max(logPad, 1.06));
    max = max * Math.max(logPad, 1.06);
    if (metricId === "blended_price" || metricId === "price_in" || metricId === "price_out") {
      // Keep a small floor marker context without inflating to $100 when looking at cheap models.
      min = Math.min(min, floor);
    }
    const tickValues = niceLogTicks(min, max, narrow);
    // Always surface floor marker for price-like axes when not narrow.
    if (
      !narrow &&
      (metricId === "blended_price" || metricId === "price_in" || metricId === "price_out") &&
      !tickValues.some((v) => Math.abs(v - floor) / floor < 0.05)
    ) {
      tickValues.unshift(floor);
    }
    return {
      metricId,
      scale: "log",
      min,
      max,
      floor,
      ticks: tickValues.map((value) => ({ value, label: def.formatTick(value) })),
      title: def.title,
    };
  }

  // Linear, data-driven (intelligence and any future linear metrics).
  // frontier-math §3.3: min-max over the visible set — NOT a forced 0–100 span.
  // Soft-trim extreme tails when n is large so the bulk spreads across the cube.
  let min = raw.length > 0 ? Math.min(...raw) : 0;
  let max = raw.length > 0 ? Math.max(...raw) : 1;
  if (raw.length >= 12) {
    const robust = robustDataExtent(raw);
    min = robust.min;
    max = robust.max;
  }
  if (max <= min) max = min + 1;
  // Modest edge breath so marks aren't glued to the wall — keep pad small so
  // the data band owns most of the cube (inter-point separation).
  const pad = Math.max(metricId === "intelligence" ? 1.5 : 0, (max - min) * 0.06);
  min -= pad;
  max += pad;
  if (metricId === "intelligence") {
    min = Math.max(0, min);
    max = Math.min(100, max);
  }
  const ticks = linearTicks(min, max, narrow).map((value) => ({
    value,
    label: def.formatTick(value),
  }));
  return {
    metricId,
    scale: "linear",
    min,
    max,
    floor: min,
    ticks,
    title: def.title,
  };
}

/**
 * Shrink point markers when many models share the cube so neighbors separate
 * visually. Pure display scale — does not change coordinates.
 */
export function densityMarkerScale(pointCount: number): number {
  if (pointCount >= 120) return 0.7;
  if (pointCount >= 70) return 0.8;
  if (pointCount >= 40) return 0.9;
  return 1;
}

/** Map a raw metric value into unit interval [0, 1] given a domain. */
export function valueToUnit(value: number, domain: AxisDomain): number {
  const v =
    domain.scale === "log"
      ? Math.max(value <= 0 ? domain.floor : value, domain.floor)
      : value;
  if (domain.scale === "log") {
    const logV = Math.log10(v);
    const logMin = Math.log10(domain.min);
    const logMax = Math.log10(domain.max);
    if (logMax === logMin) return 0.5;
    return (logV - logMin) / (logMax - logMin);
  }
  if (domain.max === domain.min) return 0.5;
  return (v - domain.min) / (domain.max - domain.min);
}

/** Map unit [0,1] → scene coordinate in [-halfExtent, halfExtent]. */
export function unitToScene(unit: number, halfExtent = 1): number {
  const u = Math.min(1, Math.max(0, unit));
  return u * 2 * halfExtent - halfExtent;
}

export function modelToSceneCoords(
  model: Model,
  mapping: AxisMapping,
  domains: { x: AxisDomain; y: AxisDomain; z: AxisDomain },
  halfExtent = 1,
): { x: number; y: number; z: number } | null {
  if (!hasMappedAxes(model, mapping)) return null;
  const rawX = getAxisMetric(mapping.x).getValue(model)!;
  const rawY = getAxisMetric(mapping.y).getValue(model)!;
  const rawZ = getAxisMetric(mapping.z).getValue(model)!;
  return {
    x: unitToScene(valueToUnit(rawX, domains.x), halfExtent),
    y: unitToScene(valueToUnit(rawY, domains.y), halfExtent),
    z: unitToScene(valueToUnit(rawZ, domains.z), halfExtent),
  };
}

/** Human title for the stage heading from the current mapping. */
export function mappingHeading(mapping: AxisMapping): string {
  const short = (id: AxisMetricId) => {
    switch (id) {
      case "blended_price":
        return "cost";
      case "price_in":
        return "input $";
      case "price_out":
        return "output $";
      case "tps":
        return "speed";
      case "ttft":
        return "TTFT";
      case "intelligence":
        return "intelligence";
      case "cost_per_index":
        return "cost/task";
      case "time_per_index":
        return "time/task";
      default:
        return id;
    }
  };
  // Product order is still spoken as speed × cost × intelligence when default;
  // otherwise list scene axes X × Y × Z.
  if (
    mapping.x === DEFAULT_AXIS_MAPPING.x &&
    mapping.y === DEFAULT_AXIS_MAPPING.y &&
    mapping.z === DEFAULT_AXIS_MAPPING.z
  ) {
    return "Speed × cost × intelligence";
  }
  return `${short(mapping.x)} × ${short(mapping.y)} × ${short(mapping.z)}`;
}
