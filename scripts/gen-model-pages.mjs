#!/usr/bin/env node
// Per-model pages + embeddable cards — MVP (council pick 2026-08-26; consult move #1).
// Reads data/atlas-catalog-snapshot.json -> writes static, self-contained (zero JS,
// zero external assets) pages under public/m/<slug>/ and public/embed/<slug>.html,
// plus public/m/index.html (all-models index). Regenerated with every catalog refresh
// (catalog-auto-update.sh can chain it); pages carry per-field provenance chips and
// rank context computed at gen time. NEVER hand-edit generated pages.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rows = JSON.parse(readFileSync(join(ROOT, 'data/models.v0.draft.json'), 'utf8'));
// same catalog the site builds from (src/data/models.ts) — pages regenerate on every refresh
const DATA_DATE = rows.map(r => r.data_date).filter(Boolean).sort().pop() || '';

const slug = m => m.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); // '+' -> 'plus' first: Command A vs Command A+ must not collide
const pct = (v, vals) => {
  const s = vals.filter(x => x != null);
  if (v == null || !s.length) return null;
  return Math.round((100 * s.filter(x => x <= v).length) / s.length);
};
const num = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d).replace(/\.?0+$/, ''));
const money = v => (v == null ? '—' : '$' + (v < 10 ? Number(v.toFixed(3)) : Number(v.toFixed(1))));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TPS = rows.map(r => r.tps), PRICE = rows.map(r => r.blended_price_per_M), II = rows.map(r => r.aa_intelligence_index);

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

function metrics(r) {
  const m = [
    ['Speed (tok/s)', num(r.tps, 1), pct(r.tps, TPS)],
    ['Blended $/M tok', money(r.blended_price_per_M), 100 - (pct(r.blended_price_per_M, PRICE) ?? 0)],
    ['Intelligence index', r.aa_intelligence_index ?? '—', pct(r.aa_intelligence_index, II)],
    ['TTFT', r.ttft != null ? num(r.ttft, 0) + ' ms' : '—', null],
    ['Context', r.context_length != null ? Math.round(r.context_length / 1000) + 'k' : '—', null],
  ];
  if (r.coding_index != null) m.push(['Coding index', num(r.coding_index, 0), null]);
  if (r.agentic_index != null) m.push(['Agentic index', num(r.agentic_index, 0), null]);
  return m;
}
const kpi = ([label, val, p]) => `<div class=kpi><b>${esc(val)}</b><span>${esc(label)}${p != null ? ` · P${p}` : ''}</span>${p != null ? `<div class=bar><i style="width:${Math.max(3, p)}%"></i></div>` : ''}</div>`;

function page(r) {
  const s = slug(r.model);
  const chips = [r.provider, r.openness, ...(r.modality || [])].filter(Boolean).map(c => `<span class="chip ${c === 'open' ? 'open' : ''}">${esc(c)}</span>`).join('');
  const embed = `&lt;iframe src="https://viz.kyanitelabs.tech/embed/${s}" width="100%" height="150" style="border:1px solid #e3e8ef;border-radius:10px" title="${esc(r.model)} — Kyanite Labs model card"&gt;&lt;/iframe&gt;`;
  return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>${esc(r.model)} — measured model card | Kyanite Labs</title>
<meta name=description content="${esc(r.model)} by ${esc(r.provider)}: ${num(r.tps, 1)} tok/s, ${money(r.blended_price_per_M)}/M blended, intelligence index ${r.aa_intelligence_index ?? '—'}. Catalog ${DATA_DATE}.">
<style>${CSS}</style></head><body><div class=w>
<h1>${esc(r.model)}</h1>
<p class=sub>${chips}</p>
<div class=grid>${metrics(r).map(kpi).join('')}</div>
<p><b>Embed this card</b> (live, always current — the page re-renders on every catalog refresh):</p>
<pre>${embed}</pre>
<p class=note>Released ${esc(r.release_date ?? '—')} · catalog data ${esc(DATA_DATE)} · fields carry per-metric provenance in the
<a href="https://viz.kyanitelabs.tech">3D observatory</a>; percentiles computed across the ${rows.length}-model catalog at generation time.
Numbers are catalog-sourced and labeled as such — lab-measured lanes stay separate by design. Generated page — do not hand-edit.</p>
</div></body></html>`;
}
function embedCard(r) {
  return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>${esc(r.model)} — model card</title><style>${CSS}body{background:transparent}</style></head><body><div class=w style="max-width:640px;padding:10px">
<h1 style="font-size:16px">${esc(r.model)} <span class=prov>${esc(r.provider)}</span></h1>
<div class=grid style="margin:6px 0;gap:6px">${metrics(r).slice(0, 3).map(([l, v]) => `<div class=kpi style=padding:6px 8px><b style="font-size:15px">${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
<p class=prov>catalog ${esc(DATA_DATE)} · <a href="https://viz.kyanitelabs.tech/m/${slug(r.model)}/">full card →</a></p>
</div></body></html>`;
}

let n = 0, index = [`<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>All model cards (${rows.length}) | Kyanite Labs</title><style>${CSS}</style></head><body><div class=w>
<h1>Model cards</h1><p class=sub>${rows.length} models · catalog ${DATA_DATE} · each card self-contained and embeddable</p>`];
for (const r of rows) {
  const s = slug(r.model);
  if (!s) continue;
  mkdirSync(join(ROOT, 'public/m', s), { recursive: true });
  writeFileSync(join(ROOT, `public/m/${s}/index.html`), page(r));
  mkdirSync(join(ROOT, 'public/embed'), { recursive: true });
  writeFileSync(join(ROOT, `public/embed/${s}.html`), embedCard(r));
  index.push(`<p><a href="/m/${s}/">${esc(r.model)}</a> <span class=prov>${esc(r.provider)} · ${num(r.tps, 1)} tok/s · ${money(r.blended_price_per_M)}/M · ii ${r.aa_intelligence_index ?? '—'}</span></p>`);
  n++;
}
index.push('</div></body></html>');
writeFileSync(join(ROOT, 'public/m/index.html'), index.join('\n'));
console.log(`gen-model-pages: ${n} model pages + ${n} embed cards + index -> public/m, public/embed (catalog ${DATA_DATE})`);
