import { describe, it, expect } from 'vitest';
import { computeFrontier } from '../scripts/frontier-watch.mjs';

describe('computeFrontier (price × intelligence Pareto)', () => {
  const row = (model, price, ii) => ({ model, provider: 'x', blended_price_per_M: price, aa_intelligence_index: ii, tps: 1 });
  it('keeps non-dominated models and drops dominated ones', () => {
    // 'dominated' (5,60) is strictly dominated by 'mid' (5,70): equal price, higher ii
    const f = computeFrontier([row('cheap-dumb', 1, 50), row('mid', 5, 70), row('dominated', 5, 60), row('dear-smart', 20, 90)]);
    expect(f.map(m => m.model)).toEqual(['cheap-dumb', 'mid', 'dear-smart']);
  });
  it('ignores rows missing either metric', () => {
    const f = computeFrontier([row('ok', 2, 60), { model: 'no-price', aa_intelligence_index: 99 }, { model: 'no-ii', blended_price_per_M: 0.1 }]);
    expect(f.map(m => m.model)).toEqual(['ok']);
  });
  it('sorts cheapest first', () => {
    const f = computeFrontier([row('b', 9, 90), row('a', 1, 10)]);
    expect(f[0].model).toBe('a');
  });
});
