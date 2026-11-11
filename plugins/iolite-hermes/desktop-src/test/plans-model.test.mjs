import test from 'node:test'
import assert from 'node:assert/strict'
import { draftPrice } from '../src/plans-model.js'

test('an early measured price says it will move', () => {
  const d = { mode: 'amortized', paid: '288', months: 12, tokens: '' }
  const saved = { usd_per_m: 54, measured: { tokens_per_month_m: 0.4, days: 1, early: true } }
  assert.match(draftPrice(d, saved), /over 1 day\. Early estimate: under 7 days of use, so expect it to move$/)
  assert.doesNotMatch(draftPrice(d, { ...saved, measured: { ...saved.measured, days: 9, early: false } }), /Early/)
})
