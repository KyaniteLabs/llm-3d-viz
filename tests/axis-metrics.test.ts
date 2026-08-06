import { describe, expect, it } from "vitest";
import { models } from "../src/data/models";
import {
  DEFAULT_AXIS_MAPPING,
  applyEconomyBasis,
  availableAxisMetrics,
  buildAxisDomain,
  densityMarkerScale,
  detectEconomyBasis,
  hasMappedAxes,
  mappingHeading,
  modelToSceneCoords,
  normalizeAxisMapping,
  valueToUnit,
} from "../src/lib/axis-metrics";

describe("axis-metrics", () => {
  it("defaults to cost × intelligence × speed", () => {
    expect(DEFAULT_AXIS_MAPPING).toEqual({
      x: "blended_price",
      y: "intelligence",
      z: "tps",
    });
    expect(mappingHeading(DEFAULT_AXIS_MAPPING)).toBe("Speed × cost × intelligence");
  });

  it("toggles economy basis between rate ($/M · tok/s) and task ($/task · s/task)", () => {
    expect(detectEconomyBasis(DEFAULT_AXIS_MAPPING)).toBe("rate");
    const task = applyEconomyBasis(DEFAULT_AXIS_MAPPING, "task");
    expect(task).toEqual({
      x: "cost_per_index",
      y: "intelligence",
      z: "time_per_index",
    });
    expect(detectEconomyBasis(task)).toBe("task");
    const back = applyEconomyBasis(task, "rate");
    expect(back).toEqual(DEFAULT_AXIS_MAPPING);
    // Preserves a custom intelligence remaps on Y
    const customY = applyEconomyBasis(
      { x: "blended_price", y: "ttft", z: "tps" },
      "task",
    );
    expect(customY.y).toBe("ttft");
    expect(detectEconomyBasis({ x: "price_in", y: "intelligence", z: "tps" })).toBe("custom");
  });

  it("exposes available metrics including task axes when data exists", () => {
    const ids = availableAxisMetrics().map((m) => m.id);
    expect(ids).toContain("blended_price");
    expect(ids).toContain("price_in");
    expect(ids).toContain("price_out");
    expect(ids).toContain("tps");
    expect(ids).toContain("ttft");
    expect(ids).toContain("intelligence");
    expect(ids).toContain("cost_per_index");
    expect(ids).toContain("time_per_index");
  });

  it("accepts cost_per_index when available and rejects unknown ids", () => {
    const mapping = normalizeAxisMapping({
      x: "cost_per_index",
      y: "intelligence",
      z: "tps",
    });
    expect(mapping.x).toBe("cost_per_index");
    const bad = normalizeAxisMapping({
      x: "not_a_metric" as any,
      y: "intelligence",
      z: "tps",
    });
    expect(bad.x).toBe("blended_price");
  });

  it("fits intelligence to the visible catalog with pad (not forced 0–100)", () => {
    const domain = buildAxisDomain("intelligence", models);
    const indices = models
      .map((m) => m.aa_intelligence_index)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    const dataMin = indices[0];
    const dataMax = indices[indices.length - 1];
    // Domain hugs the bulk of the data — empty headroom above top models is gone.
    // Soft-trim may leave extreme tails slightly outside the domain (clamped to faces).
    expect(domain.max).toBeLessThan(95);
    expect(domain.max - domain.min).toBeLessThan((dataMax - dataMin) * 1.35);
    expect(domain.max - domain.min).toBeGreaterThan((dataMax - dataMin) * 0.7);
    // Still inside the AA instrument clamp.
    expect(domain.min).toBeGreaterThanOrEqual(0);
    expect(domain.max).toBeLessThanOrEqual(100);
    // Mid-catalog values stay interior (not glued to a face).
    const mid = indices[Math.floor(indices.length / 2)];
    const u = valueToUnit(mid, domain);
    expect(u).toBeGreaterThan(0.15);
    expect(u).toBeLessThan(0.85);
    // Absolute extrema remain mappable (may clamp to faces if soft-trimmed).
    expect(valueToUnit(dataMin, domain)).toBeLessThanOrEqual(0.15);
    expect(valueToUnit(dataMax, domain)).toBeGreaterThanOrEqual(0.85);
    expect(domain.ticks.length).toBeGreaterThanOrEqual(3);
  });

  it("tightens intelligence domain further when the visible set is a narrow cluster", () => {
    const cluster = models
      .filter((m) => m.aa_intelligence_index != null)
      .filter((m) => m.aa_intelligence_index! >= 55 && m.aa_intelligence_index! <= 62);
    if (cluster.length < 2) return;
    const domain = buildAxisDomain("intelligence", cluster);
    expect(domain.min).toBeGreaterThan(0);
    expect(domain.max).toBeLessThan(100);
    expect(domain.max - domain.min).toBeLessThan(45);
    expect(domain.ticks.length).toBeGreaterThanOrEqual(3);
  });

  it("shrinks markers when the point cloud is dense", () => {
    expect(densityMarkerScale(10)).toBe(1);
    expect(densityMarkerScale(50)).toBe(0.9);
    expect(densityMarkerScale(100)).toBe(0.8);
    expect(densityMarkerScale(160)).toBe(0.7);
  });

  it("fits log cost ticks to the visible price band (not forced $0–$100)", () => {
    const cheap = models.filter(
      (m) => m.blended_price_per_M != null && m.blended_price_per_M > 0 && m.blended_price_per_M < 1,
    );
    expect(cheap.length).toBeGreaterThan(2);
    const domain = buildAxisDomain("blended_price", cheap);
    expect(domain.max).toBeLessThan(50);
    expect(domain.ticks.some((t) => t.value < 1)).toBe(true);
  });

  it("places default-axis models inside the unit cube", () => {
    const plottable = models.filter((m) => hasMappedAxes(m, DEFAULT_AXIS_MAPPING));
    expect(plottable.length).toBeGreaterThan(10);
    const domains = {
      x: buildAxisDomain("blended_price", plottable),
      y: buildAxisDomain("intelligence", plottable),
      z: buildAxisDomain("tps", plottable),
    };
    for (const model of plottable.slice(0, 8)) {
      const coords = modelToSceneCoords(model, DEFAULT_AXIS_MAPPING, domains);
      expect(coords).not.toBeNull();
      expect(coords!.x).toBeGreaterThanOrEqual(-1);
      expect(coords!.x).toBeLessThanOrEqual(1);
      expect(coords!.y).toBeGreaterThanOrEqual(-1);
      expect(coords!.y).toBeLessThanOrEqual(1);
      expect(coords!.z).toBeGreaterThanOrEqual(-1);
      expect(coords!.z).toBeLessThanOrEqual(1);
    }
  });

  it("allows remapping X to input price without choosing permanently", () => {
    const mapping = normalizeAxisMapping({
      x: "price_in",
      y: "intelligence",
      z: "ttft",
    });
    expect(mapping.x).toBe("price_in");
    expect(mapping.z).toBe("ttft");
    expect(mappingHeading(mapping).toLowerCase()).toContain("input");
    const plottable = models.filter((m) => hasMappedAxes(m, mapping));
    expect(plottable.length).toBeGreaterThan(5);
  });
});
