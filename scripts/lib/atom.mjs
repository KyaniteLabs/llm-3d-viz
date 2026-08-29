// Atom feed for Frontier Watch — plan 2026-08-29 phase 4. Pure builders so the
// feed is unit-testable without executing frontier-watch's pipeline pass.
// Feed semantics: entries newest-first, <updated> = newest event date ONLY
// (no-movement runs must not bump it — readers churn otherwise); the durable
// committed history (data/frontier-events.generated.json) is the source, not
// the gitignored .cache (empty on fresh clones/OSS twin, capped at 30).
const ORIGIN = 'https://viz.kyanitelabs.tech';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function seedFromLogLines(logBatches) {
  // .cache log shape: array of arrays of markdown lines: "- **YYYY-MM-DD** TEXT"
  const out = [];
  for (const batch of logBatches || []) {
    for (const line of batch || []) {
      const m = String(line).match(/^- \*\*(\d{4}-\d{2}-\d{2})\*\* (.+)$/);
      if (m) out.push({ date: m[1], text: m[2] });
    }
  }
  return out;
}

export function mergeEvents(existing, fresh) {
  // dedup by date+text — reruns and seeds can overlap
  const seen = new Set(existing.map(e => `${e.date}|${e.text}`));
  const out = [...existing];
  for (const e of fresh) {
    const k = `${e.date}|${e.text}`;
    if (!seen.has(k)) { seen.add(k); out.push(e); }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function buildAtom(events, { limit = 50 } = {}) {
  const sorted = [...events].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const latest = sorted[0]?.date || '1970-01-01';
  const entries = sorted.slice(0, limit).map(e => {
    const id = `tag:kyanitelabs.tech,2026:frontier-watch/${e.date}/${esc(e.text).replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60)}`;
    return `  <entry>
    <id>${id}</id>
    <title>${esc(e.text)}</title>
    <updated>${e.date}T00:00:00Z</updated>
    <link rel="alternate" type="text/markdown" href="${ORIGIN}/frontier-watch.md"/>
  </entry>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Model Observatory — Frontier Watch</title>
  <subtitle>Measured Pareto frontier movements (price × intelligence), from the Kyanite Labs catalog.</subtitle>
  <id>tag:kyanitelabs.tech,2026:frontier-watch</id>
  <link rel="alternate" type="text/markdown" href="${ORIGIN}/frontier-watch.md"/>
  <link rel="self" href="${ORIGIN}/frontier-watch.xml"/>
  <updated>${latest}T00:00:00Z</updated>
${entries}
</feed>
`;
}
