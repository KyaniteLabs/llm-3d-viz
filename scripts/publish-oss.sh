#!/usr/bin/env bash
# publish-oss.sh — intentional OSS publish (dual-repo policy: docs/agents/dual-repo.md).
#
# Empowerment artifact 2026-08-20: the publish dance ran manually twice
# (oss-publish-2026-08-14, oss-publish-2026-08-20) and the second nearly
# shipped the private tailscale IP — caught only by a hand-run sweep. This
# script codifies the curation, FAILS HARD on scrub-pattern hits, preserves
# the OSS-edition (Liani) commit, and force-with-leases per the
# rebase-onto-product procedure.
#
# Usage: scripts/publish-oss.sh [--dry-run]
#   --dry-run  do everything except the final push (curation + sweep + build).
set -euo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

OSS_REMOTE=oss
OSS_BRANCH="oss-publish-$(date +%Y-%m-%d)"
# OSS-edition commits living only on the oss lineage (Liani simple-decision
# panel). Update if new OSS-only commits land.
OSS_EDITION_COMMIT="${OSS_EDITION_COMMIT:-68f92f3}"

# Scrub red lines — any hit aborts the publish. Private tailscale space, the
# VPS hostname, internal fleet installs, credential stores.
SWEEP_PATTERNS='100\.92\.|srv1542844|pushing-dispatch|\.git-credentials|forgejo-agent-token'

# Internal-only paths removed from the OSS tree (oss-publish-2026-08-14/-20
# precedent). Patterns tolerate absence.
INTERNAL_PATHS=(
  ".omx" "audits"
  "AGENTS.md" "HANDOFF.md" "CONTEXT.md"
  "docs/agents" "docs/research" "docs/v1"
  "docs/deploy/STATUS-"*.md "docs/deploy/vps-private-tailscale.md"
)

cd "$(git rev-parse --show-toplevel)"

echo "[oss-publish] preflight"
if ! git diff --quiet --ignore-submodules 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard | grep -v '^\.mimosa/' | head -1)" ]; then
  echo "ERROR: working tree dirty — commit first (only .mimosa/ is tolerated)." >&2
  exit 1
fi
git fetch origin -q
git fetch "$OSS_REMOTE" -q || true

echo "[oss-publish] branch $OSS_BRANCH off origin/main"
git checkout -q -B "$OSS_BRANCH" origin/main

echo "[oss-publish] removing internal-only paths"
EXISTING=()
for p in "${INTERNAL_PATHS[@]}"; do
  # shellcheck disable=SC2206
  [ -e "$p" ] && EXISTING+=("$p")
done
if [ ${#EXISTING[@]} -gt 0 ]; then
  git rm -rq "${EXISTING[@]}"
fi
git commit -qm "chore(oss): curation for $(date +%Y-%m-%d) publish (publish-oss.sh)" || true

echo "[oss-publish] cherry-picking OSS-edition commit $OSS_EDITION_COMMIT"
if git cherry "$OSS_BRANCH" "$OSS_EDITION_COMMIT" 2>/dev/null | grep -q '^+' \
   || ! git merge-base --is-ancestor "$OSS_EDITION_COMMIT" "$OSS_BRANCH" 2>/dev/null; then
  git cherry-pick "$OSS_EDITION_COMMIT" || {
    echo "ERROR: cherry-pick conflicted — resolve, commit, then rerun with OSS_EDITION_COMMIT=<new-sha> skipped." >&2
    exit 2
  }
fi

echo "[oss-publish] scrub sweep (patterns: $SWEEP_PATTERNS)"
HITS=$(git grep -lE "$SWEEP_PATTERNS" -- . || true)
if [ -n "$HITS" ]; then
  echo "ERROR: scrub red-line hit — publish aborted:" >&2
  echo "$HITS" >&2
  git checkout -q main
  exit 3
fi
echo "[oss-publish] sweep clean"

echo "[oss-publish] gate: tsc + build"
npx tsc --noEmit
npx vite build >/dev/null

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[oss-publish] DRY RUN — stopping before push. Branch $OSS_BRANCH is local; inspect then:"
  echo "  git push --force-with-lease $OSS_REMOTE $OSS_BRANCH:main && git checkout -q main"
  exit 0
fi

echo "[oss-publish] pushing $OSS_BRANCH -> $OSS_REMOTE/main (force-with-lease, rebase-onto-product procedure)"
git push --force-with-lease "$OSS_REMOTE" "$OSS_BRANCH:main"
git checkout -q main
echo "[oss-publish] DONE — oss/main = $(git rev-parse --short "$OSS_BRANCH")"
