import { describe, it, expect } from 'vitest';
import { comparePath, selectComparePairs, selectComparePairsDetailed } from '../scripts/lib/compare-pairs.mjs';
import { createCompareTemplates, pairsFromPaths } from '../scripts/gen-compare-pages.mjs';
import { computeFrontier } from '../scripts/lib/frontier.mjs';

const mk = (model, price, ii, extra = {}) => ({
  model, provider: 'P', openness: 'open', modality: ['text'],
  blended_price_per_M: price, aa_intelligence_index: ii, tps: 10, ttft: 200,
  context_length: 64000, data_date: '2026-08-29', sources: { tps: { kind: 'measured' } }, ...extra,
});
// cheap + smart dominates everything; B and C trade off; D is dominated; N has no price
const ROWS = [
  mk('Alpha', 1.0, 50),
  mk('Bravo', 2.0, 60),
  mk('Charlie', 3.0, 70),
  mk('Delta', 10.0, 40), // dominated by Alpha
  mk('NoPrice', null, 55),
];

describe('pair selection', () => {
  it('canonical URL is the sorted unordered pair (both orders agree)', () => {
    expect(comparePath('Zulu Model', 'Alpha')).toBe(comparePath('Alpha', 'Zulu Model'));
    expect(comparePath('Zulu Model', 'Alpha')).toMatch(/^\/compare\/alpha-vs-zulu-model\/$/);
  });
  it('never pairs a model lacking price or intelligence (no verdict possible)', () => {
    const paths = selectComparePairs(ROWS).join(' ');
    expect(paths).not.toContain('noprice');
  });
  it('dedupes to unique paths and respects the staged cap', () => {
    const det = selectComparePairsDetailed(ROWS);
    const paths = det.map(d => d.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(selectComparePairs(ROWS, { cap: 1 })).toHaveLength(1);
  });
});

describe('honesty contract on compare pages', () => {
  const T = createCompareTemplates(ROWS, '2026-08-29');
  it('dominance verdict: only the actual dominator "beats"', () => {
    const html = T.page(ROWS[0], ROWS[3]); // Alpha dominates Delta
    expect(html).toContain('Alpha beats Delta');
    expect(html).not.toContain('Delta beats Alpha');
  });
  it('non-dominant pair gets trade-off phrasing, never "beats"', () => {
    const html = T.page(ROWS[0], ROWS[2]); // Alpha cheaper, Charlie smarter
    expect(html).toContain('Trade-off');
    expect(html).not.toMatch(/\bbeats\b/);
  });
  it('an unmeasured side yields NO verdict at all', () => {
    const html = T.page(ROWS[4], ROWS[0]); // NoPrice vs Alpha
    expect(html).toContain('Not measured for both');
    expect(html).not.toMatch(/\bbeats\b/);
    expect(html).not.toContain('Trade-off:');
  });
  it('conditional fields render "not measured for both" instead of vanishing', () => {
    const html = T.page(ROWS[0], ROWS[1]); // neither has coding/agentic indices
    expect((html.match(/not measured for both/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it('null metric cells stay em-dash with no fabricated numbers', () => {
    const html = T.page(ROWS[4], ROWS[0]);
    expect(html).toContain('<b>—</b>');
    expect(html).not.toContain('NaN');
  });
  it('carries canonical + parseable WebPage JSON-LD with data_date', () => {
    const html = T.page(ROWS[0], ROWS[1]);
    expect(html).toContain('<link rel=canonical');
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    expect(ld['@type']).toBe('WebPage');
    expect(ld.dateModified).toBe('2026-08-29');
  });
});

describe('frontier kernel extraction (lib/frontier.mjs)', () => {
  it('dominated model excluded, dominated model kept, matches known semantics', () => {
    const f = computeFrontier(ROWS);
    const names = f.map(r => r.model);
    expect(names).toContain('Alpha');
    expect(names).toContain('Bravo');
    expect(names).toContain('Charlie');
    expect(names).not.toContain('Delta');
    expect(names).not.toContain('NoPrice');
  });
});
