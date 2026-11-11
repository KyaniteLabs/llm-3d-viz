/**
 * The "Iolite: model landscape" pane. React is the only runtime dependency; the stage
 * (scene.js) and the data logic (frontier.js) know nothing about Hermes.
 */
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as SDK from '@hermes/plugin-sdk'
import snapshot from './snapshot.json'
import { Stage, zTitle } from './scene.js'
import { FONT_MONO, FONT_SANS, paletteFor } from './palette.js'
import {
  PRICE_LIST, PRICE_MINE, X_PRICE, X_TASK_COST, X_TASK_TIME, X_TASK_TOKENS, Z_CONTEXT, Z_SPEED, applyMyPrices, beatenBy, buildLayout,
  fmtPrice, fmtSeconds, fmtShownPrice, fmtTokens, fmtTps, fmtUsd, floorPosition, matchPicks, taskCount, xAxis, xValue,
} from './frontier.js'
import { PlansEditor } from './plans.js'

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
.iolite-ls { box-sizing: border-box; display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: auto; font-family: ${FONT_SANS}; font-size: 13px; line-height: 1.45; }
.iolite-ls *, .iolite-ls *::before, .iolite-ls *::after { box-sizing: border-box; }
.iolite-ls button { font: inherit; color: inherit; cursor: pointer; border-radius: 4px; transition: background-color 200ms cubic-bezier(0.2,0,0,1), border-color 200ms cubic-bezier(0.2,0,0,1); }
.iolite-ls button:focus-visible, .iolite-ls canvas:focus-visible { outline: 2px solid var(--iolite-focus); outline-offset: 2px; }
.iolite-ls button[disabled], .iolite-ls button[aria-disabled="true"] { cursor: not-allowed; opacity: 0.6; }
.iolite-ls .iolite-body { display: flex; flex-wrap: wrap; gap: 12px; padding: 0 16px 12px; flex: 1 0 auto; min-height: 340px; }
.iolite-ls .iolite-stage { flex: 1 1 440px; min-width: 0; min-height: 340px; position: relative; border-radius: 8px; overflow: hidden; }
.iolite-ls .iolite-aside { flex: 0 1 320px; min-width: 260px; display: flex; flex-direction: column; gap: 12px; }
.iolite-ls ol { list-style: none; margin: 0; padding: 0; }
@media (prefers-reduced-motion: reduce) { .iolite-ls button { transition: none; } }
`

function Segmented({ label, value, options, onChange, pal }) {
  return h('div', { role: 'group', 'aria-label': label, style: { display: 'inline-flex', gap: 0, alignItems: 'center' } },
    h('span', { style: { color: pal.muted, fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 8, whiteSpace: 'nowrap' } }, label),
    options.map((o, i) => h('button', {
      key: o.id, type: 'button', title: o.title, 'aria-pressed': value === o.id, 'aria-disabled': o.disabled ? 'true' : undefined,
      onClick: () => { if (!o.disabled) onChange(o.id) },
      style: {
        padding: '4px 10px', border: `1px solid ${pal.hair}`, marginLeft: i ? -1 : 0, borderRadius: 4,
        background: value === o.id ? pal.frontier : 'transparent', color: value === o.id ? pal.ground : pal.text,
        fontFamily: FONT_MONO, fontSize: 12, opacity: o.disabled ? 0.45 : 1, cursor: o.disabled ? 'not-allowed' : 'pointer',
      },
    }, o.label)))
}

function Row({ k, v, pal }) {
  return h('div', { style: { display: 'flex', gap: 8, justifyContent: 'space-between', padding: '2px 0' } },
    h('dt', { style: { color: pal.muted, flex: '0 0 auto' } }, k),
    h('dd', { style: { margin: 0, textAlign: 'right', color: pal.text, minWidth: 0, overflowWrap: 'anywhere' } }, v))
}

function Detail({ point, front, isPick, speed, tasks, xMode, pal }) {
  if (!point) {
    return h('p', { style: { margin: 0, color: pal.muted } },
      'Hover or focus a point, or tab through the front list, to read its numbers and where they come from.')
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
      t ? h(Row, { pal, k: m.mp ? 'Your cost per task' : 'Cost per task', v: fmtUsd(xValue(m, X_TASK_COST, tasks)) }) : null,
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

export function LandscapePane({ ctx }) {
  const mode = useRenderedMode()
  const reduced = useReducedMotion()
  const pal = paletteFor(mode)
  const [view, setView] = useState('3d')
  const [zMode, setZMode] = useState(Z_CONTEXT)
  const [basis, setBasis] = useState(PRICE_LIST)
  const [xMode, setXMode] = useState(X_PRICE)
  const [plansOpen, setPlansOpen] = useState(false)
  const [hoverId, setHoverId] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  const [rest, setRest] = useState({ status: 'loading' })
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)

  const load = useCallback(() => {
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
          else setRest({ status: 'unavailable', reason: (data && data.error) || 'the route answered without data' })
        },
        err => { clearTimeout(timer); fail(err && err.message ? String(err.message).slice(0, 120) : 'the route is not available') })
    } catch (err) { clearTimeout(timer); fail('this Hermes build has no plugin REST route') }
    return () => { live = false; clearTimeout(timer) }
  }, [ctx])

  useEffect(() => load(), [load])

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
  const last = data && data.last_shortlist ? data.last_shortlist : null
  const picks = useMemo(() => matchPicks(layout.points, last ? last.picks : []), [layout, last])
  const floor = last && typeof last.floor === 'number' ? last.floor : null
  const floorShown = floorPosition(layout.domains, floor) !== null ? floor : null
  const byId = useMemo(() => new Map(layout.points.map(p => [p.id, p])), [layout])
  const highlightId = hoverId || focusId || pinnedId
  const highlighted = highlightId ? byId.get(highlightId) || null : null

  // the stage lives as long as the canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const stage = new Stage(canvas, {
      onHover: id => setHoverId(id),
      onSelect: id => setPinnedId(prev => (id && id === prev ? null : id)),
    })
    stageRef.current = stage
    const fit = () => {
      const box = wrapRef.current && wrapRef.current.getBoundingClientRect()
      if (box && box.width > 0) stage.resize(box.width, Math.max(box.height, 340), (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
    }
    fit()
    let ro = null
    if (typeof ResizeObserver !== 'undefined' && wrapRef.current) { ro = new ResizeObserver(fit); ro.observe(wrapRef.current) }
    return () => { if (ro) ro.disconnect(); stage.destroy(); stageRef.current = null }
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (stage) stage.update({ layout, view, palette: pal, picks, floor: floorShown, hoverId, highlightId, reducedMotion: reduced })
  }, [layout, view, pal, picks, floorShown, hoverId, highlightId, reduced])

  const frontList = layout.front
  const cssVars = { '--iolite-focus': pal.copper, background: pal.panel, color: pal.text }
  const zLabel = zTitle(layout.z)
  const restNote = rest.status === 'loading' ? 'Reading speed and your last shortlist from the Python half...'
    : rest.status === 'unavailable'
      ? `Speed and your last shortlist come from the Python half over REST, which is not reachable (${rest.reason}). Third axis stays on context window; no speed is shown or guessed.`
      : !data.measure_speed ? 'Speed measuring is off (measure_speed), so there is no speed to plot. Third axis stays on context window.'
        : speedCount === 0 ? 'No model has a locally measured speed yet (each needs 3 calls through Hermes). Third axis stays on context window.'
          : `Speed measured locally for ${speedCount} model${speedCount === 1 ? '' : 's'}, kept on this machine and not comparable across machines.`
  const shortNote = rest.status !== 'ok' ? null
    : last && last.picks.length ? `Marked: ${last.picks.length} pick${last.picks.length === 1 ? '' : 's'} and the floor (${last.floor === null ? 'none' : last.floor}, ${last.floor_source || 'source not stated'}) from your last /iolite shortlist${last.saved ? `, ${last.saved}` : ''}.`
      : 'No remembered /iolite shortlist yet. Run /iolite shortlist to mark picks and the floor here.'
  const mineNote = rest.status !== 'ok' ? null
    : priced.covered === 0
      ? `My price: no plans yet. Open My plans to price the subscriptions you already pay for; they stay on this machine.${mine && mine.problems && mine.problems.length ? ' Problems: ' + mine.problems.join('; ') + '.' : ''}`
      : `My price: ${priced.covered} model${priced.covered === 1 ? '' : 's'} priced from your ${mine.plans.length} plan${mine.plans.length === 1 ? '' : 's'} (${mine.plans.map(p => p.name).join(', ')}); everything else stays at list price.${mine.problems && mine.problems.length ? ' Skipped: ' + mine.problems.join('; ') + '.' : ''}`
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

  const label = `${view === '3d' ? '3D' : '2D'} model landscape: ${axis.title.split(' · ')[0].toLowerCase()}, intelligence${view === '3d' ? ' and ' + (effectiveZ === Z_SPEED ? 'locally measured speed' : 'context window') : ''}. ${layout.plotted} models plotted, ${frontList.length} on the front. ${view === '3d' ? 'Arrow keys rotate, plus and minus zoom, 0 resets. ' : ''}The front list beside the plot has every front model.`

  return h('div', { className: 'iolite-ls', style: cssVars },
    h('style', null, CSS),
    h('header', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px 20px', alignItems: 'center', padding: '12px 16px 8px' } },
      h('h2', { style: { margin: 0, fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' } }, 'Iolite · model landscape'),
      h(Segmented, { pal, label: 'View', value: view, onChange: setView, options: [{ id: '3d', label: '3D', title: 'Rotate and zoom the 3D landscape' }, { id: '2d', label: '2D', title: 'Price by intelligence, flat' }] }),
      h(Segmented, {
        pal, label: 'Price', value: effectiveBasis, onChange: setBasis,
        options: [
          { id: PRICE_LIST, label: 'List', title: 'Public list price per million tokens (LiteLLM)' },
          { id: PRICE_MINE, label: 'Mine', disabled: priced.covered === 0, title: priced.covered === 0 ? 'No plans in my_prices.json yet' : 'What another token costs you on your own plans' },
        ],
      }),
      h(Segmented, {
        pal, label: 'X axis', value: effectiveX, onChange: setXMode,
        options: [
          { id: X_PRICE, label: '$/M', title: 'Price per million tokens (log)' },
          { id: X_TASK_COST, label: 'Cost/task', disabled: tasksMeasured === 0, title: tasksMeasured === 0 ? 'Needs 3 measured tasks per model' : 'Median dollars per task at the chosen price (log)' },
          { id: X_TASK_TIME, label: 'Time/task', disabled: tasksMeasured === 0, title: tasksMeasured === 0 ? 'Needs 3 measured tasks per model' : 'Median model seconds per task (log)' },
          { id: X_TASK_TOKENS, label: 'Tokens/task', disabled: tasksMeasured === 0, title: tasksMeasured === 0 ? 'Needs 3 measured tasks per model' : 'Median input + output tokens per task (log)' },
        ],
      }),
      h(Segmented, {
        pal, label: 'Third axis', value: effectiveZ, onChange: setZMode,
        options: [
          { id: Z_CONTEXT, label: 'Context', title: 'Context window, tokens (log)' },
          { id: Z_SPEED, label: 'Speed', disabled: speedCount === 0, title: speedCount === 0 ? 'No locally measured speed yet' : 'Tokens per second measured on this machine (log)' },
        ],
      }),
      view === '3d' ? h('button', { type: 'button', onClick: () => stageRef.current && stageRef.current.resetView(), style: { padding: '4px 10px', border: `1px solid ${pal.hair}`, background: 'transparent', fontFamily: FONT_MONO, fontSize: 12 } }, 'Reset view') : null,
      h('button', { type: 'button', 'aria-expanded': plansOpen, 'aria-controls': 'iolite-my-plans', onClick: () => setPlansOpen(o => !o), style: { padding: '4px 10px', border: `1px solid ${pal.hair}`, background: plansOpen ? pal.panelRaised : 'transparent', fontFamily: FONT_MONO, fontSize: 12 } }, 'My plans'),
      h('button', { type: 'button', onClick: load, style: { padding: '4px 10px', border: `1px solid ${pal.hair}`, background: 'transparent', fontFamily: FONT_MONO, fontSize: 12 }, title: 'Read speed and your last shortlist again' }, 'Refresh')),
    h('div', { style: { padding: '0 16px 10px', color: pal.muted, fontSize: 12 }, 'aria-live': 'polite' },
      h('div', null, countLine, ` Third axis: ${zLabel.toLowerCase()}.`),
      h('div', null, restNote),
      mineNote ? h('div', null, mineNote) : null,
      taskNote ? h('div', null, taskNote) : null,
      shortNote ? h('div', null, shortNote) : null,
      catalogNote ? h('div', null, catalogNote) : null),
    plansOpen ? h('div', { id: 'iolite-my-plans' }, h(PlansEditor, { ctx, mine, models: snapshot.models, pal, onSaved: load })) : null,
    h('div', { className: 'iolite-body' },
      h('div', { className: 'iolite-stage', ref: wrapRef, style: { background: pal.ground, border: `1px solid ${pal.hair}` } },
        h('canvas', { ref: canvasRef, role: 'img', 'aria-label': label, tabIndex: 0, style: { display: 'block', touchAction: 'none', cursor: view === '3d' ? 'grab' : 'default' } }),
        layout.plotted === 0 ? h('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: pal.muted, padding: 24, textAlign: 'center' } }, 'Nothing to plot on this axis yet.') : null),
      h('aside', { className: 'iolite-aside' },
        h('section', { 'aria-label': 'Selected model', 'aria-live': 'polite', style: { background: pal.panelRaised, border: `1px solid ${pal.hair}`, borderRadius: 8, padding: 12 } },
          h(Detail, { point: highlighted, front: frontList, isPick: !!highlighted && picks.has(highlighted.id), speed, tasks, xMode: effectiveX, pal })),
        h('section', { 'aria-label': 'Cost by intelligence front', style: { background: pal.panelRaised, border: `1px solid ${pal.hair}`, borderRadius: 8, padding: 12, minHeight: 0 } },
          h('h3', { style: { margin: '0 0 6px', fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: pal.muted } },
            `Front · ${frontList.length} models, ${effectiveX === X_PRICE ? 'cheapest' : effectiveX === X_TASK_TIME ? 'fastest' : effectiveX === X_TASK_TOKENS ? 'fewest tokens' : 'cheapest per task'} first`),
          h('ol', { style: { maxHeight: 300, overflowY: 'auto' } },
            frontList.map(p => h('li', { key: p.id },
              h('button', {
                type: 'button', 'aria-pressed': pinnedId === p.id,
                onFocus: () => setFocusId(p.id), onBlur: () => setFocusId(prev => (prev === p.id ? null : prev)),
                onMouseEnter: () => setHoverId(p.id), onMouseLeave: () => setHoverId(prev => (prev === p.id ? null : prev)),
                onClick: () => setPinnedId(prev => (prev === p.id ? null : p.id)),
                style: {
                  display: 'flex', width: '100%', gap: 8, justifyContent: 'space-between', textAlign: 'left', padding: '4px 6px',
                  border: `1px solid ${pinnedId === p.id ? pal.frontier : 'transparent'}`, background: highlightId === p.id ? pal.panel : 'transparent', color: pal.text,
                },
              },
              h('span', { style: { minWidth: 0, overflowWrap: 'anywhere' } }, (picks.has(p.id) ? '[pick] ' : '') + p.m.n),
              h('span', { style: { color: pal.muted, fontFamily: FONT_MONO, fontSize: 12, flex: '0 0 auto' } }, `${p.m.i} · ${effectiveX === X_PRICE ? fmtShownPrice(p.m).replace('/M', '').replace(' (free tier)', ' free') : axis.value(p.xv)}`)))))))),
    h('footer', { style: { padding: '8px 16px 14px', color: pal.muted, fontSize: 11.5, borderTop: `1px solid ${pal.hair}` } },
      h('div', null, 'Frontier = no model is as good or better on the X axis and at least as smart. Dominated models are small rings; front models are wire spheres on the ridge; picks have a diamond; the copper ring is focus. Openness is not in the catalog, so there is one glyph per class.'),
      snapshot.credits.map((c, i) => h('div', { key: i }, c)),
      h('div', null, `Snapshot ${snapshot.generated}. Not affiliated with Epoch AI, LMArena or LiteLLM. Full notices: ATTRIBUTION.md in the plugin.`)))
}
