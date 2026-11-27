import test from 'node:test'
import assert from 'node:assert/strict'
import { draftPrice, toDraft, toPlan } from '../src/plans-model.js'

test('custom saved subscription periods survive editing and saving', () => {
  for (const period_months of [2, 18, 1.5]) {
    const saved = { name: 'Custom', mode: 'amortized', paid_usd: 180, period_months,
      tokens_per_month_m: 10, models: ['gpt-6.1-sol'], match: [] }
    const draft = toDraft(saved)
    assert.equal(draft.months, period_months)
    assert.deepEqual(toPlan(draft).plan, saved)
    assert.match(toPlan({ ...draft, months: 0 }).problem, /positive subscription period/)
  }
})

test('an early measured price says it will move', () => {
  const d = { mode: 'amortized', paid: '288', months: 12, tokens: '' }
  const saved = { usd_per_m: 54, measured: { tokens_per_month_m: 0.4, days: 1, early: true } }
  assert.match(draftPrice(d, saved), /over 1 day\. Early estimate: under 7 days of use, so expect it to move$/)
  assert.doesNotMatch(draftPrice(d, { ...saved, measured: { ...saved.measured, days: 9, early: false } }), /Early/)
})
