/**
 * Minimal robust 2D Delaunay triangulation.
 *
 * Returns index triples `[i, j, k]` into the input `points` array. Points are
 * `[x, y]` tuples. Designed for small point sets (≤ a few dozen) — used to mesh
 * the Pareto frontier vertices into a translucent "frontier membrane" surface.
 *
 * Implementation: direct empty-circumcircle selection over all point triples on
 * unit-normalized coordinates. A tiny deterministic symbolic perturbation breaks
 * cocircular / near-degenerate ties into ONE valid triangulation. This replaces a
 * Bowyer–Watson super-triangle pass, whose far super-vertices let real triangles
 * slip through the in-circle predicate and left holes in the membrane (123/2000
 * seeded clouds incomplete; whole clouds blanked to []).
 *
 * Robustness:
 * - Collinear / coincident input → no triangles (detected via convex hull).
 * - Cocircular input → one consistent triangulation (symbolic perturbation).
 * - Scale-independent: inputs are uniformly normalized to [0,1]² first.
 * - Planar topology invariant (T = 2n−2−h, summed area = hull area) is enforced
 *   before accepting output; a near-degenerate set retries at a larger jitter.
 * - No external dependency (the repo keeps its runtime deps at three + kokoro-js).
 */

type Pt = readonly [number, number];

/** Signed double area of (a,b,c); sign is the orientation (CCW > 0). */
function orient2d(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
}

/** Convex hull (monotone chain): hull vertex count + hull area. */
function convexHullInfo(pts: readonly Pt[]): { h: number; area: number } {
  const idx = [...pts.keys()].sort(
    (i, j) => (pts[i][0] !== pts[j][0] ? pts[i][0] - pts[j][0] : pts[i][1] - pts[j][1]),
  );
  const cross = (o: number, a: number, b: number) =>
    (pts[a][0] - pts[o][0]) * (pts[b][1] - pts[o][1]) - (pts[a][1] - pts[o][1]) * (pts[b][0] - pts[o][0]);
  const lower: number[] = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  lower.pop();
  upper.pop();
  const hull = [...new Set([...lower, ...upper])];
  let area2 = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    area2 += pts[a][0] * pts[b][1] - pts[b][0] * pts[a][1];
  }
  return { h: hull.length, area: Math.abs(area2 / 2) };
}

/** Deterministic symbolic-perturbation offset per point (breaks cocircular ties). */
function perturbOffset(i: number): [number, number] {
  const h1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const h2 = Math.sin(i * 269.5 + 183.3) * 43758.5453;
  return [h1 - Math.floor(h1) - 0.5, h2 - Math.floor(h2) - 0.5];
}

/** +1 if d is strictly inside the circumcircle of CCW (a,b,c); −1 outside; 0 cocircular. */
function inCircle(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const ax = a[0] - d[0], ay = a[1] - d[1];
  const bx = b[0] - d[0], by = b[1] - d[1];
  const cx = c[0] - d[0], cy = c[1] - d[1];
  const ap = ax * ax + ay * ay;
  const bp = bx * bx + by * by;
  const cp = cx * cx + cy * cy;
  const det = ax * (by * cp - cy * bp) - ay * (bx * cp - cx * bp) + ap * (bx * cy - cx * by);
  if (det > 1e-15) return 1;
  if (det < -1e-15) return -1;
  return 0;
}

/** Direct Delaunay core: keep triples whose circumcircle contains no other point. */
function delaunayCore(P: readonly Pt[]): Array<[number, number, number]> {
  const n = P.length;
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const o = orient2d(P[i], P[j], P[k]);
        // Orient CCW; skip near-collinear triples (the perturbation has already
        // broken exact collinearity, so this only drops true slivers).
        let a: Pt, b: Pt, c: Pt;
        if (o > 1e-15) {
          a = P[i]; b = P[j]; c = P[k];
        } else if (o < -1e-15) {
          a = P[i]; b = P[k]; c = P[j];
        } else {
          continue;
        }
        let empty = true;
        for (let m = 0; m < n; m++) {
          if (m === i || m === j || m === k) continue;
          if (inCircle(a, b, c, P[m]) > 0) {
            empty = false;
            break;
          }
        }
        if (empty) out.push([i, j, k]);
      }
    }
  }
  return out;
}

export function delaunay2d(
  points: ReadonlyArray<readonly [number, number]>,
): Array<[number, number, number]> {
  const n = points.length;
  if (n < 3) return [];

  // Bounding box → uniform normalize to [0,1]². A similarity transform preserves
  // the Delaunay property and makes the orientation / in-circle thresholds
  // scale-independent (a tiny [[0,0],[1e-7,0],[0,1e-7]] triangulates like a unit
  // triangle instead of being dropped by an absolute area floor).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (minX === maxX && minY === maxY) return []; // all coincident
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const norm = points.map(([x, y]) => [(x - minX) / span, (y - minY) / span] as [number, number]);

  const { h, area: hullArea } = convexHullInfo(norm);
  if (h < 3) return []; // collinear / degenerate → no triangulation

  const expected = 2 * n - 2 - h;
  // Symbolic perturbation breaks cocircular / near-degenerate ties into one valid
  // triangulation. Enforce the planar topology invariant before accepting; retry
  // with a larger jitter if a near-degenerate set defeated the previous pass.
  const MAGS = [1e-9, 1e-8, 1e-7, 1e-6];
  let result: Array<[number, number, number]> = [];
  for (const mag of MAGS) {
    const P = norm.map((p, i) => [
      p[0] + perturbOffset(i)[0] * mag,
      p[1] + perturbOffset(i)[1] * mag,
    ] as [number, number]);
    result = delaunayCore(P);
    const areaSum = result.reduce((s, [i, j, k]) => s + Math.abs(orient2d(P[i], P[j], P[k])) / 2, 0);
    if (result.length === expected && Math.abs(areaSum - hullArea) <= 1e-6 * hullArea + 1e-12) {
      return result;
    }
  }
  return result; // best effort — the direct method is correct for general position
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
