#!/usr/bin/env node
// Per-model pages + embeddable cards — MVP (council pick 2026-08-26; consult move #1).
// Reads data/models.v0.draft.json (site source of truth, since 3479ef0) -> writes static, self-contained (zero JS,
// zero external assets) pages under public/m/<slug>/ and public/embed/<slug>.html,
// plus public/m/index.html (all-models index). Regenerated with every catalog refresh
// (catalog-auto-update.sh can chain it); pages carry per-field provenance chips and
// rank context computed at gen time. NEVER hand-edit generated pages.
//
// 2026-08-29 (distribution-surface plan, phase 0+1): shared slug lib; canonical +
// og/twitter + JSON-LD (WebPage/Breadcrumb per card, one Dataset on the index);
// per-field provenance chips from the catalog `sources` map; embed copy truth fix
// (public deploys are approval-gated — cards update on deploy, not per refresh);
// committed alias registry -> public/_redirects with a stale-target build guard.
// Templates/sitemap are exported pure (createTemplates/buildSitemap) for vitest.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slug } from './lib/slug.mjs';
import { selectComparePairsDetailed } from './lib/compare-pairs.mjs';
import { loadCatalog } from './lib/catalog-loader.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://viz.kyanitelabs.tech';
const pct = (v, vals) => {
  const s = vals.filter(x => x != null);
  if (v == null || !s.length) return null;
  return Math.round((100 * s.filter(x => x <= v).length) / s.length);
};
const num = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d).replace(/\.?0+$/, ''));
const money = v => (v == null ? '—' : '$' + (v < 10 ? Number(v.toFixed(3)) : Number(v.toFixed(1))));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON-LD must keep its quotes; only < needs neutralizing (</script> breakout).
const jsonld = o => JSON.stringify(o).replace(/</g, '\\u003c');

const CSS = `*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#17202a;background:#fff}
.w{max-width:720px;margin:0 auto;padding:28px 20px}a{color:#0b62d6}
.chip{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;background:#eef3fb;margin:0 4px 4px 0}
.open{background:#e6f6ec}.prov{font-size:11px;color:#6b7686}
h1{font-size:24px;margin:0 0 2px}.sub{color:#6b7686;margin:0 0 12px;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:16px 0}
.kpi{border:1px solid #e3e8ef;border-radius:10px;padding:10px 12px}.kpi b{display:block;font-size:20px}
.kpi span{font-size:12px;color:#6b7686}
.pct{font-size:11px;color:#6b7686}.bar{height:4px;background:#eef3fb;border-radius:2px;margin-top:4px}
.bar i{display:block;height:4px;border-radius:2px;background:#0b62d6}
.note{border-top:1px solid #e3e8ef;margin-top:18px;padding-top:10px;font-size:12px;color:#6b7686}
pre{background:#f5f7fa;border:1px solid #e3e8ef;border-radius:8px;padding:10px;font-size:12px;overflow:auto}`;
// Path C hygiene (2026-08-29): every generated surface carries the
// non-affiliation line + the attribution/takedown page link.
const FOOTER = `<p class=note>Model names are trademarks of their respective owners. Not affiliated with, endorsed by, or sponsored by any provider or measurement service. <a href="${ORIGIN}/sources/">Sources, attribution &amp; corrections</a>.</p>`;

// ---- pure template factory (exported for tests) ----
export function createTemplates(rows, dataDate, compareBySlug = {}) {
  const TPS = rows.map(r => r.tps), PRICE = rows.map(r => r.blended_price_per_M), II = rows.map(r => r.aa_intelligence_index);

  // per-field provenance: catalog rows carry sources.<field>.kind = measured|derived|list
  const provKind = (r, field) => r.sources?.[field]?.kind ?? null;

  function metrics(r) {
    // price percentile inverts (cheaper = higher); null price must stay null —
    // `?? 0` here fabricated P100 "cheapest" bars for unmeasured prices (found
    // in review 2026-08-29; shipped on seed-2-1-turbo / ox-alpha-stealth).
    const pricePct = pct(r.blended_price_per_M, PRICE);
    const m = [
      ['Speed (tok/s)', num(r.tps, 1), pct(r.tps, TPS), provKind(r, 'tps')],
      ['Blended $/M tok', money(r.blended_price_per_M), pricePct == null ? null : 100 - pricePct, provKind(r, 'blended_price_per_M')],
      ['Intelligence index', r.aa_intelligence_index ?? '—', pct(r.aa_intelligence_index, II), provKind(r, 'aa_intelligence_index')],
      ['TTFT', r.ttft != null ? num(r.ttft, 0) + ' ms' : '—', null, provKind(r, 'ttft')],
      ['Context', r.context_length != null ? Math.round(r.context_length / 1000) + 'k' : '—', null, provKind(r, 'context_length')],
    ];
    if (r.coding_index != null) m.push(['Coding index', num(r.coding_index, 0), null, provKind(r, 'coding_index')]);
    if (r.agentic_index != null) m.push(['Agentic index', num(r.agentic_index, 0), null, provKind(r, 'agentic_index')]);
    return m;
  }
  const kpi = ([label, val, p, kind]) => `<div class=kpi><b>${esc(val)}</b><span>${esc(label)}${p != null ? ` · P${p}` : ''}${kind ? ` · <span class=prov>${esc(kind)}</span>` : ''}</span>${p != null ? `<div class=bar><i style="width:${Math.max(3, p)}%"></i></div>` : ''}</div>`;

  function page(r) {
    const s = slug(r.model);
    const url = `${ORIGIN}/m/${s}/`;
    const chips = [r.provider, r.openness, ...(r.modality || [])].filter(Boolean).map(c => `<span class="chip ${c === 'open' ? 'open' : ''}">${esc(c)}</span>`).join('');
    const embed = `&lt;iframe src="${ORIGIN}/embed/${s}" width="100%" height="150" style="border:1px solid #e3e8ef;border-radius:10px" title="${esc(r.model)} — Kyanite Labs model card"&gt;&lt;/iframe&gt;`;
    const desc = `${r.model} by ${r.provider}: ${num(r.tps, 1)} tok/s, ${money(r.blended_price_per_M)}/M blended, intelligence index ${r.aa_intelligence_index ?? '—'}. Catalog ${dataDate}.`;
    return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>${esc(r.model)} — measured model card | Kyanite Labs</title>
<meta name=description content="${esc(desc)}">
<link rel=canonical href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Kyanite Labs Model Observatory">
<meta property="og:title" content="${esc(r.model)} — measured model card"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${ORIGIN}/og-image.png">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(r.model)} — measured model card"><meta name="twitter:description" content="${esc(desc)}">
<script type="application/ld+json">${jsonld({
      '@context': 'https://schema.org', '@type': 'WebPage', name: `${r.model} — measured model card`, url,
      description: desc, isPartOf: { '@type': 'WebSite', name: 'Kyanite Labs Model Observatory', url: ORIGIN + '/' },
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Model Observatory', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Model cards', item: ORIGIN + '/m/' },
        { '@type': 'ListItem', position: 3, name: r.model, item: url }] },
      dateModified: dataDate || undefined })}</script>
<style>${CSS}</style></head><body><div class=w>
<h1>${esc(r.model)}</h1>
<p class=sub>${chips}</p>
<div class=grid>${metrics(r).map(kpi).join('')}</div>
<p><b>Embed this card</b> (static and self-contained; updates when the site deploys — public deploys are approval-gated):</p>
<pre>${embed}</pre>
${compareBySlug[s]?.length ? `<p><b>Comparisons</b> (measured vs nearest neighbors): ${compareBySlug[s].map(o => `<a href="${o.path}">${esc(o.other)}</a>`).join(' · ')}</p>` : ''}
<p class=note>Released ${esc(r.release_date ?? '—')} · catalog data ${esc(dataDate)} · field-level provenance shown per metric above
(measured / derived / list, from the catalog <code>sources</code> map); percentiles computed across the ${rows.length}-model catalog at generation time.
Numbers are catalog-sourced and labeled as such — lab-measured lanes stay separate by design. Generated page — do not hand-edit.</p>
${FOOTER}
</div></body></html>`;
  }

  function embedCard(r) {
    return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>${esc(r.model)} — model card</title><style>${CSS}body{background:transparent}</style></head><body><div class=w style="max-width:640px;padding:10px">
<h1 style="font-size:16px">${esc(r.model)} <span class=prov>${esc(r.provider)}</span></h1>
<div class=grid style="margin:6px 0;gap:6px">${metrics(r).slice(0, 3).map(([l, v]) => `<div class=kpi style=padding:6px 8px><b style="font-size:15px">${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
<p class=prov>catalog ${esc(dataDate)} · <a href="${ORIGIN}/m/${slug(r.model)}/">full card →</a> · <a href="${ORIGIN}/sources/">sources</a></p>
</div></body></html>`;
  }

  function indexPage() {
    const items = rows.map(r => { const s = slug(r.model); return s ? `<p><a href="/m/${s}/">${esc(r.model)}</a> <span class="prov">${esc(r.provider)} · ${num(r.tps, 1)} tok/s · ${money(r.blended_price_per_M)}/M · ii ${r.aa_intelligence_index ?? '—'}</span></p>` : ''; }).filter(Boolean).join('\n');
    return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>All model cards (${rows.length}) | Kyanite Labs</title>
<link rel=canonical href="${ORIGIN}/m/">
<script type="application/ld+json">${jsonld({
      '@context': 'https://schema.org', '@type': 'Dataset',
      name: 'Model Observatory catalog — measured LLM benchmarks', url: ORIGIN + '/m/',
      description: `Speed, price, and intelligence measurements for ${rows.length} language models, with per-field provenance. Catalog data ${dataDate}.`,
      creator: { '@type': 'Organization', name: 'Kyanite Labs', url: ORIGIN },
      variableMeasured: ['aa_intelligence_index', 'tps', 'ttft', 'blended_price_per_M', 'price_in_per_M', 'price_out_per_M', 'openness', 'context_length'],
      distribution: { '@type': 'DataDownload', encodingFormat: 'text/plain', contentUrl: ORIGIN + '/llms-full.txt' },
      dateModified: dataDate || undefined, isAccessibleForFree: true })}</script>
<style>${CSS}</style></head><body><div class=w>
<h1>Model cards</h1><p class=sub>${rows.length} models · catalog ${dataDate} · each card self-contained and embeddable</p>
${items}
${FOOTER}
</div></body></html>`;
  }
  return { page, embedCard, indexPage, metrics };
}

// ---- sitemap (pure; single owner for /m/ + /compare/ + base URLs) ----
export function buildSitemap(prevBaseUrls, slugs, comparePaths = []) {
  const seen = new Set();
  const urlEntries = [];
  const addUrl = (loc, changefreq, priority) => {
    if (seen.has(loc)) return;
    seen.add(loc);
    urlEntries.push('  <url>', `    <loc>${loc}</loc>`, `    <changefreq>${changefreq}</changefreq>`, `    <priority>${priority}</priority>`, '  </url>');
  };
  for (const u of prevBaseUrls) addUrl(u, 'weekly', '1.0');
  addUrl(`${ORIGIN}/m/`, 'daily', '0.8');
  addUrl(`${ORIGIN}/frontier-watch.md`, 'daily', '0.8');
  for (const s of slugs) addUrl(`${ORIGIN}/m/${s}/`, 'daily', '0.6');
  for (const p of comparePaths) addUrl(ORIGIN + p, 'daily', '0.5');
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urlEntries, '</urlset>'].join('\n') + '\n';
}

// ---- alias registry -> _redirects (committed data/slug-aliases.json; old -> new) ----
export function buildRedirects(aliases, currentSlugs) {
  const stale = Object.entries(aliases).filter(([, target]) => !currentSlugs.has(target)).map(([, t]) => t);
  if (stale.length) throw new Error(`slug-aliases: target slug(s) missing from catalog: ${stale.join(', ')} — fix data/slug-aliases.json (rename? add the new entry)`);
  // an alias SOURCE colliding with a live slug would 301-shadow a real page
  const shadow = Object.keys(aliases).filter(from => currentSlugs.has(from));
  if (shadow.length) throw new Error(`slug-aliases: source slug(s) still live in catalog: ${shadow.join(', ')} — a redirect would shadow those pages`);
  return Object.entries(aliases).map(([from, to]) => `/m/${from}/ /m/${to}/ 301`).join('\n') + (Object.keys(aliases).length ? '\n' : '');
}

function main() {
  const rows = loadCatalog();
  // same catalog the site builds from (src/data/models.ts) — pages regenerate on every refresh
  const dataDate = rows.map(r => r.data_date).filter(Boolean).sort().pop() || '';
  const comparePairs = selectComparePairsDetailed(rows);
  const compareBySlug = {};
  for (const { path, a, b } of comparePairs) {
    (compareBySlug[slug(a)] ??= []).push({ path, other: b });
    (compareBySlug[slug(b)] ??= []).push({ path, other: a });
  }
  const { page, embedCard, indexPage } = createTemplates(rows, dataDate, compareBySlug);

  let n = 0;
  const slugs = [];
  for (const r of rows) {
    const s = slug(r.model);
    if (!s) continue;
    slugs.push(s);
    mkdirSync(join(ROOT, 'public/m', s), { recursive: true });
    writeFileSync(join(ROOT, `public/m/${s}/index.html`), page(r));
    mkdirSync(join(ROOT, 'public/embed'), { recursive: true });
    writeFileSync(join(ROOT, `public/embed/${s}.html`), embedCard(r));
    n++;
  }
  writeFileSync(join(ROOT, 'public/m/index.html'), indexPage());
  console.log(`gen-model-pages: ${n} model pages + ${n} embed cards + index -> public/m, public/embed (catalog ${dataDate})`);

  // sitemap: base URLs ride in from the previous file; /m/*, /compare/*,
  // /embed/* and frontier-watch.md are re-emitted here, so they must never
  // ride in (frontier-watch.md used to gain one duplicate <loc> per refresh — BUG-SMELL-REGISTRY).
  const SM = join(ROOT, 'public/sitemap.xml');
  let base = [ORIGIN + '/'];
  try {
    base = [...readFileSync(SM, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
      .filter(u => !u.includes('/m/') && !u.includes('/embed/') && !u.includes('/compare/') && !u.endsWith('/frontier-watch.md'));
  } catch { /* first run: keep default */ }
  // Path C hygiene surface (2026-08-29): the sources/attribution page is a permanent base URL.
  if (!base.includes(ORIGIN + '/sources/')) base.push(ORIGIN + '/sources/');
  writeFileSync(SM, buildSitemap(base, slugs, comparePairs.map(p => p.path)));
  console.log(`sitemap: ${base.length} base + ${slugs.length} model cards + ${comparePairs.length} compare pages`);

  // alias registry -> public/_redirects (stale targets fail the build — never ship a dead redirect)
  const aliases = existsSync(join(ROOT, 'data/slug-aliases.json'))
    ? JSON.parse(readFileSync(join(ROOT, 'data/slug-aliases.json'), 'utf8')) : {};
  writeFileSync(join(ROOT, 'public/_redirects'), buildRedirects(aliases, new Set(slugs)));
  if (Object.keys(aliases).length) console.log(`redirects: ${Object.keys(aliases).length} slug alias(es) -> public/_redirects`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
