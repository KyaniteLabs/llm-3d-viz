import { describe, expect, it } from "vitest";
import { models } from "../src/data/models";
import {
  DEFAULT_AXIS_MAPPING,
  availableAxisMetrics,
  buildAxisDomain,
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

  it("maps intelligence linearly on a fixed 0–100 domain", () => {
    const domain = buildAxisDomain("intelligence", models);
    expect(domain.min).toBe(0);
    expect(domain.max).toBe(100);
    expect(valueToUnit(0, domain)).toBe(0);
    expect(valueToUnit(100, domain)).toBe(1);
    expect(valueToUnit(50, domain)).toBeCloseTo(0.5);
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
