/** Agent events use the same floor, pick and focus state as the pane's manual controls.
 * Kept independent of React so the event contract runs in Node as well as Desktop. */
export const initialPaneState = {
  view: '3d', last: null, floor: undefined, focus_model: null,
  cameraReset: 0, focusRevision: 0, announcement: '', revision: 0,
}

const validFloor = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100
const validSlug = s => typeof s === 'string' && s.length > 0 && s.length <= 200
const has = (o, key) => Object.prototype.hasOwnProperty.call(o, key)

function validEvent(name, p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  if (name === 'shortlist.updated') return validFloor(p.floor)
    && ['min_cost', 'max_speed', 'balanced'].includes(p.objective)
    && Array.isArray(p.picks) && p.picks.length <= 25 && p.picks.every(validSlug)
  if (name === 'model.focused') return p.focus_model === null || validSlug(p.focus_model)
  if (name === 'view.set') return ['3d', '2d'].includes(p.view)
    && (!has(p, 'floor') || validFloor(p.floor))
    && (!has(p, 'focus_model') || validSlug(p.focus_model))
    && (!has(p, 'reset_camera') || typeof p.reset_camera === 'boolean')
  return name === 'presence.check'
}

function applyEvent(prev, name, p) {
  const next = { ...prev, revision: (prev.revision || 0) + 1 }
  if (name === 'shortlist.updated') {
    next.last = { floor: p.floor, objective: p.objective, picks: [...p.picks] }
    next.floor = p.floor
    next.focus_model = p.picks[0] || null
    next.focusRevision = (prev.focusRevision || 0) + 1
    next.announcement = `Agent set floor ${p.floor}, ${p.picks.length} picks, objective ${p.objective}.`
  } else if (name === 'model.focused') {
    next.focus_model = p.focus_model
    next.focusRevision = (prev.focusRevision || 0) + 1
    next.announcement = p.focus_model ? `Agent focused ${p.focus_model}.` : 'Agent cleared model focus; no matching model.'
  } else {
    next.view = p.view
    if (has(p, 'floor')) next.floor = p.floor
    if (has(p, 'focus_model')) {
      next.focus_model = p.focus_model
      next.focusRevision = (prev.focusRevision || 0) + 1
    }
    if (p.reset_camera) next.cameraReset += 1
    next.announcement = `Agent set ${p.view.toUpperCase()} view`
      + (has(p, 'floor') ? `, floor ${p.floor}` : '')
      + (p.focus_model ? `, focused ${p.focus_model}` : '')
      + (p.reset_camera ? ', camera reset' : '') + '.'
  }
  return next
}

export function subscribePaneEvents(host, ctx, setState) {
  if (!host || typeof host.onEvent !== 'function') return () => {}
  const disposers = ['shortlist.updated', 'model.focused', 'view.set', 'presence.check'].map(name =>
    host.onEvent(`plugin.iolite.${name}`, ({ payload } = {}) => {
      if (!validEvent(name, payload)) return
      if (name !== 'presence.check') setState(prev => applyEvent(prev, name, payload))
      // Receipts confirm a listener handled the event. They carry no model or user data and
      // are optional: a missing REST route must never stop live visual updates.
      if (/^[a-f0-9]{32}$/.test(payload.receipt) && ctx && typeof ctx.rest === 'function') {
        try {
          Promise.resolve(ctx.rest('/pane-receipt', { method: 'POST', body: { receipt: payload.receipt } })).catch(() => {})
        } catch { /* older Desktop: no REST support */ }
      }
    }))
  return () => { for (const dispose of disposers) if (typeof dispose === 'function') dispose() }
}
