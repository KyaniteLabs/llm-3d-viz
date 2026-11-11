/**
 * Pure data logic for the landscape pane: which models are plotted, where they sit, and
 * which ones are on the cost x intelligence front. No DOM, no React, so it runs in Node
 * tests. The front is the same sweep as decide.py's cost_intelligence_pareto (and
 * src/lib/decide.ts): a model is on it when no model that costs the same or less is at
 * least as smart and strictly better on one of the two.
 */

/** Smallest positive value halved: where a $0 (free tier or prepaid) model sits on a log axis. */
export function priceEpsilon(models, cost = m => m.c) {
  let lo = Infinity
  for (const m of models) { const v = cost(m); if (v > 0 && v < lo) lo = v }
  return Number.isFinite(lo) ? lo / 2 : 0.01
}

/**
 * The cost x intelligence front, cheapest first. Sort by price; within one price keep the
 * smartest; a price group enters the front only when it beats every cheaper model.
 * Raw prices are compared (a $0 model is cheaper than any priced one), not the plotted epsilon.
 */
export function costIntelligenceFront(models, cost = m => m.c, intel = m => m.i) {
  const valid = models.filter(m => Number.isFinite(cost(m)) && Number.isFinite(intel(m)) && cost(m) >= 0 && intel(m) >= 0)
  const sorted = valid.slice().sort((a, b) => cost(a) - cost(b))
  const keep = []
  let bestCheaper = -Infinity
  let j = 0
  while (j < sorted.length) {
    let k = j
    while (k < sorted.length && cost(sorted[k]) === cost(sorted[j])) k++
    let top = -Infinity
    for (let n = j; n < k; n++) top = Math.max(top, intel(sorted[n]))
    if (top > bestCheaper) for (let n = j; n < k; n++) if (intel(sorted[n]) === top) keep.push(sorted[n])
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

/* ---- the X axis: price per million tokens, or cost, time or tokens per task -------------- */

export const X_PRICE = 'price'
export const X_TASK_COST = 'task_cost'
export const X_TASK_TIME = 'task_time'
export const X_TASK_TOKENS = 'task_tokens'
export const X_MODES = [X_PRICE, X_TASK_COST, X_TASK_TIME, X_TASK_TOKENS]

function pos(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 }

/**
 * A model's X value, lower is better, or null when it has none (never estimated).
 *   price: blended $/M (list or your plan's, whichever the snapshot carries).
 *   task_cost: median input tokens x input price + median output tokens x output price, in $.
 *     A plan price covers both directions; with no input/output split the blend is used.
 *   task_time: median model seconds per task (API time; tool time left out).
 *   task_tokens: median input + output tokens per task.
 * Task values come from `tasks` ({slug: {n, in, out, sec}}, measured locally).
 */
export function xValue(m, xMode, tasks) {
  if (xMode === X_PRICE || !xMode) return pos(m.c) ? m.c : null
  const t = tasks && Object.prototype.hasOwnProperty.call(tasks, m.s) ? tasks[m.s] : null
  if (!t || !pos(t.in) || !pos(t.out)) return null
  if (xMode === X_TASK_TOKENS) return t.in + t.out > 0 ? t.in + t.out : null
  if (xMode === X_TASK_TIME) return pos(t.sec) && t.sec > 0 ? t.sec : null
  if (xMode === X_TASK_COST) {
    if (!pos(m.c)) return null
    const split = !m.mp && pos(m.ci) && pos(m.co)
    const ci = split ? m.ci : m.c, co = split ? m.co : m.c
    return (t.in * ci + t.out * co) / 1e6
  }
  return null
}

/** How many snapshot models have per-task numbers. */
export function taskCount(snapshot, tasks) {
  if (!tasks || typeof tasks !== 'object') return 0
  return snapshot.models.filter(m => xValue(m, X_TASK_TOKENS, tasks) !== null).length
}

export function fmtUsd(v) {
  if (!Number.isFinite(v)) return '?'
  if (v === 0) return '$0'
  if (v < 0.01) return `$${Number(v.toPrecision(2))}`
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Dollars per task; a $0 task says why: a prepaid plan, or a free-tier list price. */
export function fmtTaskCost(v, m) {
  if (v === 0) return m && m.mp ? '$0 (prepaid)' : '$0 (free tier)'
  return fmtUsd(v)
}

export function fmtSeconds(v) {
  if (!Number.isFinite(v)) return '?'
  if (v < 1) return `${Number(v.toPrecision(2))} s`
  if (v < 120) return `${Number(v.toPrecision(3))} s`
  return `${Number((v / 60).toPrecision(3))} min`
}

/** Axis title and tick formatter for an X mode; `mine` marks plan prices. */
export function xAxis(xMode, mine) {
  const who = mine ? 'YOUR ' : ''
  if (xMode === X_TASK_COST) return { title: `${who}COST PER TASK $ · LOG`, tick: fmtUsd, value: fmtTaskCost }
  if (xMode === X_TASK_TIME) return { title: 'MODEL TIME PER TASK · LOG', tick: v => fmtSeconds(v).replace(' ', ''), value: fmtSeconds }
  if (xMode === X_TASK_TOKENS) return { title: 'TOKENS PER TASK · LOG', tick: fmtTokens, value: v => `${fmtTokens(v)} tokens` }
  return { title: mine ? 'YOUR PRICE $/M · LOG' : 'PRICE $/M · LOG', tick: fmtPriceTick, value: fmtPrice }
}

function decadeFloor(v) { return Math.pow(10, Math.floor(Math.log10(v) + 1e-9)) }
function decadeCeil(v) { return Math.pow(10, Math.ceil(Math.log10(v) - 1e-9)) }

/** Decade ticks from lo to hi (both powers of ten). */
export function decadeTicks(lo, hi) {
  const out = []
  for (let v = lo, n = 0; v <= hi * 1.0000001 && n < 24; v *= 10, n++) out.push(v)
  return out
}

/**
 * Which tick labels to draw so none touch: boxes are {l, r, t, b} in screen pixels, in axis
 * order. Greedy: keep each label clear by at least gap px of every reserved box (axis titles,
 * always drawn) and of every label already kept.
 * Returns the kept indices. When an axis is foreshortened (a steep 3D angle, a narrow Speed
 * range), labels thin out instead of printing over each other.
 */
export function keepApart(boxes, gap = 4, reserved = []) {
  const apart = (b, k) => b.l >= k.r + gap || k.l >= b.r + gap || b.t >= k.b + gap || k.t >= b.b + gap
  const kept = []
  boxes.forEach((b, i) => {
    if (reserved.every(k => apart(b, k)) && kept.every(j => apart(b, boxes[j]))) kept.push(i)
  })
  return kept
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
export function buildLayout(snapshot, { z = Z_CONTEXT, speed = null, x = X_PRICE, tasks = null } = {}) {
  const all = snapshot.models
  const withZ = []
  let missingZ = 0, missingX = 0
  for (const m of all) {
    const xv = xValue(m, x, tasks)
    if (xv === null) { missingX++; continue }
    const zv = zValue(m, z, speed)
    if (zv === null) missingZ++
    else withZ.push({ m, xv, zv })
  }
  const eps = priceEpsilon(withZ, p => p.xv)
  const front = new Set(costIntelligenceFront(withZ, p => p.xv, p => p.m.i).map(p => p.m.s))
  if (!withZ.length) {
    return { points: [], front: [], domains: null, plotted: 0, missingZ, missingX, eps, z, x }
  }
  const price = withZ.map(p => Math.max(p.xv, eps))
  const xLo = decadeFloor(Math.min(...price)), xHi = Math.max(decadeCeil(Math.max(...price)), xLo * 10)
  const ints = withZ.map(p => p.m.i)
  const yLo = Math.floor(Math.min(...ints) / 10) * 10, yHi = Math.max(Math.ceil(Math.max(...ints) / 10) * 10, yLo + 10)
  const zs = withZ.map(p => p.zv)
  const zLo = decadeFloor(Math.min(...zs)), zHi = Math.max(decadeCeil(Math.max(...zs)), zLo * 10)
  const domains = { x: { lo: xLo, hi: xHi }, y: { lo: yLo, hi: yHi }, z: { lo: zLo, hi: zHi } }
  const points = withZ.map(({ m, xv, zv }, idx) => ({
    id: m.s,
    index: idx,
    m,
    xv,
    zv,
    free: m.c === 0 && !m.mp,
    front: front.has(m.s),
    px: logNorm(Math.max(xv, eps), xLo, xHi) * 2 - 1,
    py: ((m.i - yLo) / (yHi - yLo)) * 2 - 1,
    pz: logNorm(zv, zLo, zHi) * 2 - 1,
  }))
  const frontPoints = points.filter(p => p.front).sort((a, b) => a.xv - b.xv || a.m.i - b.m.i)
  return { points, front: frontPoints, domains, plotted: points.length, missingZ, missingX, eps, z, x }
}

/** Where an intelligence floor sits on the y axis, or null when it is outside the domain. */
export function floorPosition(domains, floor) {
  if (!domains || typeof floor !== 'number' || !Number.isFinite(floor)) return null
  const { lo, hi } = domains.y
  if (floor < lo || floor > hi) return null
  return ((floor - lo) / (hi - lo)) * 2 - 1
}

/** The lowest-X front model that is no worse on X and at least as smart as `point`, or null. */
export function beatenBy(point, front) {
  const xv = p => (typeof p.xv === 'number' ? p.xv : p.m.c)
  let best = null
  for (const f of front) {
    if (f.id === point.id) continue
    if (xv(f) <= xv(point) && f.m.i >= point.m.i && (xv(f) < xv(point) || f.m.i > point.m.i)) {
      if (!best || xv(f) < xv(best) || (xv(f) === xv(best) && f.m.i > best.m.i)) best = f
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

/** Plotted points whose name, slug or provider contains every word of the query, smartest first. */
export function findModels(points, query, limit = 8) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return { hits: [], total: 0 }
  const all = points.filter(p => {
    const hay = `${p.m.n} ${p.m.s} ${p.m.p || ''}`.toLowerCase()
    return words.every(w => hay.includes(w))
  }).sort((a, b) => b.m.i - a.m.i || a.m.n.localeCompare(b.m.n))
  return { hits: all.slice(0, limit), total: all.length }
}
