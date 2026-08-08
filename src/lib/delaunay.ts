/**
 * Minimal 2D Delaunay triangulation (Bowyer–Watson with a super-triangle).
 *
 * Returns index triples `[i, j, k]` into the input `points` array. Points are
 * `[x, y]` tuples. Designed for small point sets (≤ a few dozen) — used to mesh
 * the Pareto frontier vertices into a translucent "frontier membrane" surface.
 *
 * Robustness:
 * - Collinear input → degenerate (near-zero-area) triangles are dropped.
 * - Duplicate points would yield thin triangles; callers should pre-dedupe.
 * - No external dependency (the repo keeps its runtime deps at three + kokoro-js).
 */
export function delaunay2d(
  points: ReadonlyArray<readonly [number, number]>,
): Array<[number, number, number]> {
  const n = points.length;
  if (n < 3) return [];

  // Bounding box → a super-triangle that strictly contains every point.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  // Tie-break threshold for the in-circle predicate (see inCircle). Absolute;
  // fine for the O(1)-scale scene coordinates this meshes.
  const EPS = 1e-9;
  const delta = 4 * span;
  const midx = (minX + maxX) / 2;
  const midy = (minY + maxY) / 2;
  // Super-triangle vertices appended at indices n, n+1, n+2 (then stripped).
  const pts: Array<[number, number]> = [
    ...(points as Array<[number, number]>),
    [midx - delta, midy - delta],
    [midx, midy + delta],
    [midx + delta, midy - delta],
  ];

  type Tri = { a: number; b: number; c: number };
  let tris: Tri[] = [{ a: n, b: n + 1, c: n + 2 }];

  // True when point p lies inside the circumcircle of triangle (a,b,c).
  const inCircle = (
    p: readonly [number, number],
    a: readonly [number, number],
    b: readonly [number, number],
    c: readonly [number, number],
  ): boolean => {
    const dxp = a[0] - p[0];
    const dyp = a[1] - p[1];
    const dxq = b[0] - p[0];
    const dyq = b[1] - p[1];
    const dxr = c[0] - p[0];
    const dyr = c[1] - p[1];
    const ap = dxp * dxp + dyp * dyp;
    const bq = dxq * dxq + dyq * dyq;
    const cr = dxr * dxr + dyr * dyr;
    const det =
      dxp * (dyq * cr - dyr * bq) -
      dyp * (dxq * cr - dxr * bq) +
      ap * (dxq * dyr - dxr * dyq);
    const orient = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    // Cocircular points make det ≈ 0; floating-point sign noise then yields
    // overlapping triangles. Requiring det strictly past ±EPS is a consistent
    // perturbation that resolves cocircular ties into ONE valid triangulation.
    if (orient > 0) return det > EPS; // CCW triangle
    if (orient < 0) return det < -EPS; // CW triangle
    return false; // collinear triangle — never "inside"
  };

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const bad: Tri[] = [];
    const good: Tri[] = [];
    for (const t of tris) {
      if (inCircle(p, pts[t.a], pts[t.b], pts[t.c])) bad.push(t);
      else good.push(t);
    }
    // Hole boundary = edges appearing in exactly one bad triangle. Map stores an
    // edge on first sight, deletes it on second (interior edges are shared twice).
    const edge = new Map<string, [number, number]>();
    const addEdge = (u: number, v: number) => {
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      if (edge.has(key)) edge.delete(key);
      else edge.set(key, [u, v]);
    };
    for (const t of bad) {
      addEdge(t.a, t.b);
      addEdge(t.b, t.c);
      addEdge(t.c, t.a);
    }
    for (const [, [u, v]] of edge) good.push({ a: u, b: v, c: i });
    tris = good;
  }

  // Keep only triangles whose vertices are all real input points; drop degenerate.
  const out: Array<[number, number, number]> = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    const a = pts[t.a];
    const b = pts[t.b];
    const c = pts[t.c];
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    if (area < 1e-12) continue;
    out.push([t.a, t.b, t.c]);
  }
  return out;
}

/**
 * Returns the boundary (convex-hull) edges of a triangulation as vertex-index
 * pairs `[u, v]` — edges that belong to exactly one triangle. Used to extrude a
 * "skirt" wall from the membrane's footprint down to a baseline.
 */
export function hullEdges(
  tris: ReadonlyArray<readonly [number, number, number]>,
): Array<[number, number]> {
  const edge = new Map<string, [number, number]>();
  const addEdge = (u: number, v: number) => {
    const key = u < v ? `${u}:${v}` : `${v}:${u}`;
    if (edge.has(key)) edge.delete(key);
    else edge.set(key, [u, v]);
  };
  for (const [a, b, c] of tris) {
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  return [...edge.values()];
}
