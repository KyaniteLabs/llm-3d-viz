import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyMyPrices, buildLayout, beatenBy, taskCount, xAxis, xValue, X_PRICE, X_TASK_COST, X_TASK_TIME, X_TASK_TOKENS } from '../src/frontier.js'
import { TEMPLATES, coveredBy, draftPrice, fromTemplate, splitCover, toDraft, toPlan } from '../src/plans-model.js'

// Three models with different strengths on each axis, so every view has its own front.
const snap = {
  models: [
    { n: 'Pricey-Terse', s: 'a', i: 90, c: 10, ci: 5, co: 25, x: 1e5 },     // dear per M, few tokens, fast
    { n: 'Cheap-Wordy', s: 'b', i: 90, c: 1, ci: 0.5, co: 2.5, x: 1e5 },     // cheap per M, many tokens, slow
    { n: 'Mid', s: 'c', i: 90, c: 3, ci: 2, co: 6, x: 1e5 },
    { n: 'Unmeasured', s: 'd', i: 95, c: 0.1, x: 1e5 },
  ],
}
const tasks = {
  a: { n: 5, in: 2000, out: 500, sec: 4 },
  b: { n: 5, in: 60000, out: 30000, sec: 90 },
  c: { n: 4, in: 10000, out: 2000, sec: 20 },
}

test('the four X views are different numbers', () => {
  const a = snap.models[0]
  assert.equal(xValue(a, X_PRICE, tasks), 10)
  assert.equal(xValue(a, X_TASK_COST, tasks), (2000 * 5 + 500 * 25) / 1e6)
  assert.equal(xValue(a, X_TASK_TIME, tasks), 4)
  assert.equal(xValue(a, X_TASK_TOKENS, tasks), 2500)
  assert.equal(xValue(snap.models[3], X_TASK_COST, tasks), null, 'no measurement, no value, no guess')
  assert.equal(taskCount(snap, tasks), 3)
})

test('each view recomputes its own front and leaves unmeasured models out', () => {
  const front = x => buildLayout(snap, { x, tasks }).front.map(p => p.m.s)
  assert.deepEqual(front(X_PRICE), ['d'])
  assert.deepEqual(front(X_TASK_TIME), ['a'])
  assert.deepEqual(front(X_TASK_TOKENS), ['a'])
  // per task: a = $0.0225, b = $0.105, c = $0.032
  assert.deepEqual(front(X_TASK_COST), ['a'])
  const l = buildLayout(snap, { x: X_TASK_COST, tasks })
  assert.equal(l.plotted, 3)
  assert.equal(l.missingX, 1)
  const b = l.points.find(p => p.id === 'b')
  assert.equal(beatenBy(b, l.front).id, 'a', 'beaten on the shown axis, not on list price')
})

test('cost per task uses your plan price on both directions', () => {
  const { snapshot } = applyMyPrices(snap, { b: { usd_per_m: 0, plan: 'Prepaid', mode: 'sunk' } })
  const b = snapshot.models.find(m => m.s === 'b')
  assert.equal(xValue(b, X_TASK_COST, tasks), 0)
  const l = buildLayout(snapshot, { x: X_TASK_COST, tasks })
  assert.deepEqual(l.front.map(p => p.m.s), ['b'], 'a prepaid plan wins cost per task')
  assert.ok(l.points.find(p => p.id === 'b').px >= -1, 'a $0 task cost still sits on the log axis')
})

test('axis titles and ticks follow the view', () => {
  assert.equal(xAxis(X_PRICE, true).title, 'YOUR PRICE $/M · LOG')
  assert.equal(xAxis(X_TASK_COST, true).title, 'YOUR COST PER TASK $ · LOG')
  assert.equal(xAxis(X_TASK_TIME).tick(10), '10s')
  assert.equal(xAxis(X_TASK_TOKENS).tick(10000), '10K')
  assert.equal(xAxis(X_TASK_COST).tick(0.001), '$0.001')
})

test('templates carry no amounts and cover real provider fragments', () => {
  for (const t of TEMPLATES) {
    const d = fromTemplate(t)
    assert.equal(d.paid, '')
    assert.equal(d.usd, '')
    assert.equal(d.tokens, '')
    assert.equal(d.mode, 'amortized', 'a template never implies $0 on its own')
    assert.ok(t.cover.length >= 3)
  }
  const real = JSON.parse(readFileSync(new URL('../src/snapshot.json', import.meta.url), 'utf8')).models
  for (const id of ['anthropic', 'openai', 'google', 'zai', 'minimax', 'moonshot', 'deepseek']) {
    const t = TEMPLATES.find(x => x.id === id)
    assert.ok(coveredBy(fromTemplate(t), real).length > 0, `${id} template covers catalog models`)
  }
})

test('drafts convert to the plans the Python half accepts', () => {
  const slugs = snap.models.map(m => m.s)
  assert.deepEqual(splitCover('=a, glm-  kimi-k3,x'), { models: ['a'], match: ['glm-', 'kimi-k3'] })
  // A fragment equal to a full slug keeps covering the longer slugs (regression: glm-5 dropped glm-5.3).
  assert.equal(coveredBy({ cover: 'glm-5' }, [{ s: 'glm-5' }, { s: 'glm-5.3' }, { s: 'glm-4.6' }]).length, 2)
  const sunk = toPlan({ name: 'P', mode: 'sunk', cover: 'glm-', paid: '', months: 12, tokens: '', usd: '' }, slugs)
  assert.deepEqual(sunk.plan, { name: 'P', mode: 'sunk', models: [], match: ['glm-'] })
  const sub = toPlan({ name: 'S', mode: 'amortized', cover: 'kimi-', paid: '120', months: 12, tokens: '', usd: '' }, slugs)
  assert.deepEqual(sub.plan, { name: 'S', mode: 'amortized', models: [], match: ['kimi-'], paid_usd: 120, period_months: 12 })
  assert.match(toPlan({ name: 'S', mode: 'amortized', cover: 'kimi-', paid: '', months: 12, tokens: '', usd: '' }, slugs).problem, /what you paid/)
  assert.match(toPlan({ name: 'F', mode: 'fixed', cover: 'gpt-', paid: '', months: 12, tokens: '', usd: '' }, slugs).problem, /price per million/)
  assert.match(toPlan({ name: 'N', mode: 'sunk', cover: 'ab', paid: '', months: 12, tokens: '', usd: '' }, slugs).problem, /which models/)
  assert.match(draftPrice({ mode: 'amortized', paid: '120', months: 12, tokens: '50' }), /^\$0\.20\/M/)
  assert.match(draftPrice({ mode: 'amortized', paid: '120', months: 12, tokens: '' }), /once Iolite has measured/)
  const round = toDraft({ name: 'R', mode: 'fixed', usd_per_m: 0.4, usd_per_m_set: 0.4, models: ['a'], match: ['glm-'] })
  assert.equal(round.cover, '=a, glm-')
  assert.deepEqual(toPlan(round, slugs).plan.models, ['a'], 'exact models survive a round trip')
  assert.equal(round.usd, '0.4')
})
