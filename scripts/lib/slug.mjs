// Shared catalog slug rule — single owner (plan 2026-08-29, phase 1).
// gen-model-pages.mjs and frontier-watch.mjs MUST both use this; the
// frontier-watch inline copy lacked the trailing-dash strip and emitted
// dead /m/<slug>-/ links for every model name ending in ")".
export const slug = m =>
  String(m).toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
