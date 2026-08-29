// Pareto frontier kernel — measured price ↓ × intelligence ↑. Extracted from
// frontier-watch.mjs (plan 2026-08-29 phase 2) so libraries can use the
// kernel without executing frontier-watch's top-level pipeline pass.
export function computeFrontier(rows) {
  const cands = rows.filter(r => r.blended_price_per_M != null && r.aa_intelligence_index != null);
  const dominated = new Set();
  for (const a of cands) {
    for (const b of cands) {
      if (a === b) continue;
      // b dominates a: cheaper-or-equal AND smarter, at least one strict
      if (b.blended_price_per_M <= a.blended_price_per_M && b.aa_intelligence_index >= a.aa_intelligence_index &&
          (b.blended_price_per_M < a.blended_price_per_M || b.aa_intelligence_index > a.aa_intelligence_index)) {
        dominated.add(a.model); break;
      }
    }
  }
  return cands.filter(r => !dominated.has(r.model))
    .sort((x, y) => x.blended_price_per_M - y.blended_price_per_M)
    .map(r => ({ model: r.model, provider: r.provider, price: r.blended_price_per_M, ii: r.aa_intelligence_index, tps: r.tps }));
}
