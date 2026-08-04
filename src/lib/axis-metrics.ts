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
  if (value < 0.05) return "≤fl";
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
    fixedDomain: [0, 100],
  },
  {
    id: "cost_per_index",
    label: "Cost / Index task",
    title: "COST / TASK",
    scale: "log",
    available: false,
    getValue: (m) => m.cost_per_index_task_usd ?? null,
    formatTick: formatPriceTick,
  },
  {
    id: "time_per_index",
    label: "Time / Index task",
    title: "TIME / TASK",
    scale: "log",
    available: false,
    getValue: (m) => m.time_per_index_task_s ?? null,
    formatTick: (v) => `${v}`,
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

function niceLogTicks(min: number, max: number, narrow: boolean): number[] {
  const lo = Math.log10(Math.max(min, Number.MIN_VALUE));
  const hi = Math.log10(Math.max(max, min * 10));
  const decades: number[] = [];
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
    const v = 10 ** e;
    if (v >= min * 0.99 && v <= max * 1.01) decades.push(v);
  }
  if (decades.length === 0) return [min, max];
  if (narrow && decades.length > 2) return [decades[0], decades[decades.length - 1]];
  return decades;
}

function linearTicks(min: number, max: number, narrow: boolean): number[] {
  if (min === 0 && max === 100) {
    return narrow ? [50, 100] : [0, 20, 40, 60, 80, 100];
  }
  const span = max - min;
  if (span <= 0) return [min];
  const step = narrow ? span / 2 : span / 4;
  const out: number[] = [];
  for (let i = 0; i <= (narrow ? 2 : 4); i++) {
    out.push(min + step * i);
  }
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
    // Keep a usable log span when data collapses.
    if (max <= min) max = min * 10;
    // Price metrics historically span up to ~$100/M for tick context.
    if (metricId === "blended_price" || metricId === "price_in" || metricId === "price_out") {
      max = Math.max(max, 100);
      min = Math.min(min, floor);
    }
    if (metricId === "tps") {
      min = Math.min(min, 10);
      max = Math.max(max, 1000);
    }
    if (metricId === "ttft") {
      min = Math.min(min, 100); // 0.1s
      max = Math.max(max, 60_000);
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

  // Linear, data-driven
  let min = raw.length > 0 ? Math.min(...raw) : 0;
  let max = raw.length > 0 ? Math.max(...raw) : 1;
  if (max <= min) max = min + 1;
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
