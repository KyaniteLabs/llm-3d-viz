#!/usr/bin/env bash
# public-drift-check.sh — #206: alert when the public Pages deploy diverges
# from the private instance.
#
# Why: the public site (viz.kyanitelabs.tech) is approval-gated by design and
# NO pipeline path deploys it, so it silently drifts (2026-08-24: two weeks
# stale, surfaced as "missing models"). This check makes drift loud exactly
# once per alert-dedup TTL instead of waiting for a human to notice.
#
# Method: compare the ENTRY ASSET filename (content-hashed by the build) of
# public vs private index.html. Identical hash = identical app build.
# Read-only; never mutates anything; a fetch failure on either side is a SKIP
# (network blip), not drift. Alert fires via catalog-alerts.mjs --drift
# (kind-deduped: one issue per epoch, not one per hour).
#
# Env (from .env / .env.local — same loader convention as catalog-auto-update):
#   PRIVATE_ORIGIN  base URL of the private instance (NOT committed — the
#                   origin is scrubbed from the repo by policy). Unset ⇒ skip.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://viz.kyanitelabs.tech}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin${PATH:+:$PATH}"

mkdir -p "$LOG_DIR"
log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" >>"$LOG_DIR/public-drift-check.log"; }

for __envf in "$REPO_ROOT/.env" "$REPO_ROOT/.env.local"; do
  [ -f "$__envf" ] && set -a && . "$__envf" && set +a
done
unset __envf

if [[ -z "${PRIVATE_ORIGIN:-}" ]]; then
  log "skip: PRIVATE_ORIGIN not set — add it to .env (policy: never commit the origin)"
  exit 0
fi

entry_asset() {
  curl -sS --max-time 15 "$1/" 2>/dev/null \
    | grep -oE 'assets/index-[a-zA-Z0-9_-]+\.js' | head -1
}

pub="$(entry_asset "$PUBLIC_ORIGIN")"
priv="$(entry_asset "$PRIVATE_ORIGIN")"

if [[ -z "$pub" || -z "$priv" ]]; then
  log "skip: could not read entry asset (public='${pub:-none}' private='${priv:-none}') — network/origin unavailable"
  exit 0
fi

if [[ "$pub" == "$priv" ]]; then
  log "in-sync: $pub"
  exit 0
fi

log "DRIFT: public=$pub private=$priv — firing kind-deduped alert"
node "$REPO_ROOT/scripts/lib/catalog-alerts.mjs" --drift "public=$pub private=$priv" \
  >>"$LOG_DIR/public-drift-check.log" 2>&1 || true
exit 0
