#!/usr/bin/env bash
# public-smoke.sh — #206: content-asserted post-deploy smoke for the public site.
#
# Doctrine (BUG-SMELL-REGISTRY 2026-08-24): a "page is live" claim must assert
# page CONTENT, never HTTP status alone — the Pages SPA fallback returns 200 +
# the app shell for ANY path (the launch-post false-positive). Every check
# here greps rendered/fetched CONTENT.
#
# Usage: bash scripts/public-smoke.sh [PUBLIC_ORIGIN]
# Exits non-zero with a named failure if any assertion breaks.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PUBLIC_ORIGIN="${1:-${PUBLIC_ORIGIN:-https://viz.kyanitelabs.tech}}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin${PATH:+:$PATH}"

fail() { echo "SMOKE-FAIL: $*" >&2; exit 1; }
fetch() { curl -sS --max-time 20 "$1" || echo ""; }

echo "[smoke] public origin: $PUBLIC_ORIGIN"

# 1) App shell serves and names the app (title content, not just 200).
index_html="$(fetch "$PUBLIC_ORIGIN/")"
[[ "$index_html" == *"Model Observatory"* ]] || fail "index.html does not name the Model Observatory"

# 2) The entry asset exists and carries real content (not an empty chunk).
entry="$(printf '%s' "$index_html" | grep -oE 'assets/index-[a-zA-Z0-9_-]+\.js' | head -1)"
[[ -n "$entry" ]] || fail "no entry asset in index.html"
bundle="$(fetch "$PUBLIC_ORIGIN/$entry")"
[[ -n "$bundle" && ${#bundle} -gt 100000 ]] || fail "entry asset missing or implausibly small"
[[ "$bundle" == *"Pareto"* ]] || fail "entry asset lacks app vocabulary (Pareto) — wrong or broken bundle"

# 3) Blog post serves its OWN page (unique title fragment), not the SPA shell
#    — the exact 2026-08-24 false-positive class.
blog="$(fetch "$PUBLIC_ORIGIN/blog/2026-08-24-model-observatory/")"
[[ "$blog" == *"We Built an Open-Source Model Observatory"* ]] || fail "blog URL serves the SPA shell, not the post"

# 4) llms.txt is real content and links the blog.
llms="$(fetch "$PUBLIC_ORIGIN/llms.txt")"
[[ "$llms" == *"# Model Observatory"* ]] || fail "llms.txt missing its header"
[[ "$llms" == *"blog/2026-08-24-model-observatory/"* ]] || fail "llms.txt does not link the launch post"

# 5) Sitemap carries the blog entry.
sitemap="$(fetch "$PUBLIC_ORIGIN/sitemap.xml")"
[[ "$sitemap" == *"blog/2026-08-24-model-observatory/"* ]] || fail "sitemap lacks the blog URL"

# 6) Optional model-presence assertion: pass a model name via SMOKE_MODEL.
if [[ -n "${SMOKE_MODEL:-}" ]]; then
  [[ "$bundle" == *"$SMOKE_MODEL"* ]] || fail "model '$SMOKE_MODEL' missing from the served bundle"
fi

# 7) Model card serves a REAL generated page with phase-1 SEO surface
#    (canonical + JSON-LD + provenance chips), not the SPA shell.
#    SMOKE_SLUG selects the card (default: first entry from the sitemap).
smoke_slug="${SMOKE_SLUG:-}"
if [[ -z "$smoke_slug" ]]; then
  smoke_slug="$(printf '%s' "$sitemap" | grep -oE '/m/[a-z0-9-]+/' | head -1 | sed 's|^/m/||; s|/$||')"
fi
if [[ -n "$smoke_slug" ]]; then
  card="$(fetch "$PUBLIC_ORIGIN/m/$smoke_slug/")"
  [[ "$card" == *"measured model card"* ]] || fail "/m/$smoke_slug/ is not a generated card (SPA shell?)"
  [[ "$card" == *'rel=canonical'* ]] || fail "/m/$smoke_slug/ lacks canonical link"
  [[ "$card" == *'application/ld+json'* ]] || fail "/m/$smoke_slug/ lacks JSON-LD"
  [[ "$card" == *"Generated page"* ]] || fail "/m/$smoke_slug/ lacks generator provenance note"
fi

# 8) Embed lane: card content AND the frame-ancestors header that makes the
#    advertised iframe snippet actually work (plan 2026-08-29 phase 0 — the
#    global X-Frame-Options: DENY used to kill every embed on this origin).
if [[ -n "$smoke_slug" ]]; then
  embed="$(fetch "$PUBLIC_ORIGIN/embed/$smoke_slug")"
  [[ "$embed" == *"model card"* ]] || fail "/embed/$smoke_slug is not a generated embed card"
  # Pages 308-strips .html; follow redirects so we assert the header on the final URL.
  embed_headers="$(curl -sSLI --max-time 20 "$PUBLIC_ORIGIN/embed/$smoke_slug" 2>/dev/null || true)"
  [[ "$embed_headers" == *"frame-ancestors"* ]] || fail "embed lane missing Content-Security-Policy frame-ancestors (embeds dead under XFO DENY)"
fi

# 8b) Compare lane: at least one staged compare page serves REAL generated
#     content (verdict block + canonical), not the SPA shell.
compare_slug="$(printf '%s' "$sitemap" | grep -oE '/compare/[a-z0-9-]+-vs-[a-z0-9-]+/' | head -1)"
if [[ -n "$compare_slug" ]]; then
  cmp_page="$(fetch "$PUBLIC_ORIGIN$compare_slug")"
  [[ "$cmp_page" == *"measured comparison"* ]] || fail "compare page $compare_slug is not generated (SPA shell?)"
  [[ "$cmp_page" == *'class="verdict'* ]] || fail "compare page $compare_slug lacks its verdict block"
  [[ "$cmp_page" == *'rel=canonical'* ]] || fail "compare page $compare_slug lacks canonical"
else
  fail "sitemap lists no /compare/ URLs — staged compare surface missing"
fi

echo "[smoke] all content assertions passed (index, entry asset, blog, llms.txt, sitemap, model card, embed lane, compare lane)"
exit 0
