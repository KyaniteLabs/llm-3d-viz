import test from 'node:test'
import assert from 'node:assert/strict'
import { subscribePaneEvents } from '../src/pane-events.js'

function pane() {
  let state = { view: '3d', last: null, floor: undefined, focus_model: null, cameraReset: 0, announcement: '' }
  const listeners = new Map(), receipts = []
  const host = { onEvent: (name, fn) => { listeners.set(name, fn); return () => listeners.delete(name) } }
  const ctx = { rest: async (...args) => { receipts.push(args); return { ok: true } } }
  const dispose = subscribePaneEvents(host, ctx, update => { state = update(state) })
  return { get state() { return state }, listeners, receipts, dispose,
    emit: (name, payload) => listeners.get(`plugin.iolite.${name}`)({ type: `plugin.iolite.${name}`, payload }) }
}

test('shortlist events move the floor, mark picks and focus the first pick without reload', () => {
  const p = pane()
  p.emit('shortlist.updated', { floor: 60, objective: 'min_cost', picks: ['terra', 'sol'] })
  assert.equal(p.state.floor, 60)
  assert.deepEqual(p.state.last, { floor: 60, objective: 'min_cost', picks: ['terra', 'sol'] })
  assert.equal(p.state.focus_model, 'terra')
  assert.match(p.state.announcement, /60.*2 picks.*min_cost/)
  p.emit('shortlist.updated', { floor: 100, objective: 'balanced', picks: [] })
  assert.deepEqual(p.state.last.picks, [])
  assert.equal(p.state.focus_model, null)
})

test('model focus preserves the shortlist and view', () => {
  const p = pane()
  p.emit('shortlist.updated', { floor: 60, objective: 'balanced', picks: ['terra'] })
  p.emit('model.focused', { focus_model: 'sol' })
  assert.equal(p.state.focus_model, 'sol')
  assert.equal(p.state.view, '3d')
  assert.deepEqual(p.state.last.picks, ['terra'])
  assert.match(p.state.announcement, /sol/)
})

test('view.set applies only supplied controls, including floor zero and repeated resets', () => {
  const p = pane()
  p.emit('view.set', { view: '2d', floor: 0, focus_model: 'sol', reset_camera: true })
  assert.equal(p.state.view, '2d')
  assert.equal(p.state.floor, 0)
  assert.equal(p.state.focus_model, 'sol')
  assert.equal(p.state.cameraReset, 1)
  assert.match(p.state.announcement, /2D.*0.*sol.*reset/i)
  p.emit('view.set', { view: '3d', reset_camera: true })
  assert.equal(p.state.cameraReset, 2)
  assert.equal(p.state.focus_model, 'sol')
  assert.equal(p.state.floor, 0)
})

test('an applied command or presence probe receipts through the plugin route', () => {
  const p = pane(), receipt = 'a'.repeat(32)
  p.emit('view.set', { view: '2d', receipt })
  p.emit('presence.check', { receipt })
  assert.deepEqual(p.receipts, [
    ['/pane-receipt', { method: 'POST', body: { receipt } }],
    ['/pane-receipt', { method: 'POST', body: { receipt } }],
  ])
  assert.equal(p.state.view, '2d')
  p.dispose()
  assert.equal(p.listeners.size, 0)
})

test('malformed events leave the pane unchanged and do not acknowledge', () => {
  const p = pane(), before = p.state
  for (const payload of [null, {}, { view: '4d' }, { view: '2d', floor: NaN }, { view: '3d', reset_camera: 'true' }]) p.emit('view.set', payload)
  p.emit('shortlist.updated', { floor: 60, picks: 'not a list' })
  p.emit('model.focused', { focus_model: 3 })
  assert.equal(p.state, before)
  assert.deepEqual(p.receipts, [])
})

test('old Desktops and missing REST support are safe', () => {
  assert.doesNotThrow(() => subscribePaneEvents({}, {}, () => {})())
  let apply
  subscribePaneEvents({ onEvent: (name, fn) => { if (name.endsWith('view.set')) apply = fn; return () => {} } }, {}, () => {})
  assert.doesNotThrow(() => apply({ payload: { view: '2d', receipt: 'a'.repeat(32) } }))
})
