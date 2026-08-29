import { describe, it, expect } from 'vitest';
import { slug } from '../scripts/lib/slug.mjs';
import { createTemplates, buildSitemap, buildRedirects } from '../scripts/gen-model-pages.mjs';

const ROWS = [
  { model: 'Test Model (Reasoning)', provider: 'TestLab', openness: 'open', modality: ['text'],
    tps: 10.5, blended_price_per_M: 2.5, aa_intelligence_index: 40, ttft: 300, context_length: 128000,
    coding_index: null, data_date: '2026-08-29',
    sources: { tps: { origin: 'aa-api', kind: 'measured' }, blended_price_per_M: { origin: 'curated', kind: 'derived' }, aa_intelligence_index: { origin: 'aa-api', kind: 'measured' } } },
  { model: 'Null Model', provider: 'NLab', openness: 'closed', modality: ['text'],
    tps: null, blended_price_per_M: null, aa_intelligence_index: null, ttft: null, context_length: null,
    data_date: '2026-08-29', sources: {} },
];
const T = createTemplates(ROWS, '2026-08-29');
const ldJson = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

describe('slug (single owner: scripts/lib/slug.mjs)', () => {
  it('strips trailing dashes from names ending in punctuation (frontier-watch bug class)', () => {
    expect(slug('Grok 4.6 (high)')).toBe('grok-4-6-high');
    expect(slug('Test Model (Reasoning)')).toBe('test-model-reasoning');
  });
  it('maps + to plus so Command A and Command A+ cannot collide', () => {
    expect(slug('Command A+')).toBe('command-aplus');
    expect(slug('Command A')).toBe('command-a');
  });
});

describe('model page (createTemplates.page)', () => {
  const html = T.page(ROWS[0]);
  it('carries canonical, og and twitter metadata', () => {
    expect(html).toContain('<link rel=canonical href="https://viz.kyanitelabs.tech/m/test-model-reasoning/">');
    expect(html).toContain('property="og:url"');
    expect(html).toContain('name="twitter:card"');
  });
  it('carries parseable WebPage + BreadcrumbList JSON-LD', () => {
    const ld = ldJson(html);
    expect(ld['@type']).toBe('WebPage');
    expect(ld.breadcrumb['@type']).toBe('BreadcrumbList');
    expect(ld.breadcrumb.itemListElement).toHaveLength(3);
  });
  it('renders per-field provenance chips from the sources map', () => {
    expect(html).toContain('>measured</span>');
    expect(html).toContain('>derived</span>');
  });
  it('embed copy no longer claims always-current liveness (public deploys are approval-gated)', () => {
    expect(html).not.toContain('always current');
    expect(html).toContain('updates when the site deploys');
  });
  it('renders nulls as em-dash, never as NaN or 0', () => {
    const nullHtml = T.page(ROWS[1]);
    expect(nullHtml).toContain('>—</b>');
    expect(nullHtml).not.toContain('NaN');
  });
  it('NEVER fabricates a percentile for an unmeasured value (P100 honesty bug, review 2026-08-29)', () => {
    const nullHtml = T.page(ROWS[1]);
    expect(nullHtml).not.toContain('P100');
    expect(nullHtml).not.toContain('P0<');
    expect(nullHtml).not.toContain('width:100%');
    expect(nullHtml).not.toContain('width:3%');
  });
  it('escapes hostile model names in attributes and keeps JSON-LD parseable', () => {
    const hostile = { ...ROWS[0], model: 'Evil "Quote" & <Angle> Model' };
    const html = T.page(hostile);
    expect(html).not.toMatch(/title="[^"]*"[^>]*"[^>]*>/); // no raw quote breaks out of the first attr
    expect(() => ldJson(html)).not.toThrow();
    expect(ldJson(html).name).toContain('Evil "Quote" & <Angle> Model');
  });
});

describe('index page', () => {
  it('carries the ONE catalog-level Dataset JSON-LD with required properties', () => {
    const ld = ldJson(T.indexPage());
    expect(ld['@type']).toBe('Dataset');
    expect(ld.variableMeasured.length).toBeGreaterThan(4);
    expect(ld.creator.name).toBe('Kyanite Labs');
    expect(ld.distribution.contentUrl).toContain('/llms-full.txt');
    expect(ld.dateModified).toBe('2026-08-29');
  });
});

describe('sitemap (single-owner emission)', () => {
  const slugs = ['alpha', 'beta'];
  it('is idempotent: same inputs -> byte-identical output', () => {
    const a = buildSitemap(['https://viz.kyanitelabs.tech/'], slugs);
    const b = buildSitemap(['https://viz.kyanitelabs.tech/'], slugs);
    expect(a).toBe(b);
  });
  it('never emits a duplicate <loc> even if generator-owned URLs ride in as base', () => {
    const polluted = ['https://viz.kyanitelabs.tech/', 'https://viz.kyanitelabs.tech/m/alpha/',
      'https://viz.kyanitelabs.tech/frontier-watch.md'];
    const xml = buildSitemap(polluted, slugs);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
  });
});

describe('slug alias registry -> _redirects', () => {
  it('emits 301 lines for registry entries', () => {
    expect(buildRedirects({ 'old-name': 'new-name' }, new Set(['new-name'])))
      .toBe('/m/old-name/ /m/new-name/ 301\n');
  });
  it('fails the build on a stale target (never ship a dead redirect)', () => {
    expect(() => buildRedirects({ 'old': 'renamed-away' }, new Set(['current']))).toThrow(/missing from catalog/);
  });
  it('fails the build when an alias source is still a live slug (redirect would shadow a real page)', () => {
    expect(() => buildRedirects({ 'live-page': 'elsewhere' }, new Set(['live-page', 'elsewhere']))).toThrow(/still live/);
  });
  it('emits an empty file for an empty registry', () => {
    expect(buildRedirects({}, new Set(['x']))).toBe('');
  });
});
