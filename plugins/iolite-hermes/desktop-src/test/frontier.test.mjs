import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  Z_CONTEXT, Z_SPEED, beatenBy, buildLayout, costIntelligenceFront, decadeTicks, floorPosition, fmtPrice,
  fmtTokens, fmtTps, matchPicks, priceEpsilon, zValue,
} from '../src/frontier.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const snapshot = JSON.parse(readFileSync(path.join(here, '../src/snapshot.json'), 'utf8'))
const golden = JSON.parse(readFileSync(path.join(here, 'fixtures/front.json'), 'utf8'))
const M = (s, c, i, extra = {}) => ({ n: s, p: 'P', s, c, i, t: 'ECI', x: 1000, ...extra })

test('front matches decide.cost_intelligence_pareto on the bundled catalog', () => {
  const got = costIntelligenceFront(snapshot.models).map(m => m.s).sort()
  assert.deepEqual(got, golden.front)
})

test('front: nothing on it is beaten, everything off it is', () => {
  const front = costIntelligenceFront(snapshot.models)
  const beats = (a, b) => a.c <= b.c && a.i >= b.i && (a.c < b.c || a.i > b.i)
  for (const f of front) assert.ok(!snapshot.models.some(o => beats(o, f)), `${f.s} is beaten`)
  const onFront = new Set(front.map(m => m.s))
  for (const m of snapshot.models) if (!onFront.has(m.s)) assert.ok(snapshot.models.some(o => beats(o, m)), `${m.s} is off the front but unbeaten`)
})

test('front: equal price keeps the smartest, ties both stay, equal score at higher price drops', () => {
  const f = costIntelligenceFront([M('a', 1, 50), M('b', 1, 60), M('c', 1, 60), M('d', 2, 60), M('e', 3, 70)])
  assert.deepEqual(f.map(m => m.s), ['b', 'c', 'e'])
})

test('front: a free model is cheaper than any priced one', () => {
  const f = costIntelligenceFront([M('free', 0, 40), M('paid', 0.5, 40), M('smart', 0.5, 80)])
  assert.deepEqual(f.map(m => m.s), ['free', 'smart'])
})

test('front: empty and non-finite input is safe', () => {
  assert.deepEqual(costIntelligenceFront([]), [])
  assert.deepEqual(costIntelligenceFront([M('x', NaN, 5), M('y', 1, Infinity)]), [])
})

test('epsilon is half the cheapest positive price; free models land on it', () => {
  assert.equal(priceEpsilon([M('a', 0, 1), M('b', 0.2, 1), M('c', 5, 1)]), 0.1)
  const lay = buildLayout({ models: [M('a', 0, 40), M('b', 0.2, 50), M('c', 5, 60)] })
  const a = lay.points.find(p => p.id === 'a'), b = lay.points.find(p => p.id === 'b')
  assert.ok(a.free && a.px < b.px && a.px >= -1)
})

test('layout keeps every point inside the cube and counts what it leaves out', () => {
  const lay = buildLayout(snapshot, { z: Z_CONTEXT })
  assert.equal(lay.plotted, snapshot.plotted)
  assert.equal(lay.missingZ, 0)
  for (const p of lay.points) for (const k of ['px', 'py', 'pz']) assert.ok(p[k] >= -1.0001 && p[k] <= 1.0001, `${p.id} ${k}=${p[k]}`)
  assert.equal(lay.front.length, golden.front.length)
  assert.deepEqual(lay.front.map(p => p.m.c), lay.front.map(p => p.m.c).slice().sort((a, b) => a - b))
})

test('speed mode plots only models with a measured speed; context mode ignores speed', () => {
  const speed = { [snapshot.models[0].s]: { tps: 80 }, [snapshot.models[5].s]: { tps: 140 }, ghost: { tps: 5 } }
  const lay = buildLayout(snapshot, { z: Z_SPEED, speed })
  assert.equal(lay.plotted, 2)
  assert.equal(lay.missingZ, snapshot.plotted - 2)
  assert.equal(buildLayout(snapshot, { z: Z_SPEED, speed: null }).plotted, 0)
  assert.equal(buildLayout(snapshot, { z: Z_CONTEXT, speed }).plotted, snapshot.plotted)
})

test('never fakes speed: zero, negative, NaN and missing give no value', () => {
  const m = M('a', 1, 1)
  for (const tps of [0, -3, NaN, '9', null]) assert.equal(zValue(m, Z_SPEED, { a: { tps } }), null)
  assert.equal(zValue(m, Z_SPEED, {}), null)
  assert.equal(zValue(m, Z_SPEED, null), null)
  assert.equal(zValue(m, Z_SPEED, { a: { tps: 55 } }), 55)
})

test('floor position, picks and beaten-by', () => {
  const lay = buildLayout({ models: [M('a', 1, 40), M('b', 2, 60), M('c', 3, 50), M('d', 4, 90)] })
  assert.equal(floorPosition(lay.domains, 5000), null)
  assert.equal(floorPosition(lay.domains, NaN), null)
  const y = floorPosition(lay.domains, lay.domains.y.lo + (lay.domains.y.hi - lay.domains.y.lo) / 2)
  assert.ok(Math.abs(y) < 1e-9)
  assert.deepEqual([...matchPicks(lay.points, ['B', 'nope', 'd'])].sort(), ['b', 'd'])
  const c = lay.points.find(p => p.id === 'c')
  assert.equal(c.front, false)
  assert.equal(beatenBy(c, lay.front).id, 'b')
})

test('formatting matches the chat answers', () => {
  assert.equal(fmtPrice(0), '$0/M (free tier)')
  assert.equal(fmtPrice(0.2), '$0.20/M')
  assert.equal(fmtPrice(0.004), '$0.004/M')
  assert.equal(fmtPrice(16), '$16.00/M')
  assert.equal(fmtTokens(128000), '128K')
  assert.equal(fmtTokens(1050000), '1.05M')
  assert.equal(fmtTps(0.4), '0.4 tok/s')
  assert.equal(fmtTps(1234), '1,234 tok/s')
  assert.deepEqual(decadeTicks(0.01, 100), [0.01, 0.1, 1, 10, 100].map(v => v))
})

test('snapshot: counts add up, no speed field, no Artificial Analysis', () => {
  assert.equal(snapshot.plotted + snapshot.unplotted, snapshot.total)
  assert.equal(snapshot.models.length, snapshot.plotted)
  assert.equal(new Set(snapshot.models.map(m => m.s)).size, snapshot.models.length)
  const text = JSON.stringify(snapshot).toLowerCase()
  assert.ok(!text.includes('artificial analysis'))
  for (const m of snapshot.models) assert.ok(!('tps' in m) && !('speed' in m))
  assert.ok(snapshot.credits.some(c => /CC BY\b/.test(c) && /Epoch/.test(c)))
  assert.ok(snapshot.credits.some(c => /CC BY 4\.0/.test(c) && /Bradley-Terry/.test(c) && /not Elo/.test(c)))
  assert.ok(snapshot.credits.some(c => /LiteLLM/.test(c) && /MIT/.test(c)))
})

test('findModels reaches any plotted model by name, slug or provider, smartest first', async () => {
  const { findModels } = await import('../src/frontier.js')
  const pts = [
    { id: 'a', m: { n: 'GLM-5.3', s: 'zai/glm-5.3', p: 'Z.ai', i: 86 } },
    { id: 'b', m: { n: 'GLM-5.3 Air', s: 'zai/glm-5.3-air', p: 'Z.ai', i: 70 } },
    { id: 'c', m: { n: 'Kimi K3', s: 'moonshot/kimi-k3', p: 'Moonshot', i: 88 } },
  ]
  assert.deepEqual(findModels(pts, '').hits, [])
  assert.deepEqual(findModels(pts, 'glm').hits.map(p => p.id), ['a', 'b'])
  assert.deepEqual(findModels(pts, 'z.ai air').hits.map(p => p.id), ['b'])
  assert.deepEqual(findModels(pts, 'moonshot').hits.map(p => p.id), ['c'])
  const r = findModels(pts, 'glm', 1)
  assert.equal(r.total, 2); assert.equal(r.hits.length, 1)
})

test('a $0 task cost says prepaid or free tier', async () => {
  const { fmtTaskCost } = await import('../src/frontier.js')
  assert.equal(fmtTaskCost(0, { mp: { plan: 'x' } }), '$0 (prepaid)')
  assert.equal(fmtTaskCost(0, {}), '$0 (free tier)')
  assert.equal(fmtTaskCost(0.5, {}), '$0.50')
})

test('keepApart drops tick labels that would touch', async () => {
  const { keepApart } = await import('../src/frontier.js')
  const box = (l, w = 20) => ({ l, r: l + w, t: 0, b: 14 })
  assert.deepEqual(keepApart([box(0), box(30), box(60)]), [0, 1, 2])
  assert.deepEqual(keepApart([box(0), box(10), box(30), box(45)]), [0, 2])
  assert.deepEqual(keepApart([box(0), box(22)], 4), [0])
  const stacked = [{ l: 0, r: 20, t: 0, b: 14 }, { l: 0, r: 20, t: 20, b: 34 }, { l: 0, r: 20, t: 26, b: 40 }]
  assert.deepEqual(keepApart(stacked), [0, 1])
  assert.deepEqual(keepApart([]), [])
})

test('keepApart keeps tick labels off reserved axis titles', async () => {
  const { keepApart } = await import('../src/frontier.js')
  const title = { l: 0, r: 100, t: 0, b: 14 }
  assert.deepEqual(keepApart([{ l: 50, r: 70, t: 2, b: 12 }, { l: 120, r: 140, t: 2, b: 12 }], 4, [title]), [1])
})
