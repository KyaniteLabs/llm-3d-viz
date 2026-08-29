import { describe, it, expect } from 'vitest';
import { seedFromLogLines, mergeEvents, buildAtom } from '../scripts/lib/atom.mjs';

describe('frontier event seeding', () => {
  it('parses dated markdown log lines into structured events', () => {
    const evts = seedFromLogLines([['- **2026-08-27** NEW on frontier: GLM-5.3-Flash (Z AI) — $0.10/M at intelligence 57.5']]);
    expect(evts).toEqual([{ date: '2026-08-27', text: 'NEW on frontier: GLM-5.3-Flash (Z AI) — $0.10/M at intelligence 57.5' }]);
  });
  it('ignores non-matching lines', () => {
    expect(seedFromLogLines([['- 2026-08-27 no movement this refresh'], ['garbage']])).toEqual([]);
  });
});

describe('durable history merge', () => {
  it('dedupes by date+text (reruns and seeds overlap safely)', () => {
    const existing = [{ date: '2026-08-28', text: 'A' }];
    const merged = mergeEvents(existing, [{ date: '2026-08-28', text: 'A' }, { date: '2026-08-29', text: 'B' }]);
    expect(merged).toHaveLength(2);
  });
  it('sorts newest-first', () => {
    const merged = mergeEvents([{ date: '2026-08-27', text: 'old' }], [{ date: '2026-08-29', text: 'new' }]);
    expect(merged[0].date).toBe('2026-08-29');
  });
});

describe('atom feed (frontier-watch.xml)', () => {
  const EVENTS = [
    { date: '2026-08-27', text: 'NEW on frontier: GLM-5.3-Flash (Z AI) — $0.10/M' },
    { date: '2026-08-28', text: 'PRICE CUT: Agnes 2.5 Pro & Beta −20%' },
    { date: '2026-08-29', text: 'LEFT frontier: Hy3 (dominated)' },
  ];
  it('is well-formed Atom: xml decl, feed, self+alternate links, entries', () => {
    const xml = buildAtom(EVENTS);
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain('rel="self" href="https://viz.kyanitelabs.tech/frontier-watch.xml"');
    expect((xml.match(/<entry>/g) || []).length).toBe(3);
  });
  it('<updated> = newest event only (no-movement runs must not churn readers)', () => {
    expect(buildAtom(EVENTS)).toContain('<updated>2026-08-29T00:00:00Z</updated>');
  });
  it('entries are newest-first', () => {
    const xml = buildAtom(EVENTS);
    expect(xml.indexOf('LEFT frontier: Hy3')).toBeLessThan(xml.indexOf('NEW on frontier: GLM-5.3-Flash'));
  });
  it('escapes XML-hostile characters in event text (model names carry — and &)', () => {
    const xml = buildAtom([{ date: '2026-08-29', text: 'A & B <merge> "quoted"' }]);
    expect(xml).toContain('<title>A &amp; B &lt;merge&gt; &quot;quoted&quot;</title>');
    expect(xml).not.toContain('A & B');
  });
  it('respects the entry limit', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ date: '2026-08-29', text: `event ${i}` }));
    expect((buildAtom(many).match(/<entry>/g) || []).length).toBe(50);
  });
});
