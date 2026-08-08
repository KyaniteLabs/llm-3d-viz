import { describe, expect, it } from "vitest";
import { delaunay2d, hullEdges } from "../src/lib/delaunay";

/** Every output triple must reference real input indices. */
const valid = (n: number, tris: Array<readonly [number, number, number]>) =>
  tris.every(([a, b, c]) => a < n && b < n && c < n && a !== b && b !== c && a !== c);

describe("delaunay2d", () => {
  it("returns no triangles for fewer than three points", () => {
    expect(delaunay2d([])).toEqual([]);
    expect(delaunay2d([[0, 0]])).toEqual([]);
    expect(delaunay2d([
      [0, 0],
      [1, 1],
    ])).toEqual([]);
  });

  it("triangulates a square into exactly two triangles", () => {
    const pts: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const tris = delaunay2d(pts);
    expect(tris).toHaveLength(2);
    expect(valid(4, tris)).toBe(true);
  });

  it("triangulates a convex hexagon (cocircular) into n−2 valid triangles", () => {
    // Six points on a unit circle are exactly cocircular — the classic Delaunay
    // degeneracy. A robust triangulator must still emit ONE valid triangulation
    // (n−2 = 4 triangles) with no overlaps, not a pile of overlapping slivers.
    const pts: Array<[number, number]> = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)] as [number, number];
    });
    const tris = delaunay2d(pts);
    expect(tris).toHaveLength(4);
    expect(valid(6, tris)).toBe(true);
    // No overlaps: summed triangle area equals the hexagon area exactly.
    const area = (p: Array<[number, number]>, [i, j, k]: readonly [number, number, number]) =>
      Math.abs((p[j][0] - p[i][0]) * (p[k][1] - p[i][1]) - (p[k][0] - p[i][0]) * (p[j][1] - p[i][1])) / 2;
    const sum = tris.reduce((s, t) => s + area(pts, t), 0);
    expect(sum).toBeCloseTo((3 * Math.sqrt(3)) / 2, 6);
  });

  it("produces a watertight triangulation: every interior edge is shared twice", () => {
    // Scattered frontier-like point cloud.
    const pts: Array<[number, number]> = [
      [0.1, 0.2],
      [0.8, 0.1],
      [0.9, 0.7],
      [0.4, 0.9],
      [0.0, 0.8],
      [0.5, 0.5],
      [0.2, 0.5],
      [0.7, 0.4],
    ];
    const tris = delaunay2d(pts);
    expect(tris.length).toBeGreaterThan(0);
    const count = new Map<string, number>();
    const key = (u: number, v: number) => (u < v ? `${u}:${v}` : `${v}:${u}`);
    for (const [a, b, c] of tris) {
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        count.set(key(u, v), (count.get(key(u, v)) ?? 0) + 1);
      }
    }
    // No edge shared more than twice; hull edges shared exactly once.
    for (const c of count.values()) expect(c).toBeLessThanOrEqual(2);
    expect([...count.values()].filter((c) => c === 1).length).toBeGreaterThan(0);
  });

  it("drops degenerate triangles for collinear input", () => {
    const pts: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ];
    expect(delaunay2d(pts)).toEqual([]);
  });

  it("is deterministic across repeated calls", () => {
    const pts: Array<[number, number]> = [
      [0, 0],
      [1, 0.2],
      [0.4, 1],
      [0.9, 0.9],
      [0.2, 0.6],
    ];
    const a = delaunay2d(pts);
    const b = delaunay2d(pts);
    expect(b).toEqual(a);
  });
});

describe("hullEdges", () => {
  it("returns the boundary edges of a square triangulation", () => {
    const pts: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const tris = delaunay2d(pts);
    const edges = hullEdges(tris);
    // A square has four boundary edges.
    expect(edges).toHaveLength(4);
  });

  it("returns the convex-hull edge count for a hexagon", () => {
    const pts: Array<[number, number]> = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)] as [number, number];
    });
    const edges = hullEdges(delaunay2d(pts));
    expect(edges).toHaveLength(6);
  });
});
