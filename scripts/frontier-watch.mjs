#!/usr/bin/env node
// Frontier Watch (FW-5, council-staged 2026-08-26, shipped same night) — "notify me
// when the frontier moves." Computes the measured Pareto frontier (blended price ↓ ×
// intelligence index ↑) from the catalog, diffs against the last run, and on movement:
// writes public/frontier-watch.{json,md} (public, dated movement log) and fires an
// alert through the pipeline's own alert lane (Forgejo issue + local notification).
// Baseline run (no previous state) records without alerting. Pure computation is
// exported for tests. Runs inside `npm run build` → rides the 3x-daily catalog cron.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireAlert } from './lib/catalog-alerts.mjs';
import { slug } from './lib/slug.mjs';
import { computeFrontier } from './lib/frontier.mjs';
import { seedFromLogLines, mergeEvents, buildAtom } from './lib/atom.mjs';
import { loadCatalog, DATA_PLANE } from './lib/catalog-loader.mjs';
// kernel re-export moved to scripts/lib/frontier.mjs (plan 2026-08-29 phase 2);
// kept here so existing imports (tests) stay stable.
export { computeFrontier };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Path C (2026-08-29): state + durable history are PLANE-KEYED — a public
// build (trimmed catalog) must never emit "model LEFT frontier" events into
// the private plane's history or vice versa. The public output filenames
// stay the same; only the side-state diverges.
const PLANE = DATA_PLANE; // 'public' | 'private' (from catalog-loader)
const STATE = join(ROOT, `.cache/frontier-watch/last${PLANE === 'public' ? '.public' : ''}.json`);
const OUT_JSON = join(ROOT, 'public/frontier-watch.json');
const OUT_MD = join(ROOT, 'public/frontier-watch.md');

const rows = loadCatalog();
const frontier = computeFrontier(rows);
const now = new Date();
const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;

const events = [];
if (prev) {
  const prevSet = new Map(prev.frontier.map(m => [m.model, m]));
  for (const m of frontier) {
    const p = prevSet.get(m.model);
    if (!p) { events.push({ key: `enter:${m.model}`, text: `NEW on frontier: ${m.model} (${m.provider}) — $${m.price.toFixed(2)}/M at intelligence ${m.ii}` }); continue; }
    if (m.price < p.price * 0.9) events.push({ key: `cut:${m.model}`, text: `PRICE CUT: ${m.model} $${p.price.toFixed(2)} → $${m.price.toFixed(2)}/M (−${Math.round(100 * (1 - m.price / p.price))}%)` });
    if (m.ii > p.ii) events.push({ key: `jump:${m.model}`, text: `INTELLIGENCE UP: ${m.model} index ${p.ii} → ${m.ii}` });
  }
  for (const m of prev.frontier) if (!frontier.some(f => f.model === m.model))
    events.push({ key: `exit:${m.model}`, text: `LEFT frontier: ${m.model} (dominated or delisted)` });
}

writeFileSync(OUT_JSON, JSON.stringify({ as_of: now.toISOString(), frontier, events }, null, 1));
let md = `# Frontier Watch — the measured Pareto frontier (price × intelligence)\n\nComputed ${now.toISOString()} from the live catalog (${rows.length} models; frontier = ${frontier.length}). Regenerated on every catalog refresh (3×/day); the public site deploys on approval, so the public copy updates when the site deploys. Alerts fire on movement.\n\n## Current frontier (cheapest first)\n\n| model | provider | $/M blended | intelligence | tok/s |\n|---|---|---|---|---|\n`;
for (const m of frontier) md += `| [${m.model}](/m/${slug(m.model)}/) | ${m.provider} | $${m.price.toFixed(2)} | ${m.ii} | ${m.tps != null ? m.tps.toFixed(0) : '—'} |\n`;
md += `\n## Movement log\n\n`;
md += events.length ? events.map(e => `- **${now.toISOString().slice(0, 10)}** ${e.text}`).join('\n') + '\n' : `- ${now.toISOString().slice(0, 10)} no movement this refresh\n`;
if (prev?.log?.length) md += prev.log.slice(0, 30).join('\n') + '\n';
writeFileSync(OUT_MD, md);

mkdirSync(dirname(STATE), { recursive: true });
const log = [...(events.length ? [events.map(e => `- **${now.toISOString().slice(0, 10)}** ${e.text}`)] : []), ...(prev?.log || [])].slice(0, 30);
writeFileSync(STATE, JSON.stringify({ as_of: now.toISOString(), frontier, log }, null, 1));

// Phase 4 (plan 2026-08-29): durable committed event history + Atom feed.
// The feed source is data/frontier-events.generated.json (committed, unbounded
// history) — NOT .cache (gitignored + capped at 30, empty on fresh clones).
const DURABLE = join(ROOT, `data/frontier-events${PLANE === 'public' ? '.public' : ''}.generated.json`);
let history = existsSync(DURABLE) ? JSON.parse(readFileSync(DURABLE, 'utf8')) : seedFromLogLines(prev?.log);
history = mergeEvents(history, events.map(e => ({ date: now.toISOString().slice(0, 10), text: e.text })));
writeFileSync(DURABLE, JSON.stringify(history, null, 1));
writeFileSync(join(ROOT, 'public/frontier-watch.xml'), buildAtom(history));
console.log(`frontier-feed: ${history.length} events in durable history -> public/frontier-watch.xml`);

if (events.length && prev) {
  try {
    const res = await fireAlert(
      events.map(e => ({ key: e.key, kind: 'frontier', summary: e.text.slice(0, 140) })),
      { prefix: 'frontier-watch' },
    );
    console.log(`frontier-watch: ${events.length} movement(s) — alert ${res.fired ? 'fired' : `skipped (${res.reason})`}`);
  } catch (e) {
    console.error('frontier-watch alert error (non-fatal):', String(e).slice(0, 120));
  }
} else {
  console.log(prev ? 'frontier-watch: no movement' : `frontier-watch: baseline recorded (${frontier.length} models on frontier), no alert on first run`);
}
