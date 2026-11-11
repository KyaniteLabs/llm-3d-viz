/**
 * Pure data logic for the landscape pane: which models are plotted, where they sit, and
 * which ones are on the cost x intelligence front. No DOM, no React, so it runs in Node
 * tests. The front is the same sweep as decide.py's cost_intelligence_pareto (and
 * src/lib/decide.ts): a model is on it when no model that costs the same or less is at
 * least as smart and strictly better on one of the two.
 */

/** Cheapest positive price halved: where a $0 (free tier) model sits on a log axis. */
export function priceEpsilon(models) {
  let lo = Infinity
  for (const m of models) if (m.c > 0 && m.c < lo) lo = m.c
  return Number.isFinite(lo) ? lo / 2 : 0.01
}

/**
 * The cost x intelligence front, cheapest first. Sort by price; within one price keep the
 * smartest; a price group enters the front only when it beats every cheaper model.
 * Raw prices are compared (a $0 model is cheaper than any priced one), not the plotted epsilon.
 */
export function costIntelligenceFront(models) {
  const valid = models.filter(m => Number.isFinite(m.c) && Number.isFinite(m.i) && m.c >= 0 && m.i >= 0)
  const sorted = valid.slice().sort((a, b) => a.c - b.c)
  const keep = []
  let bestCheaper = -Infinity
  let j = 0
  while (j < sorted.length) {
    let k = j
    while (k < sorted.length && sorted[k].c === sorted[j].c) k++
    let top = -Infinity
    for (let n = j; n < k; n++) top = Math.max(top, sorted[n].i)
    if (top > bestCheaper) for (let n = j; n < k; n++) if (sorted[n].i === top) keep.push(sorted[n])
    bestCheaper = Math.max(bestCheaper, top)
    j = k
  }
  return keep
}

export const Z_CONTEXT = 'context'
export const Z_SPEED = 'speed'

/** The third axis value of a model, or null when it has none (never estimated). */
export function zValue(m, zMode, speed) {
  if (zMode === Z_SPEED) {
    const s = speed && speed[m.s]
    const t = s && typeof s.tps === 'number' ? s.tps : null
    return t !== null && Number.isFinite(t) && t > 0 ? t : null
  }
  return Number.isFinite(m.x) && m.x > 0 ? m.x : null
}

function decadeFloor(v) { return Math.pow(10, Math.floor(Math.log10(v) + 1e-9)) }
function decadeCeil(v) { return Math.pow(10, Math.ceil(Math.log10(v) - 1e-9)) }

/** Decade ticks from lo to hi (both powers of ten). */
export function decadeTicks(lo, hi) {
  const out = []
  for (let v = lo, n = 0; v <= hi * 1.0000001 && n < 24; v *= 10, n++) out.push(v)
  return out
}

function logNorm(v, lo, hi) {
  const a = Math.log(lo), b = Math.log(hi)
  return b === a ? 0.5 : (Math.log(v) - a) / (b - a)
}

/**
 * Place the plottable models in the [-1, 1] cube.
 *   x = blended price (log), y = intelligence (linear), z = context window (log) or, when
 *   asked for and measured, tokens per second (log).
 * A model with no z value in the chosen mode is left out and counted, never given a guess.
 */
export function buildLayout(snapshot, { z = Z_CONTEXT, speed = null } = {}) {
  const all = snapshot.models
  const eps = priceEpsilon(all)
  const withZ = []
  let missingZ = 0
  for (const m of all) {
    const zv = zValue(m, z, speed)
    if (zv === null) missingZ++
    else withZ.push({ m, zv })
  }
  const front = new Set(costIntelligenceFront(withZ.map(p => p.m)).map(m => m.s))
  if (!withZ.length) {
    return { points: [], front: [], domains: null, plotted: 0, missingZ, eps, z }
  }
  const price = withZ.map(p => Math.max(p.m.c, eps))
  const xLo = decadeFloor(Math.min(...price)), xHi = Math.max(decadeCeil(Math.max(...price)), xLo * 10)
  const ints = withZ.map(p => p.m.i)
  const yLo = Math.floor(Math.min(...ints) / 10) * 10, yHi = Math.max(Math.ceil(Math.max(...ints) / 10) * 10, yLo + 10)
  const zs = withZ.map(p => p.zv)
  const zLo = decadeFloor(Math.min(...zs)), zHi = Math.max(decadeCeil(Math.max(...zs)), zLo * 10)
  const domains = { x: { lo: xLo, hi: xHi }, y: { lo: yLo, hi: yHi }, z: { lo: zLo, hi: zHi } }
  const points = withZ.map(({ m, zv }, idx) => ({
    id: m.s,
    index: idx,
    m,
    zv,
    free: m.c === 0 && !m.mp,
    front: front.has(m.s),
    px: logNorm(Math.max(m.c, eps), xLo, xHi) * 2 - 1,
    py: ((m.i - yLo) / (yHi - yLo)) * 2 - 1,
    pz: logNorm(zv, zLo, zHi) * 2 - 1,
  }))
  const frontPoints = points.filter(p => p.front).sort((a, b) => a.m.c - b.m.c || a.m.i - b.m.i)
  return { points, front: frontPoints, domains, plotted: points.length, missingZ, eps, z }
}

/** Where an intelligence floor sits on the y axis, or null when it is outside the domain. */
export function floorPosition(domains, floor) {
  if (!domains || typeof floor !== 'number' || !Number.isFinite(floor)) return null
  const { lo, hi } = domains.y
  if (floor < lo || floor > hi) return null
  return ((floor - lo) / (hi - lo)) * 2 - 1
}

/** The cheapest front model that costs no more and is at least as smart as `point`, or null. */
export function beatenBy(point, front) {
  let best = null
  for (const f of front) {
    if (f.id === point.id) continue
    if (f.m.c <= point.m.c && f.m.i >= point.m.i && (f.m.c < point.m.c || f.m.i > point.m.i)) {
      if (!best || f.m.c < best.m.c || (f.m.c === best.m.c && f.m.i > best.m.i)) best = f
    }
  }
  return best
}

/** Match the slugs or names the Python half remembered to plotted points. */
export function matchPicks(points, picks) {
  const want = new Set((picks || []).map(p => String(p).toLowerCase()))
  const out = new Set()
  for (const p of points) {
    if (want.has(p.m.s.toLowerCase()) || want.has(p.m.n.toLowerCase())) out.add(p.id)
  }
  return out
}

/* ---- number formatting (the same units chat answers print) --------------------------- */

export function fmtPrice(v) {
  if (!Number.isFinite(v)) return '?'
  if (v === 0) return '$0/M (free tier)'
  return v < 0.01 ? `$${Number(v.toPrecision(3))}/M` : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/M`
}

export function fmtPriceTick(v) {
  if (v >= 1) return `$${v.toLocaleString('en-US')}`
  return `$${Number(v.toPrecision(2))}`
}

export function fmtTokens(v) {
  if (!Number.isFinite(v)) return '?'
  if (v >= 1e6) return `${Number((v / 1e6).toPrecision(3))}M`
  if (v >= 1e3) return `${Number((v / 1e3).toPrecision(3))}K`
  return String(v)
}

export function fmtTps(v) {
  if (!Number.isFinite(v)) return '?'
  return v > 0 && v < 10 ? `${v.toFixed(1)} tok/s` : `${Math.round(v).toLocaleString('en-US')} tok/s`
}

export const PRICE_LIST = 'list'
export const PRICE_MINE = 'mine'

/**
 * The snapshot with your own prices in place of list prices, for the "My price" view.
 * `prices` is {slug: {usd_per_m, plan, mode}} from the Python half (my_prices.json, which
 * you write and which never ships). A covered model keeps its list price in `l` and its plan
 * in `mp`; an uncovered one is unchanged. Bad entries are ignored, never guessed.
 */
export function applyMyPrices(snapshot, prices) {
  if (!prices || typeof prices !== 'object') return { snapshot, covered: 0 }
  let covered = 0
  const models = snapshot.models.map(m => {
    const o = Object.prototype.hasOwnProperty.call(prices, m.s) ? prices[m.s] : null
    const c = o && typeof o.usd_per_m === 'number' && Number.isFinite(o.usd_per_m) && o.usd_per_m >= 0 ? o.usd_per_m : null
    if (c === null) return m
    covered++
    return { ...m, c, l: m.c, mp: { plan: String(o.plan || 'your plan').slice(0, 80), mode: String(o.mode || '') } }
  })
  return { snapshot: { ...snapshot, models }, covered }
}

/** A model's shown price: a prepaid ($0 marginal) plan reads "prepaid", never "free tier". */
export function fmtShownPrice(m) {
  if (m.mp && m.c === 0) return '$0/M (prepaid)'
  return fmtPrice(m.c)
}
