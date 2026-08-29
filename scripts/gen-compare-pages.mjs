#!/usr/bin/env node
// Compare pages — plan 2026-08-29 phase 2 (staged: capped pair set; raise only
// at the GSC checkpoint). One page per unordered pair from
// scripts/lib/compare-pairs.mjs (shared with gen-model-pages so /m/ comparison
// links and emitted pages can never disagree). Honesty contract (blocking,
// per consensus review): "beats" language ONLY on actual price×intelligence
// dominance among measured values; verdicts computed only over fields non-null
// on BOTH sides; null cells render em-dash + provenance; conditional fields
// render "not measured for both" rather than silently omitting; data_date on
// every page. Pages are zero-JS static; JSON-LD = WebPage + BreadcrumbList.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slug } from './lib/slug.mjs';
import { selectComparePairs, comparePath } from './lib/compare-pairs.mjs';
import { loadCatalog } from './lib/catalog-loader.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://viz.kyanitelabs.tech';
const CAP = 250; // staged rollout bound — pair-selection hard cap, do not raise without the GSC checkpoint
const num = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d).replace(/\.?0+$/, ''));
const money = v => (v == null ? '—' : '$' + (v < 10 ? Number(v.toFixed(3)) : Number(v.toFixed(1))));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonld = o => JSON.stringify(o).replace(/</g, '\\u003c');
const prov = (r, f) => r.sources?.[f]?.kind ?? null;

const CSS = `*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#17202a;background:#fff}
.w{max-width:760px;margin:0 auto;padding:28px 20px}a{color:#0b62d6}
.verdict{border:1px solid #e3e8ef;border-left:4px solid #0b62d6;border-radius:8px;padding:10px 14px;margin:14px 0;font-size:16px}
.trade{border-left-color:#e0a800}
h1{font-size:22px;margin:0 0 2px}.sub{color:#6b7686;margin:0 0 12px;font-size:13px}
table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border-bottom:1px solid #e3e8ef;padding:8px 10px;text-align:left;font-size:14px}
th{font-size:12px;color:#6b7686;text-transform:uppercase;letter-spacing:.04em}
td b{font-size:16px}.prov{font-size:11px;color:#6b7686}
.note{border-top:1px solid #e3e8ef;margin-top:18px;padding-top:10px;font-size:12px;color:#6b7686}`;

// rows already filtered to measured (price+ii non-null) by pair selection
export function createCompareTemplates(rows, dataDate) {
  const bySlug = new Map(rows.map(r => [slug(r.model), r]));

  function verdict(a, b) {
    // dominance on price × intelligence — both sides measured by construction,
    // but guard anyway: an unmeasured side NEVER yields a directional verdict.
    if (a.blended_price_per_M == null || b.blended_price_per_M == null ||
        a.aa_intelligence_index == null || b.aa_intelligence_index == null)
      return { cls: 'trade', text: `Not measured for both — no verdict.` };
    const aDom = (a.blended_price_per_M <= b.blended_price_per_M && a.aa_intelligence_index >= b.aa_intelligence_index &&
      (a.blended_price_per_M < b.blended_price_per_M || a.aa_intelligence_index > b.aa_intelligence_index));
    const bDom = (b.blended_price_per_M <= a.blended_price_per_M && b.aa_intelligence_index >= a.aa_intelligence_index &&
      (b.blended_price_per_M < a.blended_price_per_M || b.aa_intelligence_index > a.aa_intelligence_index));
    if (aDom) return { cls: '', text: `${a.model} beats ${b.model}: cheaper (${money(a.blended_price_per_M)} vs ${money(b.blended_price_per_M)}/M) and at least as smart (index ${num(a.aa_intelligence_index, 1)} vs ${num(b.aa_intelligence_index, 1)}).` };
    if (bDom) return { cls: '', text: `${b.model} beats ${a.model}: cheaper (${money(b.blended_price_per_M)} vs ${money(a.blended_price_per_M)}/M) and at least as smart (index ${num(b.aa_intelligence_index, 1)} vs ${num(a.aa_intelligence_index, 1)}).` };
    const cheap = a.blended_price_per_M <= b.blended_price_per_M ? a : b;
    const smart = a.aa_intelligence_index >= b.aa_intelligence_index ? a : b;
    return { cls: 'trade', text: `Trade-off: ${cheap.model} is cheaper (${money(cheap.blended_price_per_M)} vs ${money(cheap === a ? b.blended_price_per_M : a.blended_price_per_M)}/M); ${smart.model} scores higher on intelligence (${num(smart.aa_intelligence_index, 1)} vs ${num(smart === a ? b.aa_intelligence_index : a.aa_intelligence_index, 1)}).` };
  }

  function cell(r, field, fmt) {
    const v = r[field];
    const k = prov(r, field);
    return `<td><b>${esc(fmt ? fmt(v) : v)}</b>${k ? ` <span class=prov>${esc(k)}</span>` : ''}</td>`;
  }

  function page(a, b) {
    const path = comparePath(a.model, b.model);
    const url = ORIGIN + path;
    const v = verdict(a, b);
    const rowDef = [
      ['Speed (tok/s)', 'tps', x => num(x, 1)],
      ['Blended $/M', 'blended_price_per_M', money],
      ['Intelligence index', 'aa_intelligence_index', x => num(x, 1)],
      ['TTFT (ms)', 'ttft', x => num(x, 0)],
      ['Context', 'context_length', x => x == null ? '—' : Math.round(x / 1000) + 'k'],
    ];
    // conditional fields: only when BOTH sides measured — otherwise one row
    // states "not measured for both" instead of silently vanishing
    const cond = [];
    for (const [label, f, fmt] of [['Coding index', 'coding_index', x => num(x, 0)], ['Agentic index', 'agentic_index', x => num(x, 0)]]) {
      if (a[f] != null && b[f] != null) cond.push([label, f, fmt]);
      else cond.push([label, null, null]);
    }
    const tableRows = [...rowDef, ...cond].map(([label, f, fmt]) => {
      const cells = f == null
        ? `<td colspan=2 class=prov>not measured for both</td>`
        : cell(a, f, fmt) + cell(b, f, fmt);
      return `<tr><th>${esc(label)}</th>${cells}</tr>`;
    }).join('\n');
    const desc = `${a.model} vs ${b.model}: measured speed, price, intelligence compared with per-field provenance. Catalog ${dataDate}.`;
    return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>${esc(a.model)} vs ${esc(b.model)} — measured comparison | Kyanite Labs</title>
<meta name=description content="${esc(desc)}">
<link rel=canonical href="${url}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(a.model)} vs ${esc(b.model)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}">
<script type="application/ld+json">${jsonld({
      '@context': 'https://schema.org', '@type': 'WebPage', name: `${a.model} vs ${b.model}`, url, description: desc,
      isPartOf: { '@type': 'WebSite', name: 'Kyanite Labs Model Observatory', url: ORIGIN + '/' },
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Model Observatory', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Model cards', item: ORIGIN + '/m/' },
        { '@type': 'ListItem', position: 3, name: `${a.model} vs ${b.model}`, item: url }] },
      dateModified: dataDate || undefined })}</script>
<style>${CSS}</style></head><body><div class=w>
<h1>${esc(a.model)} <span class=sub>vs</span> ${esc(b.model)}</h1>
<p class=sub>${esc(a.provider)} · ${esc(b.provider)} · catalog ${esc(dataDate)}</p>
<div class="verdict ${v.cls}">${esc(v.text)}</div>
<table><tr><th></th><th>${esc(a.model)}</th><th>${esc(b.model)}</th></tr>
${tableRows}
</table>
<p><a href="/m/${slug(a.model)}/">${esc(a.model)} card</a> · <a href="/m/${slug(b.model)}/">${esc(b.model)} card</a> · <a href="/">3D observatory</a></p>
<p class=note>Verdicts use price×intelligence dominance only, and only where both sides are measured; null cells stay null with their provenance
(em-dash = not in catalog). Percentile-free by design — this page compares two models, not the field. Generated page — do not hand-edit.</p>
</div></body></html>`;
  }
  return { page, bySlug };
}

export function pairsFromPaths(paths, bySlug) {
  const out = [];
  for (const p of paths) {
    const m = p.match(/^\/compare\/([a-z0-9-]+)-vs-([a-z0-9-]+)\/$/);
    if (!m) continue;
    const a = bySlug.get(m[1]), b = bySlug.get(m[2]);
    if (a && b) out.push([a, b]);
  }
  return out;
}

function main() {
  const rows = loadCatalog();
  const dataDate = rows.map(r => r.data_date).filter(Boolean).sort().pop() || '';
  const { page, bySlug } = createCompareTemplates(rows, dataDate);
  const paths = selectComparePairs(rows, { cap: CAP });
  const DIR = join(ROOT, 'public/compare');
  rmSync(DIR, { recursive: true, force: true }); // stale pairs must not linger
  let n = 0;
  for (const [a, b] of pairsFromPaths(paths, bySlug)) {
    const p = comparePath(a.model, b.model);
    mkdirSync(join(ROOT, 'public', p), { recursive: true });
    writeFileSync(join(ROOT, 'public', p, 'index.html'), page(a, b));
    n++;
  }
  console.log(`gen-compare-pages: ${n} compare pages (cap ${CAP}, staged) -> public/compare (catalog ${dataDate})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
