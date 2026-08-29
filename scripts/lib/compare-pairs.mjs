// Compare-page pair selection — shared by gen-model-pages (comparisons block)
// and gen-compare-pages (page emission). Single owner so both generators see
// identical pairs with no build-order coupling. Plan 2026-08-29 phase 2:
// bounded, staged (~250 pages), unordered-pair canonical URLs, pairs only
// among models with BOTH price and intelligence measured.
import { slug } from './slug.mjs';
import { computeFrontier } from './frontier.mjs';

export function comparePath(a, b) {
  const [x, y] = [slug(a), slug(b)].sort();
  return `/compare/${x}-vs-${y}/`;
}

// k=2 nearest neighbors by intelligence for every measured model, plus
// adjacency along the Pareto frontier. Deduped unordered pairs, sorted for
// determinism, capped at the staged-rollout bound (raise only at the GSC
// checkpoint — never silently).
export function selectComparePairsDetailed(rows, { cap = 250 } = {}) {
  const measured = rows.filter(r => r.blended_price_per_M != null && r.aa_intelligence_index != null);
  const pairs = new Map(); // path -> {a, b} model names
  const add = (a, b) => {
    if (!a || !b || a === b) return;
    pairs.set(comparePath(a, b), { a, b });
  };

  const sorted = [...measured].sort((x, y) => x.aa_intelligence_index - y.aa_intelligence_index);
  sorted.forEach((r, i) => {
    add(r.model, sorted[i - 1]?.model);
    add(r.model, sorted[i + 1]?.model);
  });

  const frontier = computeFrontier(measured);
  for (let i = 0; i + 1 < frontier.length; i++) add(frontier[i].model, frontier[i + 1].model);

  return [...pairs.entries()].sort(([p], [q]) => p.localeCompare(q)).slice(0, cap)
    .map(([path, { a, b }]) => ({ path, a, b }));
}

export function selectComparePairs(rows, opts) {
  return selectComparePairsDetailed(rows, opts).map(d => d.path);
}
