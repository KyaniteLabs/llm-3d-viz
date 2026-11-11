/**
 * The landscape stage: a 3D wireframe scene drawn on a plain 2D canvas, plus the linked
 * price x intelligence projection. No WebGL and no third-party library: the marks are lines
 * and circles (as in the web app's stage), so a small perspective camera and a depth sort are
 * enough, and the plugin bundle stays small and readable.
 *
 * Camera and look follow src/viz/stage3d-three.ts: cube [-1, 1], 42 degree field of view,
 * default eye (-2.35, 1.55, 2.15) looking at the origin, orbit with the same polar and
 * distance limits, ink ground, hairline grid, mono uppercase axis labels, closed weights as
 * wire spheres. Frontier = wire sphere on a filament ridge; dominated = small ring;
 * shortlist pick = diamond bracket; focus = copper ring. Motion is drag-driven only: no idle
 * spin, and with reduced motion the camera stops the moment the pointer does.
 */
import { FONT_MONO } from './palette.js'
import { decadeTicks, fmtPriceTick, fmtTokens, floorPosition, Z_SPEED } from './frontier.js'

const FOV = (42 * Math.PI) / 180
const MIN_POL = 0.18
const MAX_POL = Math.PI / 2 - 0.04
const MIN_DIST = 1.6
const MAX_DIST = 7
const EYE0 = [-2.35, 1.55, 2.15]
const DIST0 = Math.hypot(...EYE0)
const VIEW0 = { az: Math.atan2(EYE0[0], EYE0[2]), pol: Math.acos(EYE0[1] / DIST0), dist: DIST0 }
const EYE_FLOOR_Y = 0.15
const DAMPING = 0.08

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

export function defaultView() { return { ...VIEW0 } }

/** Eye position for an orbit state, never below the floor of the cube (as the web stage). */
export function eyeOf(view) {
  const sp = Math.sin(view.pol)
  const e = [view.dist * sp * Math.sin(view.az), view.dist * Math.cos(view.pol), view.dist * sp * Math.cos(view.az)]
  if (e[1] < EYE_FLOOR_Y) e[1] = EYE_FLOOR_Y
  return e
}

/** A projector for the 3D view: world point -> {x, y, depth, k}; k is size relative to the default distance. */
export function makeProjector3d(view, width, height) {
  const eye = eyeOf(view)
  const f = norm([-eye[0], -eye[1], -eye[2]])
  const r = norm(cross(f, [0, 1, 0]))
  const u = cross(r, f)
  const focal = (0.5 * Math.min(height * 0.68, width * 0.6)) / Math.tan(FOV / 2)
  const cx = width / 2, cy = height * 0.45
  const fn = p => {
    const v = sub(p, eye)
    const zc = Math.max(dot(v, f), 0.01)
    return { x: cx + (dot(v, r) / zc) * focal, y: cy - (dot(v, u) / zc) * focal, depth: zc, k: DIST0 / zc }
  }
  fn.eye = eye
  return fn
}

/** The 2D view: x, y of the cube map to a plot rectangle; depth is ignored. */
export function makeProjector2d(width, height) {
  const m = { l: 74, r: 26, t: 30, b: 62 }
  const w = Math.max(width - m.l - m.r, 10), h = Math.max(height - m.t - m.b, 10)
  const fn = p => ({ x: m.l + ((p[0] + 1) / 2) * w, y: m.t + (1 - (p[1] + 1) / 2) * h, depth: 0, k: 1 })
  fn.rect = { l: m.l, t: m.t, w, h }
  return fn
}

function setFont(ctx, px, weight = 400) { ctx.font = `${weight} ${px}px ${FONT_MONO}` }
function spaced(ctx, v) { if ('letterSpacing' in ctx) ctx.letterSpacing = v }

export class Stage {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.handlers = handlers
    this.state = null
    this.view = defaultView()
    this.width = 0
    this.height = 0
    this.dpr = 1
    this.hits = []
    this.vel = { az: 0, pol: 0 }
    this.raf = 0
    this.dragging = null
    this.reduced = false
    this.disposers = []
    this.bind()
  }

  bind() {
    const c = this.canvas
    const on = (t, ev, fn, opts) => { t.addEventListener(ev, fn, opts); this.disposers.push(() => t.removeEventListener(ev, fn, opts)) }
    on(c, 'pointerdown', e => {
      if (this.state && this.state.view === '3d') {
        this.dragging = { x: e.clientX, y: e.clientY, moved: false }
        this.vel = { az: 0, pol: 0 }
        try { c.setPointerCapture(e.pointerId) } catch (_) { /* synthetic events have no capture */ }
      } else this.dragging = { x: e.clientX, y: e.clientY, moved: false, flat: true }
    })
    on(c, 'pointermove', e => {
      const d = this.dragging
      if (d && !d.flat) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y
        d.x = e.clientX; d.y = e.clientY
        if (Math.abs(dx) + Math.abs(dy) > 0) d.moved = true
        this.rotate(-dx * 0.008, -dy * 0.008, true)
        return
      }
      this.hover(this.pick(e))
    })
    on(c, 'pointerup', e => {
      const d = this.dragging
      this.dragging = null
      try { c.releasePointerCapture(e.pointerId) } catch (_) { /* see pointerdown */ }
      if (d && !d.moved && this.handlers.onSelect) this.handlers.onSelect(this.pick(e))
      else if (d && d.moved && !this.reduced) this.coast()
    })
    on(c, 'pointerleave', () => { if (!this.dragging) this.hover(null) })
    on(c, 'wheel', e => {
      if (!this.state || this.state.view !== '3d') return
      e.preventDefault()
      this.zoom(Math.exp(e.deltaY * 0.0012))
    }, { passive: false })
    on(c, 'keydown', e => {
      const step = 0.12
      const k = e.key
      if (!this.state || this.state.view !== '3d') return
      if (k === 'ArrowLeft') this.rotate(-step, 0)
      else if (k === 'ArrowRight') this.rotate(step, 0)
      else if (k === 'ArrowUp') this.rotate(0, -step)
      else if (k === 'ArrowDown') this.rotate(0, step)
      else if (k === '+' || k === '=') this.zoom(0.88)
      else if (k === '-' || k === '_') this.zoom(1.14)
      else if (k === '0' || k === 'Home') this.resetView()
      else return
      e.preventDefault()
    })
  }

  update(state) {
    this.state = state
    this.reduced = !!state.reducedMotion
    this.draw()
  }

  resize(width, height, dpr = 1) {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.dpr = dpr
    this.canvas.width = Math.floor(this.width * dpr)
    this.canvas.height = Math.floor(this.height * dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.draw()
  }

  hover(id) {
    if (this.state && this.state.hoverId !== id && this.handlers.onHover) this.handlers.onHover(id)
  }

  rotate(dAz, dPol, live = false) {
    this.view.az += dAz
    this.view.pol = clamp(this.view.pol + dPol, MIN_POL, MAX_POL)
    if (live) this.vel = { az: dAz, pol: dPol }
    this.draw()
  }

  zoom(f) {
    this.view.dist = clamp(this.view.dist * f, MIN_DIST, MAX_DIST)
    this.draw()
  }

  resetView() { this.view = defaultView(); this.vel = { az: 0, pol: 0 }; this.draw() }

  /** Drag inertia, the web stage's damping 0.08. Runs only after a drag and stops by itself. */
  coast() {
    if (this.raf || this.reduced) return
    const step = () => {
      this.raf = 0
      this.vel.az *= 1 - DAMPING * 2
      this.vel.pol *= 1 - DAMPING * 2
      if (Math.abs(this.vel.az) + Math.abs(this.vel.pol) < 1e-4 || this.reduced) return
      this.view.az += this.vel.az
      this.view.pol = clamp(this.view.pol + this.vel.pol, MIN_POL, MAX_POL)
      this.draw()
      this.raf = requestAnimationFrame(step)
    }
    this.raf = requestAnimationFrame(step)
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    for (const d of this.disposers.splice(0)) d()
  }

  /** The id of the mark nearest to a pointer event, within its radius plus a margin. */
  pick(e) {
    const r = this.canvas.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    let best = null, bestScore = Infinity
    for (const h of this.hits) {
      const d = Math.hypot(h.x - x, h.y - y)
      if (d <= h.r + 6 && d - h.depth * 0.001 < bestScore) { best = h.id; bestScore = d - h.depth * 0.001 }
    }
    return best
  }

  /** Screen position of a point id (used to place the focus label and by tests). */
  screenOf(id) { return this.hits.find(h => h.id === id) || null }

  draw() {
    const s = this.state
    if (!s || !this.width) return
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    const pal = s.palette
    ctx.fillStyle = pal.ground
    ctx.fillRect(0, 0, this.width, this.height)
    this.hits = []
    if (!s.layout || !s.layout.points.length) return
    if (s.view === '3d') this.draw3d(ctx, s, pal)
    else this.draw2d(ctx, s, pal)
  }

  /* ---------------------------------------------------------------- 3D */

  draw3d(ctx, s, pal) {
    const P = makeProjector3d(this.view, this.width, this.height)
    const { domains } = s.layout
    const sx = P.eye[0] >= 0 ? 1 : -1, sz = P.eye[2] >= 0 ? 1 : -1
    const line = (a, b, color, w = 1, dash = null) => {
      const p = P(a), q = P(b)
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y)
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.stroke()
    }
    const ticks = {
      x: decadeTicks(domains.x.lo, domains.x.hi), z: decadeTicks(domains.z.lo, domains.z.hi),
      y: yTicks(domains.y),
    }
    const pos = (v, d, log) => (log ? (Math.log(v) - Math.log(d.lo)) / (Math.log(d.hi) - Math.log(d.lo)) : (v - d.lo) / (d.hi - d.lo)) * 2 - 1
    // grid on the floor and the two walls behind the data
    for (const t of ticks.x) { const x = pos(t, domains.x, true); line([x, -1, -1], [x, -1, 1], pal.grid); line([x, -1, -sz], [x, 1, -sz], pal.grid) }
    for (const t of ticks.z) { const z = pos(t, domains.z, true); line([-1, -1, z], [1, -1, z], pal.grid); line([-sx, -1, z], [-sx, 1, z], pal.grid) }
    for (const t of ticks.y) { const y = pos(t, domains.y, false); line([-sx, y, -1], [-sx, y, 1], pal.grid); line([-1, y, -sz], [1, y, -sz], pal.grid) }
    // cube edges
    const c = (i, j, k) => [i, j, k]
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      line(c(-1, a, b), c(1, a, b), pal.axis, 1)
      line(c(a, -1, b), c(a, 1, b), pal.axis, 1)
      line(c(a, b, -1), c(a, b, 1), pal.axis, 1)
    }
    // intelligence floor: a plane with cross-hatch, drawn behind the marks
    const fy = floorPosition(domains, s.floor)
    if (fy !== null) this.drawFloor3d(ctx, P, fy, pal, s.floor)
    // labels on the edges nearest the viewer
    setFont(ctx, 11); spaced(ctx, '0.06em'); ctx.fillStyle = pal.muted; ctx.textBaseline = 'middle'
    const label = (p, text, align = 'center') => {
      const q = P(p), tw = ctx.measureText(text).width
      const lo = align === 'right' ? tw : align === 'center' ? tw / 2 : 0
      const hi = align === 'left' ? tw : align === 'center' ? tw / 2 : 0
      ctx.textAlign = align
      ctx.fillText(text, Math.min(Math.max(q.x, 6 + lo), this.width - 6 - hi), q.y)
    }
    for (const t of ticks.x) label([pos(t, domains.x, true), -1, sz * 1.12], fmtPriceTick(t))
    for (const t of ticks.z) label([sx * 1.12, -1, pos(t, domains.z, true)], fmtTokens(t), sx < 0 ? 'right' : 'left')
    for (const t of ticks.y) label([sx * 1.04, pos(t, domains.y, false), sz * 1.04], String(t), sx < 0 ? 'right' : 'left')
    ctx.fillStyle = pal.text
    label([0, -1, sz * 1.7], (s.layout.priceTitle || 'PRICE $/M · LOG'))
    label([sx * 1.4, -1, 0], zTitle(s.layout.z), sx < 0 ? 'right' : 'left')
    label([sx * 1.04, 1.12, sz * 1.04], 'INTELLIGENCE 0-100', sx < 0 ? 'right' : 'left')
    this.drawMarks(ctx, s, pal, P, true)
  }

  drawFloor3d(ctx, P, y, pal, value) {
    const corners = [[-1, y, -1], [1, y, -1], [1, y, 1], [-1, y, 1]].map(P)
    ctx.beginPath(); corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath()
    ctx.strokeStyle = pal.floor; ctx.lineWidth = 1.25; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([])
    ctx.save(); ctx.clip()
    ctx.strokeStyle = pal.floor; ctx.globalAlpha = 0.35; ctx.lineWidth = 1
    for (let i = -10; i <= 10; i++) {
      const t = i / 10
      const a = P([-1, y, t]), b = P([1, y, t]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      const c = P([t, y, -1]), d = P([t, y, 1]); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke()
    }
    ctx.restore()
    const tag = P([1, y, 1])
    setFont(ctx, 11, 500); spaced(ctx, '0.08em'); ctx.fillStyle = pal.text; ctx.textBaseline = 'bottom'
    const left = tag.x > this.width - 110
    ctx.textAlign = left ? 'right' : 'left'
    ctx.fillText(`FLOOR · ${value}`, tag.x + (left ? -6 : 6), tag.y - 3)
  }

  /* ---------------------------------------------------------------- 2D */

  draw2d(ctx, s, pal) {
    const P = makeProjector2d(this.width, this.height)
    const { l, t, w, h } = P.rect
    const { domains } = s.layout
    const xs = decadeTicks(domains.x.lo, domains.x.hi), ys = yTicks(domains.y)
    const px = v => l + ((Math.log(v) - Math.log(domains.x.lo)) / (Math.log(domains.x.hi) - Math.log(domains.x.lo))) * w
    const py = v => t + h - ((v - domains.y.lo) / (domains.y.hi - domains.y.lo)) * h
    ctx.lineWidth = 1; ctx.strokeStyle = pal.grid; ctx.setLineDash([])
    for (const v of xs) { ctx.beginPath(); ctx.moveTo(px(v), t); ctx.lineTo(px(v), t + h); ctx.stroke() }
    for (const v of ys) { ctx.beginPath(); ctx.moveTo(l, py(v)); ctx.lineTo(l + w, py(v)); ctx.stroke() }
    ctx.strokeStyle = pal.axis
    ctx.beginPath(); ctx.moveTo(l, t); ctx.lineTo(l, t + h); ctx.lineTo(l + w, t + h); ctx.stroke()
    setFont(ctx, 11); spaced(ctx, '0.06em'); ctx.fillStyle = pal.muted
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    for (const v of xs) ctx.fillText(fmtPriceTick(v), px(v), t + h + 8)
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (const v of ys) ctx.fillText(String(v), l - 8, py(v))
    ctx.fillStyle = pal.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText((s.layout.priceTitle || 'PRICE $/M · LOG'), l + w / 2, t + h + 30)
    ctx.save(); ctx.translate(18, t + h / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'top'
    ctx.fillText('INTELLIGENCE 0-100', 0, 0); ctx.restore()
    if (typeof s.floor === 'number' && s.floor >= domains.y.lo && s.floor <= domains.y.hi) {
      const y = py(s.floor)
      ctx.setLineDash([6, 4]); ctx.strokeStyle = pal.floor; ctx.lineWidth = 1.25
      ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(l + w, y); ctx.stroke(); ctx.setLineDash([])
      setFont(ctx, 11, 500); spaced(ctx, '0.08em'); ctx.fillStyle = pal.text; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
      ctx.fillText(`FLOOR · ${s.floor}`, l + w - 4, y - 3)
    }
    this.drawMarks(ctx, s, pal, P, false)
  }

  /* ---------------------------------------------------------------- marks */

  drawMarks(ctx, s, pal, P, is3d) {
    const { layout, picks, floor } = s
    const proj = layout.points.map(pt => ({ pt, q: P([pt.px, pt.py, is3d ? pt.pz : 0]) }))
    const ridge = proj.filter(o => o.pt.front).sort((a, b) => a.pt.m.c - b.pt.m.c || a.pt.m.i - b.pt.m.i)
    ctx.setLineDash([])
    if (ridge.length > 1) {
      ctx.beginPath(); ridge.forEach((o, i) => (i ? ctx.lineTo(o.q.x, o.q.y) : ctx.moveTo(o.q.x, o.q.y)))
      ctx.strokeStyle = pal.frontier; ctx.lineWidth = 1.75; ctx.lineJoin = 'round'; ctx.stroke()
    }
    // far to near, so near marks cover far ones
    const order = proj.slice().sort((a, b) => b.q.depth - a.q.depth)
    let active = null
    for (const o of order) {
      const { pt, q } = o
      const isPick = picks && picks.has(pt.id)
      const under = typeof floor === 'number' && pt.m.i < floor
      const r = (pt.front ? 6 : 3.4) * (is3d ? clamp(q.k, 0.55, 1.9) : 1)
      this.hits.push({ id: pt.id, x: q.x, y: q.y, r: Math.max(r, 5), depth: q.depth })
      if (pt.id === s.highlightId) { active = o; }
      if (pt.front) drawSphere(ctx, q.x, q.y, r, under ? pal.below : pal.frontier)
      else drawRing(ctx, q.x, q.y, r, under ? pal.below : pal.dominated)
      if (isPick) drawDiamond(ctx, q.x, q.y, r + 6, pal.frontier)
    }
    if (active) {
      const { pt, q } = active
      const r = (pt.front ? 6 : 3.4) * (is3d ? clamp(q.k, 0.55, 1.9) : 1)
      ctx.beginPath(); ctx.arc(q.x, q.y, r + 8, 0, Math.PI * 2)
      ctx.strokeStyle = pal.copper; ctx.lineWidth = 2; ctx.stroke()
      // The tag must not hide a front or pick mark: try above, below, then the two sides.
      const keep = order.filter(o => o !== active && (o.pt.front || (picks && picks.has(o.pt.id)))).map(o => o.q)
      drawTag(ctx, q.x, q.y, r, pt.m.n, pal, this.width, this.height, keep)
    }
  }
}

function drawRing(ctx, x, y, r, color) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.stroke()
}

/** A closed-weight wire sphere: the outline and the two great circles, as in mark-encoding.ts. */
function drawSphere(ctx, x, y, r, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.3
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.38, r, 0, 0, Math.PI * 2); ctx.stroke()
}

function drawDiamond(ctx, x, y, r, color) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath()
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke()
}

export function drawTag(ctx, x, y, r, text, pal, width, height, keep = []) {
  setFont(ctx, 11, 500); spaced(ctx, '0.02em')
  const w = ctx.measureText(text).width + 12, th = 18, gap = r + 10
  const fit = (left, top) => [clamp(left, 4, Math.max(4, width - w - 4)), clamp(top, 4, Math.max(4, (height || Infinity) - th - 4))]
  const spots = [
    fit(x - w / 2, y - gap - th), fit(x - w / 2, y + gap),
    fit(x + gap, y - th / 2), fit(x - gap - w, y - th / 2),
  ]
  const clear = ([left, top]) => keep.every(k => k.x < left - 10 || k.x > left + w + 10 || k.y < top - 10 || k.y > top + th + 10)
  const [left, top] = spots.find(clear) || spots[0]
  ctx.fillStyle = pal.panelRaised
  ctx.fillRect(left, top, w, th)
  ctx.strokeStyle = pal.hair; ctx.lineWidth = 1; ctx.strokeRect(left + 0.5, top + 0.5, w - 1, th - 1)
  ctx.fillStyle = pal.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText(text, left + 6, top + th / 2)
}

export function yTicks(d) {
  const out = []
  const step = d.hi - d.lo > 60 ? 20 : 10
  for (let v = Math.ceil(d.lo / step) * step; v <= d.hi; v += step) out.push(v)
  return out
}

export function zTitle(z) {
  return z === Z_SPEED ? 'SPEED TOK/S · MEASURED LOCALLY · LOG' : 'CONTEXT WINDOW TOKENS · LOG'
}
