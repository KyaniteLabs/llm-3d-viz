import test from 'node:test'
import assert from 'node:assert/strict'
import { applyMyPrices, buildLayout } from '../src/frontier.js'

const snap = {
  models: [
    { n: 'Cheap', s: 'cheap', i: 80, c: 0.2, x: 1e5 },
    { n: 'Smart', s: 'smart', i: 86, c: 2.15, x: 1e5 },
    { n: 'Mid', s: 'mid', i: 70, c: 1.0, x: 1e5 },
  ],
}

test('my prices replace list prices and keep the list price beside them', () => {
  const { snapshot, covered } = applyMyPrices(snap, { smart: { usd_per_m: 0, plan: 'Yearly plan', mode: 'sunk' } })
  assert.equal(covered, 1)
  const m = snapshot.models.find(x => x.s === 'smart')
  assert.equal(m.c, 0)
  assert.equal(m.l, 2.15)
  assert.deepEqual(m.mp, { plan: 'Yearly plan', mode: 'sunk' })
  assert.equal(snap.models[1].c, 2.15, 'the bundled snapshot is not mutated')
})

test('the front is recomputed on my price: a sunk smart model dominates a cheap list one', () => {
  const list = buildLayout(snap).front.map(p => p.id)
  assert.deepEqual(list, ['cheap', 'smart'])
  const mine = buildLayout(applyMyPrices(snap, { smart: { usd_per_m: 0, plan: 'p', mode: 'sunk' } }).snapshot).front.map(p => p.id)
  assert.deepEqual(mine, ['smart'])
})

test('bad or missing entries are ignored, never guessed', () => {
  for (const bad of [null, undefined, 'x', { smart: { usd_per_m: -1 } }, { smart: { usd_per_m: NaN } }, { smart: {} }, { __proto__: { smart: { usd_per_m: 0 } } }]) {
    const r = applyMyPrices(snap, bad)
    assert.equal(r.covered, 0)
    assert.equal(r.snapshot.models.find(x => x.s === 'smart').c, 2.15)
  }
})

test('a prepaid model reads prepaid, not free tier', async () => {
  const { fmtShownPrice } = await import('../src/frontier.js')
  const m = applyMyPrices(snap, { smart: { usd_per_m: 0, plan: 'p', mode: 'sunk' } }).snapshot.models.find(x => x.s === 'smart')
  assert.equal(fmtShownPrice(m), '$0/M (prepaid)')
  assert.equal(buildLayout({ models: [m] }).points[0].free, false)
})
