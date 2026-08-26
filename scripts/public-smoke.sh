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

echo "[smoke] all content assertions passed (index, entry asset, blog, llms.txt, sitemap)"
exit 0
