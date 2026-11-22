/**
 * The "Iolite: model landscape" pane. React is the only runtime dependency; the stage
 * (scene.js) and the data logic (frontier.js) know nothing about Hermes.
 */
import { createElement as h, useEffect, useMemo, useRef, useState } from 'react'
import * as SDK from '@hermes/plugin-sdk'
import interTight from '../../../../src/fonts/inter-tight-400-latin.woff2'
import plexMono from '../../../../src/fonts/ibm-plex-mono-400-latin.woff2'
import plexMonoMedium from '../../../../src/fonts/ibm-plex-mono-500-latin.woff2'
import snapshot from './snapshot.json'
import { Stage, zTitle } from './scene.js'
import { FONT_MONO, FONT_SANS, paletteFor } from './palette.js'
import {
  PRICE_LIST, PRICE_MINE, X_PRICE, X_TASK_COST, X_TASK_TIME, X_TASK_TOKENS, Z_CONTEXT, Z_SPEED, applyMyPrices, beatenBy, buildLayout,
  fmtPrice, fmtSeconds, fmtShownPrice, fmtTaskCost, findModels, fmtTokens, fmtTps, fmtUsd, floorPosition, matchPicks, taskCount, xAxis, xValue,
} from './frontier.js'
import { PlansEditor } from './plans.js'
import { initialPaneState, subscribePaneEvents } from './pane-events.js'

/** Hermes' light or dark paint when the host offers it; dark (the design system's mode) otherwise. */
const useRenderedMode = typeof SDK.useTheme === 'function'
  ? () => { const t = SDK.useTheme(); return t && t.renderedMode === 'light' ? 'light' : 'dark' }
  : () => 'dark'

function useReducedMotion() {
  const query = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null)
  const [reduced, setReduced] = useState(() => { const q = query(); return !!(q && q.matches) })
  useEffect(() => {
    const q = query()
    if (!q) return undefined
    const on = e => setReduced(!!e.matches)
    if (q.addEventListener) q.addEventListener('change', on)
    return () => { if (q.removeEventListener) q.removeEventListener('change', on) }
  }, [])
  return reduced
}

const INTEL_NOTE = {
  ECI: 'Epoch Capabilities Index, rescaled to 0-100',
  LMArena: 'LMArena Bradley-Terry rating, mapped onto the ECI scale (0-100)',
}

const CSS = `
@font-face { font-family: 'Iolite Inter Tight'; src: url('${interTight}') format('woff2'); font-weight: 100 900; font-display: swap; }
@font-face { font-family: 'Iolite IBM Plex Mono'; src: url('${plexMono}') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Iolite IBM Plex Mono'; src: url('${plexMonoMedium}') format('woff2'); font-weight: 500; font-display: swap; }
.iolite-ls { box-sizing: border-box; display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: auto; font-family: ${FONT_SANS}; font-size: 13px; line-height: 1.45; }
.iolite-ls *, .iolite-ls *::before, .iolite-ls *::after { box-sizing: border-box; }
.iolite-ls button { font: inherit; color: inherit; cursor: pointer; border-radius: 4px; transition: background-color 200ms cubic-bezier(0.2,0,0,1), border-color 200ms cubic-bezier(0.2,0,0,1); }
.iolite-ls button:focus-visible, .iolite-ls summary:focus-visible, .iolite-ls input:focus-visible { outline: 2px solid var(--iolite-focus); outline-offset: 2px; }
.iolite-ls canvas:focus-visible { outline: 2px solid var(--iolite-focus); outline-offset: -3px; }
.iolite-ls button[disabled], .iolite-ls button[aria-disabled="true"] { cursor: not-allowed; opacity: 0.6; }
.iolite-ls .iolite-header { padding: 16px 16px 10px; }
.iolite-ls .iolite-brand { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.iolite-ls .iolite-brand-mark { width: 13px; height: 13px; border: 1px solid currentColor; border-radius: 2px; transform: rotate(45deg); position: relative; margin: 0 3px; }
.iolite-ls .iolite-brand-mark::after { content: ''; position: absolute; inset: 3px; border: 1px solid currentColor; }
.iolite-ls .iolite-wordmark { color: var(--iolite-front); font-weight: 700; font-size: 18px; letter-spacing: 0.09em; text-transform: uppercase; }
.iolite-ls .iolite-descriptor { color: var(--iolite-muted); font-size: 14px; }
.iolite-ls .iolite-headline { margin: 8px 0 1px; font-family: ${FONT_SANS}; font-size: clamp(23px, 2.25vw, 32px); font-weight: 650; line-height: 1.2; letter-spacing: -0.025em; }
.iolite-ls .iolite-status { min-height: 1.45em; color: var(--iolite-muted); font-size: 12px; }
.iolite-ls .iolite-toolbar, .iolite-ls .iolite-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.iolite-ls .iolite-toolbar { column-gap: 14px; row-gap: 8px; margin-top: 12px; }
.iolite-ls .iolite-controls { max-width: 100%; }
.iolite-ls .iolite-controls > span { margin-right: 3px; color: var(--iolite-muted); font-family: ${FONT_MONO}; font-size: 11px; text-transform: uppercase; }
.iolite-ls .iolite-toolbar button { padding: 4px 8px; border: 1px solid var(--iolite-hair); background: transparent; font-family: ${FONT_MONO}; font-size: 11.5px; white-space: nowrap; }
.iolite-ls .iolite-toolbar button[aria-pressed="true"] { background: var(--iolite-front); color: var(--iolite-ground); }
.iolite-ls .iolite-toolbar button[aria-expanded="true"] { background: var(--iolite-raised); }
.iolite-ls .iolite-body { display: flex; flex-wrap: wrap; gap: 12px; padding: 0 16px 12px; flex: 1 0 auto; }
.iolite-ls .iolite-figure { display: flex; flex-direction: column; flex: 1 1 440px; min-width: 0; min-height: 420px; margin: 0; border: 1px solid var(--iolite-hair); border-radius: 8px; background: var(--iolite-ground); overflow: hidden; }
.iolite-ls .iolite-stage { position: relative; flex: 1 0 320px; min-width: 0; overflow: hidden; }
.iolite-ls .iolite-legend, .iolite-ls .iolite-axes { list-style: none; display: flex; flex-wrap: wrap; column-gap: 18px; row-gap: 6px; margin: 0; padding: 10px 12px; color: var(--iolite-muted); font-size: 12px; }
.iolite-ls .iolite-legend li { display: inline-flex; align-items: center; gap: 7px; }
.iolite-ls .iolite-glyph { display: inline-block; width: 11px; height: 11px; border: 1px solid currentColor; border-radius: 50%; }
.iolite-ls .iolite-glyph-front { color: var(--iolite-front); position: relative; }
.iolite-ls .iolite-glyph-front::before, .iolite-ls .iolite-glyph-front::after { content: ''; position: absolute; inset: 1px 3px; border: 1px solid currentColor; border-radius: 50%; }
.iolite-ls .iolite-glyph-front::after { inset: 3px 1px; }
.iolite-ls .iolite-glyph-off { width: 7px; height: 7px; margin: 0 2px; color: var(--iolite-off); }
.iolite-ls .iolite-glyph-pick { width: 8px; height: 8px; margin: 0 1.5px; border-radius: 0; transform: rotate(45deg); color: var(--iolite-pick); }
.iolite-ls .iolite-glyph-active { border-width: 2px; color: var(--iolite-focus); }
.iolite-ls .iolite-glyph-floor { width: 14px; height: 0; border: 0; border-top: 1px dashed var(--iolite-floor); border-radius: 0; }
.iolite-ls .iolite-axes { padding-top: 0; color: inherit; font-family: ${FONT_MONO}; font-size: 11px; }
.iolite-ls .iolite-axes b { margin-right: 5px; color: var(--iolite-front); }
.iolite-ls figcaption { padding: 7px 12px; border-top: 1px solid var(--iolite-hair); color: var(--iolite-muted); font-size: 12px; }
.iolite-ls .iolite-aside { flex: 0 1 320px; min-width: min(260px, 100%); display: flex; flex-direction: column; gap: 12px; }
.iolite-ls details { font-size: 12px; color: var(--iolite-muted); overflow-wrap: anywhere; }
.iolite-ls details p { margin: 5px 0 0; }
.iolite-ls summary { cursor: pointer; }
.iolite-ls ol { list-style: none; margin: 0; padding: 0; }
@media (prefers-reduced-motion: reduce) { .iolite-ls button { transition: none; } }
`

function Segmented({ label, value, options, onChange }) {
  return h('div', { className: 'iolite-controls', role: 'group', 'aria-label': label },
    h('span', { 'aria-hidden': true }, label),
    options.map(o => h('button', {
      key: o.id, type: 'button', title: o.title, 'aria-pressed': value === o.id, 'aria-disabled': o.disabled ? 'true' : undefined,
      onClick: () => { if (!o.disabled) onChange(o.id) },
    }, o.label)))
}

function frontHeadline(front, xMode, axis) {
  if (!front.length) return 'No models on the front for this view.'
  const value = p => xMode === X_PRICE
    ? (p.m.c === 0 && !p.m.mp ? 'free' : fmtShownPrice(p.m).replace('.00/M', '/M'))
    : axis.value(p.xv, p.m)
  const first = value(front[0]), last = value(front[front.length - 1])
  const range = first === last ? `at ${first === 'free' ? '$0/M' : first}` : `from ${first} to ${last}`
  return `${front.length} model${front.length === 1 ? '' : 's'} on the front, ${range}.`
}

const GLYPHS = [
  ['front', 'Front model'], ['off', 'Off the front'], ['pick', 'Shortlist pick'], ['active', 'Active model'],
]

function Row({ k, v, pal }) {
  return h('div', { style: { display: 'flex', gap: 8, justifyContent: 'space-between', padding: '2px 0' } },
    h('dt', { style: { color: pal.muted, flex: '0 0 auto' } }, k),
    h('dd', { style: { margin: 0, textAlign: 'right', color: pal.text, minWidth: 0, overflowWrap: 'anywhere' } }, v))
}

function Detail({ point, front, isPick, speed, tasks, xMode, pal }) {
  if (!point) {
    return h('p', { style: { margin: 0, color: pal.muted } }, 'There are no models with data for these axes.')
  }
  const m = point.m
  const sp = speed && speed[m.s]
  const beat = point.front ? null : beatenBy(point, front)
  const t = tasks && tasks[m.s]
  const frontName = xMode === X_PRICE ? 'cost x intelligence' : `${xAxis(xMode).title.split(' · ')[0].toLowerCase()} x intelligence`
  return h('div', null,
    h('div', { style: { fontWeight: 600, fontSize: 15, color: pal.text, overflowWrap: 'anywhere' } }, m.n),
    h('div', { style: { color: pal.muted, marginBottom: 6 } }, m.p || 'provider not stated'),
    h('dl', { style: { margin: 0 } },
      h(Row, { pal, k: 'Intelligence', v: `${m.i} (${m.t})` }),
      m.mp ? h(Row, { pal, k: 'Your price', v: `${m.mp.mode === 'sunk' ? '$0/M, prepaid: another token costs nothing' : fmtPrice(m.c) + ', ' + m.mp.mode} (${m.mp.plan})` }) : null,
      h(Row, { pal, k: m.mp ? 'List price' : 'Price, blended', v: fmtPrice(m.mp ? m.l : m.c) }),
      h(Row, { pal, k: 'Context', v: m.x ? `${fmtTokens(m.x)} tokens` : 'not stated' }),
      m.a !== undefined ? h(Row, { pal, k: 'Arena rating', v: `${m.a} (Bradley-Terry)` }) : null,
      h(Row, { pal, k: 'Speed', v: sp ? `${fmtTps(sp.tps)}, measured locally` : 'not measured yet' }),
      t ? h(Row, { pal, k: m.mp ? 'Your cost per task' : 'Cost per task', v: fmtTaskCost(xValue(m, X_TASK_COST, tasks), m) }) : null,
      t ? h(Row, { pal, k: 'Model time per task', v: fmtSeconds(t.sec) }) : null,
      t ? h(Row, { pal, k: 'Tokens per task', v: `${fmtTokens(t.in)} in, ${fmtTokens(t.out)} out` }) : null,
      h(Row, { pal, k: 'Per task', v: t ? `median of your ${t.n} tasks, measured locally` : 'not measured yet (3 tasks)' }),
      h(Row, { pal, k: 'Front', v: point.front ? `on the ${frontName} front` : (beat ? `beaten by ${beat.m.n}` : 'off the front') }),
      isPick ? h(Row, { pal, k: 'Shortlist', v: 'picked by your last /iolite shortlist' }) : null),
    h('p', { style: { margin: '8px 0 0', color: pal.muted, fontSize: 12 } },
      `${INTEL_NOTE[m.t] || 'Intelligence score'}. `,
      sp && sp.note ? `Speed ${sp.note}. ` : '',
      'Credits: Epoch AI (CC BY), LMArena (CC BY 4.0), LiteLLM (MIT).'))
}

function ModelButton({ p, pinnedId, highlightId, picks, setFocusId, setHoverId, setPinnedId, note, pal }) {
  return h('li', null,
    h('button', {
      type: 'button', 'aria-pressed': pinnedId === p.id,
      // Keyboard focus outranks a stale mouse hover. Hover follows real mouse movement, not mouseenter,
      // so a layout shift under a still pointer cannot steal the highlight.
      onFocus: () => { setHoverId(null); setFocusId(p.id) },
      onBlur: () => setFocusId(prev => (prev === p.id ? null : prev)),
      onMouseMove: () => setHoverId(p.id),
      onMouseLeave: () => setHoverId(prev => (prev === p.id ? null : prev)),
      onClick: () => setPinnedId(prev => (prev === p.id ? null : p.id)),
      style: {
        display: 'flex', width: '100%', gap: 8, justifyContent: 'space-between', textAlign: 'left', padding: '4px 6px',
        border: `1px solid ${pinnedId === p.id ? pal.frontier : 'transparent'}`, background: highlightId === p.id ? pal.panel : 'transparent', color: pal.text,
      },
    },
    h('span', { style: { minWidth: 0, overflowWrap: 'anywhere' } }, (picks.has(p.id) ? '[pick] ' : '') + p.m.n),
    h('span', { style: { color: pal.muted, fontFamily: FONT_MONO, fontSize: 12, flex: '0 0 auto' } }, note)))
}

export function LandscapePane({ ctx }) {
  const mode = useRenderedMode()
  const reduced = useReducedMotion()
  const pal = paletteFor(mode)
  const [pane, setPane] = useState(initialPaneState)
  const view = pane.view
  const setView = view => setPane(prev => ({ ...prev, view }))
  const [zMode, setZMode] = useState(Z_CONTEXT)
  const [basis, setBasis] = useState(PRICE_LIST)
  const [xMode, setXMode] = useState(X_PRICE)
  const [plansOpen, setPlansOpen] = useState(false)
  const [hoverId, setHoverId] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  const [query, setQuery] = useState('')
  const [rest, setRest] = useState({ status: 'loading' })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const refresh = () => {
    setRest({ status: 'loading' })
    setRefreshVersion(version => version + 1)
  }
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)

  useEffect(() => subscribePaneEvents(SDK.host, ctx, setPane), [ctx])

  useEffect(() => {
    setRest({ status: 'loading' })
    let live = true
    let done = false
    const fail = reason => { if (live && !done) { done = true; setRest({ status: 'unavailable', reason }) } }
    const timer = setTimeout(() => fail('no answer within 6 s'), 6000)
    try {
      Promise.resolve(ctx.rest('/landscape', { timeoutMs: 5000 })).then(
        data => {
          clearTimeout(timer)
          if (!live || done) return
          done = true
          if (data && data.ok) setRest({ status: 'ok', data })
          else setRest({ status: 'unavailable', reason: data?.error ? String(data.error).slice(0, 120) : 'the route answered without data' })
        },
        err => { clearTimeout(timer); fail(err && err.message ? String(err.message).slice(0, 120) : 'the route is not available') })
    } catch (err) { clearTimeout(timer); fail('this Hermes build has no plugin REST route') }
    return () => { live = false; clearTimeout(timer) }
  }, [ctx, refreshVersion])

  const data = rest.status === 'ok' ? rest.data : null
  const speed = data && data.measure_speed ? data.speed || {} : null
  const speedCount = speed ? Object.keys(speed).filter(s => snapshot.models.some(m => m.s === s)).length : 0
  const effectiveZ = zMode === Z_SPEED && speedCount > 0 ? Z_SPEED : Z_CONTEXT
  const mine = data && data.my_prices ? data.my_prices : null
  const priced = useMemo(() => applyMyPrices(snapshot, mine ? mine.prices : null), [mine])
  const effectiveBasis = basis === PRICE_MINE && priced.covered > 0 ? PRICE_MINE : PRICE_LIST
  const shown = effectiveBasis === PRICE_MINE ? priced.snapshot : snapshot
  const tasks = data && data.measure_usage !== false ? data.tasks || {} : null
  const tasksMeasured = taskCount(snapshot, tasks)
  const effectiveX = xMode !== X_PRICE && tasksMeasured > 0 ? xMode : X_PRICE
  const axis = xAxis(effectiveX, effectiveBasis === PRICE_MINE)
  const layout = useMemo(() => ({
    ...buildLayout(shown, { z: effectiveZ, speed, x: effectiveX, tasks }),
    xTitle: axis.title, xTick: axis.tick,
  }), [shown, effectiveZ, speed, effectiveX, tasks, axis.title])
  // Live events outrank a REST snapshot that may have started loading before the tool ran.
  const last = pane.last || (data && data.last_shortlist ? data.last_shortlist : null)
  const picks = useMemo(() => matchPicks(layout.points, last ? last.picks : []), [layout, last])
  const floor = pane.floor !== undefined ? pane.floor : last && typeof last.floor === 'number' ? last.floor : null
  const floorShown = floorPosition(layout.domains, floor) !== null ? floor : null
  const byId = useMemo(() => new Map(layout.points.map(p => [p.id, p])), [layout])
  const highlighted = byId.get(hoverId) || byId.get(focusId) || byId.get(pinnedId) || layout.front[0] || null
  const highlightId = highlighted?.id

  useEffect(() => {
    if (!pane.focusRevision) return
    setHoverId(null)
    setFocusId(null)
    setPinnedId(pane.focus_model)
    // A measured-only axis can hide the requested model. Return to the full catalog view
    // when needed, so focusing a priced/scored model actually reveals its mark.
    if (pane.focus_model && !byId.has(pane.focus_model)) {
      setXMode(X_PRICE)
      setZMode(Z_CONTEXT)
    }
  }, [pane.focus_model, pane.focusRevision])

  // the stage lives as long as the canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const stage = new Stage(canvas, {
      onHover: id => setHoverId(id),
      onSelect: id => setPinnedId(prev => (id && id === prev ? null : id)),
    })
    stageRef.current = stage
    if (typeof document !== 'undefined' && document.fonts) {
      Promise.all([document.fonts.load(`400 11px ${FONT_MONO}`), document.fonts.load(`500 11px ${FONT_MONO}`)])
        .then(() => { if (stageRef.current === stage) stage.draw() }, () => {})
    }
    // Measure the content box (no border) and keep the canvas out of flow (absolute), so the
    // canvas can never push its own box bigger: sizing it from the border box grew the stage
    // 2px per ResizeObserver tick and scrolled the page forever where nothing capped the height.
    let last = ''
    const fit = () => {
      const el = wrapRef.current
      if (!el || el.clientWidth <= 0) return
      const w = el.clientWidth, ht = Math.max(el.clientHeight, 300)
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
      const key = `${w}x${ht}@${dpr}`
      if (key === last) return
      last = key
      stage.resize(w, ht, dpr)
    }
    fit()
    let ro = null
    if (typeof ResizeObserver !== 'undefined' && wrapRef.current) { ro = new ResizeObserver(fit); ro.observe(wrapRef.current) }
    return () => { if (ro) ro.disconnect(); stage.destroy(); stageRef.current = null }
  }, [])

  useEffect(() => {
    if (pane.cameraReset && stageRef.current) stageRef.current.resetView()
  }, [pane.cameraReset])

  useEffect(() => {
    const stage = stageRef.current
    if (stage) stage.update({ layout, view, palette: pal, picks, floor: floorShown, hoverId, highlightId, reducedMotion: reduced })
  }, [layout, view, pal, picks, floorShown, hoverId, highlightId, reduced])

  const frontList = layout.front
  const cssVars = {
    '--iolite-focus': pal.copper, '--iolite-front': pal.frontier, '--iolite-off': pal.dominated,
    '--iolite-pick': pal.pick, '--iolite-floor': pal.floor, '--iolite-ground': pal.ground, '--iolite-raised': pal.panelRaised,
    '--iolite-hair': pal.hair, '--iolite-muted': pal.muted, background: pal.panel, color: pal.text,
  }
  const localStatus = rest.status === 'loading' ? 'Loading local measurements, plans and shortlist…'
    : rest.status === 'unavailable' ? 'Local data unavailable. Showing the bundled snapshot.'
      : `${layout.plotted} of ${snapshot.total} catalog models plotted.`
  const localDisabled = rest.status === 'loading' ? 'Loading local data' : rest.status === 'unavailable' ? 'Refresh to retry local data' : null
  const speedNote = rest.status !== 'ok' ? null
    : !data.measure_speed ? 'Speed measuring is off (measure_speed).'
        : speedCount === 0 ? 'No model has a locally measured speed yet (each needs 3 calls through Hermes). Third axis stays on context window.'
          : `Speed measured locally for ${speedCount} model${speedCount === 1 ? '' : 's'}, kept on this machine and not comparable across machines.`
  const shortNote = last
    ? `Marked: ${last.picks.length} pick${last.picks.length === 1 ? '' : 's'} from your last /iolite shortlist (${last.objective || 'objective not stated'}). Floor: ${floor === null ? 'none' : floor}${pane.floor !== undefined ? ', set by the agent' : ''}.`
    : rest.status === 'ok' ? 'No remembered /iolite shortlist yet. Run /iolite shortlist to mark picks and the floor here.' : null
  const plans = mine?.plans || []
  const problems = mine?.problems || []
  const mineNote = rest.status !== 'ok' ? null
    : priced.covered === 0
      ? `My price: no model prices from your plans yet. Open My plans to manage local subscriptions.${problems.length ? ' Problems: ' + problems.join('; ') + '.' : ''}`
      : `My price: ${priced.covered} model${priced.covered === 1 ? '' : 's'} priced from your ${plans.length} plan${plans.length === 1 ? '' : 's'} (${plans.map(p => p.name).join(', ')}); everything else stays at list price.${problems.length ? ' Skipped: ' + problems.join('; ') + '.' : ''}`
  const catalogNote = data && data.bundled === false ? `Note: /iolite is using ${data.catalog_source || 'another catalog'}; this pane always plots the bundled snapshot.` : null
  const taskNote = rest.status !== 'ok' ? null
    : data.measure_usage === false ? 'Per-task views are off (measure_usage), so cost, time and tokens per task are not measured.'
      : tasksMeasured === 0 ? 'Cost, time and tokens per task: not measured yet. Each model needs 3 tasks through Hermes; the numbers stay on this machine.'
        : `Per task: medians of your own tasks for ${tasksMeasured} model${tasksMeasured === 1 ? '' : 's'}, measured locally. Model time only; tool time is left out.`
  const countLine = effectiveX !== X_PRICE
    ? `${layout.plotted} models with per-task numbers measured on this machine plotted; the rest have none yet and are not plotted or guessed.`
    : effectiveZ === Z_SPEED
    ? `${layout.plotted} of ${snapshot.plotted} priced and scored models plotted (the rest have no measured speed); ${snapshot.unplotted} of ${snapshot.total} catalog models have no price or no score and are never plotted.`
    : `${layout.plotted} of ${snapshot.total} catalog models plotted; ${snapshot.unplotted} have no price or no score and are not plotted.`

  const found = useMemo(() => findModels(layout.points, query), [layout, query])
  const btnProps = { pinnedId, highlightId, picks, setFocusId, setHoverId, setPinnedId, pal }
  const noteFor = p => `${p.m.i} · ${effectiveX === X_PRICE ? fmtShownPrice(p.m).replace('/M', '').replace(' (free tier)', ' free') : axis.value(p.xv, p.m)}`
  const label = `${view === '3d' ? '3D' : '2D'} model landscape: ${axis.title.split(' · ')[0].toLowerCase()}, intelligence${view === '3d' ? ' and ' + (effectiveZ === Z_SPEED ? 'locally measured speed' : 'context window') : ''}. ${layout.plotted} models plotted, ${frontList.length} on the front. ${view === '3d' ? 'Arrow keys rotate, plus and minus zoom, 0 resets. ' : ''}The front list contains every front model. Find a model reaches all plotted models.`

  return h('div', { className: 'iolite-ls', style: cssVars },
    h('style', null, CSS),
    h('div', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', style: { padding: '0 16px', color: pal.muted, fontSize: 12 } },
      h('span', { key: pane.revision }, pane.announcement,
        pane.focus_model && !snapshot.models.some(m => m.s === pane.focus_model) ? ' This model has no plotted mark in the bundled catalog.' : '')),
    h('header', { className: 'iolite-header' },
      h('div', { className: 'iolite-brand' },
        h('span', { className: 'iolite-brand-mark', 'aria-hidden': true, style: { color: pal.frontier } }),
        h('span', { className: 'iolite-wordmark' }, 'Iolite'),
        h('span', { className: 'iolite-descriptor' }, 'Model landscape')),
      h('h2', { className: 'iolite-headline' }, frontHeadline(frontList, effectiveX, axis)),
      h('div', { className: 'iolite-status', role: 'status', 'aria-label': 'Local data status', 'aria-atomic': 'true' }, localStatus),
      h('div', { className: 'iolite-toolbar', role: 'group', 'aria-label': 'Landscape controls' },
        h(Segmented, { label: 'View', value: view, onChange: setView, options: [{ id: '3d', label: '3D', title: 'Rotate and zoom the 3D landscape' }, { id: '2d', label: '2D', title: 'Flat X by intelligence projection' }] }),
        h(Segmented, {
          label: 'Price', value: effectiveBasis, onChange: setBasis,
          options: [
            { id: PRICE_LIST, label: 'List', title: 'Public list price per million tokens (LiteLLM)' },
            { id: PRICE_MINE, label: 'Mine', disabled: priced.covered === 0, title: priced.covered === 0 ? localDisabled || 'No model prices from local plans yet' : 'What another token costs you on your own plans' },
          ],
        }),
        h(Segmented, {
          label: 'X axis', value: effectiveX, onChange: setXMode,
          options: [
            { id: X_PRICE, label: '$/M', title: 'Price per million tokens (log)' },
            { id: X_TASK_COST, label: 'Cost/task', disabled: tasksMeasured === 0, title: tasksMeasured === 0 ? localDisabled || 'Needs 3 measured tasks per model' : 'Median dollars per task at the chosen price (log)' },
            { id: X_TASK_TIME, label: 'Time/task', disabled: tasksMeasured === 0, title: tasksMeasured === 0 ? localDisabled || 'Needs 3 measured tasks per model' : 'Median model seconds per task (log)' },
            { id: X_TASK_TOKENS, label: 'Tokens/task', disabled: tasksMeasured === 0, title: tasksMeasured === 0 ? localDisabled || 'Needs 3 measured tasks per model' : 'Median input + output tokens per task (log)' },
          ],
        }),
        h(Segmented, {
          label: 'Third axis', value: effectiveZ, onChange: setZMode,
          options: [
            { id: Z_CONTEXT, label: 'Context', title: 'Context window, tokens (log)' },
            { id: Z_SPEED, label: 'Speed', disabled: speedCount === 0, title: speedCount === 0 ? localDisabled || 'No locally measured speed yet' : 'Tokens per second measured on this machine (log)' },
          ],
        }),
        h('div', { className: 'iolite-controls', role: 'group', 'aria-label': 'Landscape actions' },
          view === '3d' ? h('button', { type: 'button', onClick: () => stageRef.current?.resetView() }, 'Reset view') : null,
          h('button', { type: 'button', 'aria-expanded': plansOpen, 'aria-controls': 'iolite-my-plans', onClick: () => setPlansOpen(o => !o) }, 'My plans'),
          h('button', { type: 'button', onClick: refresh, title: 'Reload local measurements, plans and shortlist' }, 'Refresh')))),
    plansOpen ? h('div', { id: 'iolite-my-plans' }, h(PlansEditor, { ctx, mine, loading: rest.status === 'loading', models: snapshot.models, pal, onSaved: refresh })) : null,
    h('div', { className: 'iolite-body' },
      h('figure', { className: 'iolite-figure', 'aria-label': 'Model landscape chart' },
        h('ul', { className: 'iolite-legend', 'aria-label': 'Chart legend' },
          GLYPHS.map(([id, name]) => h('li', { key: id }, h('span', { className: `iolite-glyph iolite-glyph-${id}`, 'aria-hidden': true }), name)),
          floorShown === null ? null : h('li', null, h('span', { className: 'iolite-glyph iolite-glyph-floor', 'aria-hidden': true }), `Intelligence floor ${floorShown}`)),
        h('div', { className: 'iolite-stage', ref: wrapRef },
          h('canvas', { ref: canvasRef, role: 'img', 'aria-label': label, tabIndex: 0, style: { display: 'block', position: 'absolute', inset: 0, touchAction: 'none', cursor: view === '3d' ? 'grab' : 'default' } }),
          layout.plotted === 0 ? h('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: pal.muted, padding: 24, textAlign: 'center', pointerEvents: 'none' } }, 'There are no models with data for these axes.') : null),
        view === '3d' ? h('ul', { className: 'iolite-axes', 'aria-label': 'Chart axes' },
          h('li', null, h('b', null, 'X'), axis.title),
          h('li', null, h('b', null, 'Y'), 'INTELLIGENCE 0–100'),
          h('li', null, h('b', null, 'Z'), zTitle(layout.z))) : null,
        h('figcaption', null, 'The front connects models for which a better X value would mean a lower intelligence score.')),
      h('aside', { className: 'iolite-aside' },
        // minHeight reserves the filled panel's height, so hovering a list below never shifts that list.
        h('section', { 'aria-label': 'Selected model', 'aria-live': 'polite', style: { background: pal.panelRaised, border: `1px solid ${pal.hair}`, borderRadius: 8, padding: 12, boxSizing: 'border-box', minHeight: '21em' } },
          h('h3', { style: { margin: '0 0 6px', fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: pal.muted } }, 'Selected model'),
          h(Detail, { point: highlighted, front: frontList, isPick: !!highlighted && picks.has(highlighted.id), speed, tasks, xMode: effectiveX, pal })),
        h('section', { 'aria-label': 'Intelligence front', style: { background: pal.panelRaised, border: `1px solid ${pal.hair}`, borderRadius: 8, padding: 12, minHeight: 0 } },
          h('h3', { style: { margin: '0 0 6px', fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: pal.muted } },
            `Front · ${frontList.length} models, ${effectiveX === X_PRICE ? 'cheapest' : effectiveX === X_TASK_TIME ? 'fastest' : effectiveX === X_TASK_TOKENS ? 'fewest tokens' : 'cheapest per task'} first`),
          h('ol', { style: { maxHeight: 300, overflowY: 'auto' } },
            frontList.map(p => h(ModelButton, { key: p.id, p, ...btnProps, note: noteFor(p) })))),
        h('section', { 'aria-label': 'Find a model', style: { background: pal.panelRaised, border: `1px solid ${pal.hair}`, borderRadius: 8, padding: 12 } },
          h('label', { htmlFor: 'iolite-find', style: { display: 'block', margin: '0 0 6px', fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: pal.muted } }, 'Find a model'),
          h('input', {
            id: 'iolite-find', type: 'search', value: query, placeholder: 'name, slug or provider', autoComplete: 'off', 'aria-describedby': 'iolite-find-count',
            onChange: e => setQuery(e.target.value),
            style: { width: '100%', font: 'inherit', color: pal.text, background: pal.ground, border: `1px solid ${pal.hair}`, borderRadius: 4, padding: '4px 6px' },
          }),
          h('div', { id: 'iolite-find-count', 'aria-live': 'polite', style: { color: pal.muted, fontSize: 12, margin: '4px 0' } },
            !query.trim() ? `Any of the ${layout.plotted} plotted models; Tab to a result to show it.`
              : found.total === 0 ? 'No plotted model matches.'
                : `${found.total} match${found.total === 1 ? '' : 'es'}${found.total > found.hits.length ? `, showing the ${found.hits.length} smartest` : ''}.`),
          found.hits.length ? h('ol', null, found.hits.map(p => h(ModelButton, { key: p.id, p, ...btnProps, note: noteFor(p) }))) : null),
        h('details', null,
          h('summary', null, 'Coverage and local data'),
          [countLine, speedNote, mineNote, taskNote, shortNote, catalogNote, rest.reason].filter(Boolean).map((note, i) => h('p', { key: i }, note))))),
    h('footer', { style: { padding: '8px 16px 14px', color: pal.muted, fontSize: 11.5, borderTop: `1px solid ${pal.hair}` } },
      h('details', null,
        h('summary', null, `Data sources and attribution · ${snapshot.generated}`),
        snapshot.credits.map((c, i) => h('p', { key: i }, c)),
        h('p', null, 'Iolite is independent of Epoch AI, LMArena and LiteLLM. See ATTRIBUTION.md in the plugin for the full notices.'))))
}
